#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";


function readModulePackage(moduleDir: string): any {
  return JSON.parse(fs.readFileSync(path.join(moduleDir, "package.json"), "utf-8"));
}


function readModulePackageIfExists(moduleDir: string): any | undefined {
  try {
    return readModulePackage(moduleDir);
  } catch (e) {
    if (e.code === "ENOENT") {
      return undefined;
    } else {
      throw e;
    }
  }
}


let workspaceLockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf-8"));


interface ModuleCtx {
  dir: string;
  rootDeps: { [name: string]: object };
}


function processLocallyInstalled(ctx: ModuleCtx, lockfileEntry: any, parentLocals: string[]) {
  if (!lockfileEntry.requires) {
    return;
  }

  let directLocals = lockfileEntry.dependencies || {};

  let locallyInstalled = [
    ...parentLocals,
    ...Object.keys(directLocals)
  ];

  for (let key of Object.keys(directLocals)) {
    processLocallyInstalled(ctx, directLocals[key], locallyInstalled);
  }

  for (let key of Object.keys(lockfileEntry.requires)) {
    if (!locallyInstalled.includes(key)) {
      hoistToTop(ctx, key);
    }
  }
}

function hoistToTop(ctx: ModuleCtx, pkg: string): boolean {
  let lockfileEntry = workspaceLockfile.dependencies[pkg];
  if (!lockfileEntry) {
    return false;
  }

  if (pkg in ctx.rootDeps) {
    return true;
  }

  ctx.rootDeps[pkg] = lockfileEntry;
  processLocallyInstalled(ctx, lockfileEntry, []);
  return true;
}

function getDepsFromPackageIfExists(packageDir: string, includeDev: boolean): { [name: string]: any } | undefined {
  let packageJSON = readModulePackage(packageDir);
  if (!packageJSON) {
    return undefined;
  }

  return {
    ...packageJSON.dependencies,
    ...(includeDev ? packageJSON.devDependencies : undefined),
    ...packageJSON.peerDependencies
  };
}

function addDepsFromPackage(ctx: ModuleCtx, packageDir: string, isRoot: boolean) {
  let deps = getDepsFromPackageIfExists(packageDir, isRoot);
  if (!deps) {
    return;
  }

  for (let pkg of Object.keys(deps)) {
    hoistToTop(ctx, pkg);
  }

  for (let key of Object.keys(deps)) {
    if (!(key in workspaceLockfile.dependencies)) {
      let entry = createLockfileEntryFromDep(ctx, packageDir, key);
      if (entry != null) {
        ctx.rootDeps[key] = entry.entry;
      }

      addDepsFromPackage(ctx, path.join(packageDir, "node_modules", key), false);
    }
  }
}

function createLockfileEntryFromDep(ctx: ModuleCtx, packageDir: string, depName: string): { hoist: boolean, entry: object } | undefined {
  let depDir = path.join(packageDir, "node_modules", depName);
  let manifest = readModulePackageIfExists(path.join(depDir));
  if (!manifest) {
    return undefined;
  }

  let requires = {
    ...manifest.dependencies,
    ...manifest.peerDependencies
  };

  let entry = {
    version: manifest.version,
    resolved: manifest._resolved,
    integrity: manifest._integrity,
    requires: requires,
    dependencies: {}
  };

  for (let dep of Object.keys(requires)) {
    let childEntry = createLockfileEntryFromDep(ctx, depDir, dep);
    if (childEntry) {
      if (childEntry.hoist) {
        ctx.rootDeps[dep] = childEntry.entry;
      } else {
        entry.dependencies[dep] = childEntry.entry;
      }
    }
  }

  if (!Object.keys(entry.requires).length) {
    delete entry.requires;
  }

  if (!Object.keys(entry.dependencies).length) {
    delete entry.dependencies;
  }

  let lstat = fs.lstatSync(depDir);

  return { hoist: lstat.isSymbolicLink(), entry };
}

function saveLockfile(ctx: ModuleCtx) {
  let pkg = readModulePackage(ctx.dir);
  let lockfile = {
    name: pkg.name,
    version: pkg.version,
    requires: true,
    lockfileVersion: 1,
    dependencies: ctx.rootDeps
  };

  let lockfileLocation = path.join(ctx.dir, "package-lock.json");

  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(lockfileLocation, "utf-8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      existing = {};
    } else {
      throw e;
    }
  }

  fs.writeFileSync(lockfileLocation, JSON.stringify(merge(existing, lockfile), undefined, 2), "utf-8");
}

function markDevDeps(ctx: ModuleCtx) {
  let nodes = new Map<string, boolean>();
  let manifest = readModulePackage(ctx.dir);
  let devDeps = manifest.devDependencies || {};
  let nonDevDeps = {
    ...manifest.dependencies,
    ...manifest.peerDependencies
  };

  let walked = new Set<string>();
  for (let depName of Object.keys(devDeps)) {
    let entry = ctx.rootDeps[depName];
    if (!entry) {
      continue;
    }

    walkDeps(ctx, "", nodes, depName, entry, true, [], walked);
  }

  if (!nodes.size) {
    return;
  }

  walked = new Set<string>();
  for (let depName of Object.keys(nonDevDeps)) {
    let entry = ctx.rootDeps[depName];
    if (!entry) {
      continue;
    }

    walkDeps(ctx, "", nodes, depName, entry, false, [], walked);
  }

  nodes.forEach((isDev, entryPath) => {
    if (isDev) {
      _.set(ctx.rootDeps, entryPath + ".dev", true);
    }
  });
}

function walkDeps(ctx: ModuleCtx, pathPrefix: string, nodes: Map<string, boolean>, entryName: string, entry: any, isDev: boolean, parentLocals: string[], walked: Set<string>) {
  let entryPath = pathPrefix ? pathPrefix + ".dependencies." + entryName : entryName;
  if (walked.has(entryPath)) {
    return;
  }

  if (!nodes.has(entryPath)) {
    nodes.set(entryPath, isDev);
  }

  walked.add(entryPath);

  let requires = entry.requires || {};
  let localDeps = entry.dependencies || {};
  for (let depName of Object.keys(requires)) {
    if (depName in localDeps) {
      walkDeps(ctx, entryPath, nodes, depName, localDeps[depName], isDev, [
        ...parentLocals,
        ...Object.keys(localDeps)
      ], walked);
    } else if (!parentLocals.includes(depName)) {
      walkDeps(ctx, "", nodes, depName, ctx.rootDeps[depName], isDev, [], walked);
    }
  }
}

function isObject(x: unknown): x is object {
  return typeof x === "object" && x != null;
}

function merge(into: any, actual: any): any {
  if (!(isObject(into) && isObject(actual))) {
    return actual;
  }

  if (Array.isArray(into) || Array.isArray(actual)) {
    return actual;
  }

  for (let key of Object.keys(into)) {
    if (key in actual) {
      into[key] = merge(into[key], actual[key]);
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


function updateLocks() {
  let dir = process.argv[2] || "packages";
  for (let entryName of fs.readdirSync(dir)) {
    let pkgDir = path.join(dir, entryName);

    let stat = fs.statSync(pkgDir);
    if (!stat.isDirectory()) {
      continue;
    }

    let ctx: ModuleCtx = {
      dir: pkgDir,
      rootDeps: {}
    };

    addDepsFromPackage(ctx, pkgDir, true);
    markDevDeps(ctx);
    saveLockfile(ctx);
  }
}


updateLocks();
