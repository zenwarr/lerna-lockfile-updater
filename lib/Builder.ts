import * as path from "path";
import * as fs from "fs";
import * as resolvePackagePath from "resolve-package-path";
import { BuildContext, Entry } from "./Interfaces";
import { walkEntries, walkNonSubsetDeps } from "./Walkers";
import { readFileFromHeadOrNow } from "./GitUtils";
import { transformInto } from "./TransformObject";
import { readManifest, readManifestIfExists } from "./ManifestReader";
import { getOwnerDir } from "./Utils";
import { getMetaInfo, MetaInfo } from "./MetaInfoResolver";
import { getYarnLockDir, readYarnLockIfExists } from "./YarnLock";


/**
 * Returns directory where package is located when required from directory `fromDir`
 * @param fromDir Directory from where to resolve the package
 * @param packageName Package name
 */
function resolvePackageLocation(fromDir: string, packageName: string): string | undefined {
  const result = resolvePackagePath(packageName, fromDir);
  return result ? path.dirname(result) : undefined;
}


/**
 * Checks if package is available from given directory
 */
function isInstalled(dir: string, packageName: string): boolean {
  return !!resolvePackageLocation(dir, packageName);
}


/**
 * Returns map of dependencies of a package located at given directory.
 * Only returns installed packages.
 * For example, if an optional dependency is not installed, it is not going to be returned.
 * Result is compatible with package-lock `requires` field format.
 */
function getRequires(dir: string, includeDev: boolean = false) {
  let manifest = readManifest(dir);

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


/**
 * Given location of `node_modules` directory a package is located in, returns `dependencies` object where the entry for this package should be added.
 */
function getOwnerForDir(ctx: BuildContext, moduleDir: string): Entry {
  return ctx.dirEntries.get(moduleDir) || ctx.root;
}


function buildEntryWithoutDeps(ctx: BuildContext | undefined, dir: string, isRoot: boolean, yarnLock: any): Entry {
  const manifest = readManifest(dir);
  const requires = getRequires(dir, isRoot);

  return {
    version: manifest.version,
    ...getMetaInfo(ctx, dir, yarnLock),
    requires: requires,
    dependencies: {}
  };
}


function processEntryDeps(ctx: BuildContext, entry: Entry, dir: string): void {
  ctx.visitedDirs.add(dir);
  ctx.dirEntries.set(dir, entry);

  const jobs: { entry: Entry, dir: string }[] = [];
  for (let depName of Object.keys(entry.requires || {})) {
    // find where dependency of this package is installed
    let resolvedDir = resolvePackageLocation(dir, depName);
    if (!resolvedDir) {
      throw new Error(`Package ${ depName } not found (starting from ${ dir })`);
    }

    if (ctx.visitedDirs.has(resolvedDir)) {
      continue;
    }

    const depEntry = buildEntryWithoutDeps(ctx, resolvedDir, false, ctx.yarnLock);

    // and based on this directory, find in which `dependencies` object the entry should be added (if we need to add it)
    let owner: Entry;

    let modulesDir = getOwnerDir(resolvedDir);
    if (!modulesDir) {
      if (!ctx.root.dependencies) {
        ctx.root.dependencies = {};
      }
      owner = ctx.root;
    } else {
      owner = getOwnerForDir(ctx, modulesDir);
    }

    if (!owner.dependencies) {
      owner.dependencies = {};
    }

    const existingEntry = owner.dependencies[depName];
    if (existingEntry && existingEntry.version !== depEntry.version) {
      owner = entry;
    }

    if (!owner.dependencies) {
      owner.dependencies = {};
    }

    if (!(depName in owner.dependencies)) {
      owner.dependencies[depName] = depEntry;
      depEntry.owner = owner;
      jobs.push({ entry: depEntry, dir: resolvedDir });
    }
  }

  for (const job of jobs) {
    processEntryDeps(ctx, job.entry, job.dir);
  }
}


/**
 * Generates lockfile for a package located at given directory
 */
function generateLockfile(dir: string, localModulesMeta?: Map<string, MetaInfo>): object | undefined {
  let yarnLockDir = getYarnLockDir(dir);

  let yarnLock = yarnLockDir ? readYarnLockIfExists(yarnLockDir) : undefined;
  let ctx: BuildContext = {
    yarnLock,
    startDir: dir,
    root: buildEntryWithoutDeps(undefined, dir, true, yarnLock),
    visitedDirs: new Set(),
    dirEntries: new Map(),
    localModulesMeta: localModulesMeta || new Map()
  };

  let manifest = readManifestIfExists(dir);
  if (!manifest) {
    return undefined;
  }

  processEntryDeps(ctx, ctx.root, dir);

  markDevDeps(ctx);
  markOptionalDeps(ctx);

  walkEntries(ctx.root.dependencies, dep => {
    if (dep.dependencies && !Object.keys(dep.dependencies).length) {
      delete dep.dependencies;
    }

    if (dep.requires && !Object.keys(dep.requires).length) {
      delete dep.requires;
    }

    delete dep.owner;
  });

  return {
    name: manifest.name,
    version: ctx.root.version,
    lockfileVersion: 1,
    requires: true,
    dependencies: ctx.root.dependencies
  };
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


function markDevDeps(ctx: BuildContext) {
  let manifest = readManifest(ctx.startDir);
  let nonDevDeps = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  };

  walkNonSubsetDeps(ctx, Object.keys(nonDevDeps), e => {
    e.dev = true;
  });
}


function markOptionalDeps(ctx: BuildContext) {
  let manifest = readManifest(ctx.startDir);
  let nonOptionalDeps = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies
  };

  walkNonSubsetDeps(ctx, Object.keys(nonOptionalDeps), e => {
    e.optional = true;
  });
}


export async function generateLockFile(dir: string, localModulesMeta?: Map<string, MetaInfo>) {
  let lockfile = generateLockfile(dir, localModulesMeta);
  if (lockfile) {
    await saveLockfile(dir, lockfile);
  } else {
    console.log("No packages found in given directory, skipped");
  }
}


export async function updateLocks(dirs: string[]) {
  for (let dir of dirs) {
    dir = path.resolve(process.cwd(), dir);
    console.log(`Generating lockfile for ${ dir }...`);

    try {
      await generateLockFile(dir);
    } catch (e) {
      console.error(`Error generating lockfile for package ${ dir }: ${ e.message }`, e);
    }
  }
}
