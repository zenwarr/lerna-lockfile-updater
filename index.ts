#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";


class ManifestReader {
  private _cache: { [path: string]: any } = {};

  private _readFile(location: string) {
    return JSON.parse(fs.readFileSync(location, "utf-8"));
  }

  private _readFileIfExists(location: string) {
    try {
      return this._readFile(location);
    } catch (e) {
      if (e.code === "ENOENT") {
        return null;
      }

      throw e;
    }
  }

  public read(dir: string) {
    let location = path.join(dir, "package.json");

    if (!(location in this._cache)) {
      this._cache[location] = this._readFile(location);
    }

    return this._cache[location];
  }

  public readIfExists(dir: string) {
    let location = path.join(dir, "package.json");

    if (!(location in this._cache)) {
      this._cache[location] = this._readFileIfExists(location);
    }

    return this._cache[location];
  }
}


let manifestReader = new ManifestReader();


function resolveLocation(from: string, packageName: string): string {
  return path.dirname(require.resolve(packageName + "/package.json", {
    paths: [ from ]
  }));
}


type EntryDeps = { [name: string]: Entry }


interface Entry {
  version: string;
  integrity: string | undefined;
  resolved: string | undefined;
  requires: { [name: string]: string } | undefined;
  dependencies: EntryDeps | undefined;
  dev?: boolean;
  optional?: boolean;
}


interface BuildContext {
  packagesDir: string;
  startDir: string;
  rootDeps: EntryDeps;
  visited: Set<string>;
  moduleDirs: Map<string, Entry | null>;
  resolves: Map<Entry, Map<string, Entry>>;
}


function isInstalled(dir: string, packageName: string): boolean {
  try {
    resolveLocation(dir, packageName);
    return true;
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      return false;
    }
    throw error;
  }
}


function getRequires(dir: string, includeDev: boolean = false) {
  let manifest = manifestReader.read(dir);

  let requires = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...(includeDev ? manifest.devDependencies : null)
  };

  for (let packageName of Object.keys(requires)) {
    if (!isInstalled(dir, packageName)) {
      delete requires[packageName];
    }
  }

  return requires;
}


function getModulesDir(location: string): string | undefined {
  let root = path.parse(location).root;

  while (true) {
    if (path.basename(location) === "node_modules") {
      return location;
    } else if (location === root) {
      return undefined;
    }

    location = path.dirname(location);
  }
}


function getDependencyTarget(ctx: BuildContext, modulesDir: string): EntryDeps {
  modulesDir = path.dirname(modulesDir);

  let target = ctx.moduleDirs.get(modulesDir);
  if (!target) {
    return ctx.rootDeps;
  } else if (!target.dependencies) {
    target.dependencies = {};
  }

  return target.dependencies;
}


function buildLockfileEntry(ctx: BuildContext, dir: string, includeDev: boolean): Entry {
  let manifest = manifestReader.read(dir);

  let requires = getRequires(dir, includeDev);

  let entry: Entry = {
    version: manifest.version,
    integrity: manifest._integrity,
    resolved: manifest._resolved,
    requires: requires,
    dependencies: {}
  };

  ctx.visited.add(dir);
  ctx.moduleDirs.set(dir, entry);

  let entryResolves = new Map<string, Entry>();
  ctx.resolves.set(entry, entryResolves);

  for (let depName of Object.keys(requires)) {
    let resolvedDir = resolveLocation(dir, depName);
    if (ctx.visited.has(resolvedDir)) {
      continue;
    }

    let depsObject: EntryDeps;

    let modulesDir = getModulesDir(resolvedDir);
    if (!modulesDir) {
      depsObject = ctx.rootDeps;
    } else {
      depsObject = getDependencyTarget(ctx, modulesDir);
    }

    if (!(depName in depsObject)) {
      let depEntry = buildLockfileEntry(ctx, resolvedDir, false);
      depsObject[depName] = depEntry;
      entryResolves.set(depName, depEntry);
    } else {
      let depEntry = depsObject[depName];
      entryResolves.set(depName, depEntry);
    }
  }

  return entry;
}


function build(dir: string, packagesDir: string) {
  let ctx: BuildContext = {
    packagesDir,
    startDir: dir,
    rootDeps: {},
    visited: new Set(),
    moduleDirs: new Map(),
    resolves: new Map(),
  };

  let manifest = manifestReader.read(dir);

  let entry = buildLockfileEntry(ctx, dir, true);
  ctx.rootDeps = {
    ...entry.dependencies,
    ...ctx.rootDeps
  };

  walkEntries(ctx.rootDeps, dep => {
    if (dep.dependencies && !Object.keys(dep.dependencies).length) {
      delete dep.dependencies;
    }

    if (dep.requires && !Object.keys(dep.requires).length) {
      delete dep.requires;
    }
  });

  markDevDeps(ctx);
  markOptionalDeps(ctx);

  return {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 1,
    requires: true,
    dependencies: ctx.rootDeps
  };
}


function walkEntries(deps: EntryDeps | undefined, walker: (dep: Entry) => void) {
  if (!deps) {
    return;
  }

  for (let name of Object.keys(deps)) {
    walkEntries(deps[name].dependencies, walker);
    walker(deps[name]);
  }
}


function walkDeps(ctx: BuildContext, entry: Entry, walker: (dep: Entry) => void, walked?: Set<Entry>) {
  if (!walked) {
    walked = new Set<Entry>();
  }

  if (!entry.requires) {
    return;
  }

  for (let packageName of Object.keys(entry.requires)) {
    let entryResolves = ctx.resolves.get(entry);
    if (!entryResolves) {
      throw new Error("Entry resolves not found");
    }

    let resolvedEntry = entryResolves.get(packageName);
    if (!resolvedEntry) {
      continue;
    }

    walked.add(resolvedEntry);
    walker(resolvedEntry);

    walkDeps(ctx, resolvedEntry, walker, walked);
  }
}


async function saveLockfile(dir: string, lockfile: any) {
  let lockfileLocation = path.join(dir, "package-lock.json");
  let originalContents = await readFileFromHeadOrNow(lockfileLocation);

  let original = {};
  try {
    original = JSON.parse(originalContents || "");
  } catch (e) {
    // do nothing
  }

  fs.writeFileSync(lockfileLocation, JSON.stringify(transformInto(original, lockfile), undefined, 2), "utf-8");
}

function markNonSubsetDeps(ctx: BuildContext, subset: string[], marker: (entry: Entry) => void) {
  let subsetDeps = new Set<Entry>();
  for (let packageName of subset) {
    let entry = ctx.rootDeps[packageName];
    if (!entry) {
      continue;
    }

    subsetDeps.add(entry);
    walkDeps(ctx, entry, e => subsetDeps.add(e));
  }

  walkEntries(ctx.rootDeps, e => {
    if (!subsetDeps.has(e)) {
      marker(e);
    }
  });
}

function markDevDeps(ctx: BuildContext) {
  let manifest = manifestReader.read(ctx.startDir);
  let nonDevDeps = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  };

  markNonSubsetDeps(ctx, Object.keys(nonDevDeps), e => {
    e.dev = true;
  });
}

function markOptionalDeps(ctx: BuildContext) {
  let manifest = manifestReader.read(ctx.startDir);
  let nonOptionalDeps = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies
  };

  markNonSubsetDeps(ctx, Object.keys(nonOptionalDeps), e => {
    e.optional = true;
  });
}

function isObject(x: unknown): boolean {
  return typeof x === "object" && x != null;
}

function transformInto(into: any, actual: any): any {
  if (!(isObject(into) && isObject(actual))) {
    return actual;
  }

  if (Array.isArray(into) || Array.isArray(actual)) {
    return actual;
  }

  for (let key of Object.keys(into)) {
    if (key in actual) {
      into[key] = transformInto(into[key], actual[key]);
    } else {
      delete into[key];
    }
  }

  for (let key of Object.keys(actual)) {
    if (!(key in into)) {
      into[key] = actual[key];
    }
  }

  return into;
}


async function readFileFromHeadOrNow(filepath: string): Promise<string | undefined> {
  let currentFile: string | undefined;
  try {
    currentFile = fs.readFileSync(filepath, "utf-8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return new Promise<string>(resolve => {
    let dir = path.dirname(filepath);
    let filename = path.basename(filepath);
    child_process.execFile("git", [ "show", `HEAD:./${ filename }` ], {
      cwd: dir
    }, (err, stdout, stderr) => {
      if (err != null) {
        console.warn(`Failed to get "${ filename }" contents at HEAD, falling back to actual state...`, stderr);
      }
      resolve(err != null ? currentFile : stdout);
    });
  });
}

async function updateLocks() {
  let dir = process.argv[2] || "packages";
  dir = path.resolve(process.cwd(), dir);
  for (let entryName of fs.readdirSync(dir)) {
    console.log(`Generating lockfile for ${ entryName }...`);
    let pkgDir = path.join(dir, entryName);

    let stat = fs.statSync(pkgDir);
    if (!stat.isDirectory()) {
      continue;
    }

    await saveLockfile(pkgDir, build(pkgDir, dir));
  }

  let topDir = path.dirname(dir);
  console.log(`Generating lockfile for workspace root...`);
  await saveLockfile(topDir, build(topDir, dir));
}


updateLocks().catch(error => {
  console.error(`Error while updating lockfiles: ${ error.message }`, error);
});
