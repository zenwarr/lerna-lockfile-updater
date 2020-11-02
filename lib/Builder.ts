import * as path from "path";
import * as fs from "fs";
import { BuildContext, Entry, EntryDeps } from "./Interfaces";
import { walkEntries, walkNonSubsetDeps } from "./Walkers";
import { readFileFromHeadOrNow } from "./GitUtils";
import { transformInto } from "./TransformObject";
import { readManifest, readManifestIfExists } from "./ManifestReader";
import { getOwnerDir } from "./Utils";
import { getMetaInfo } from "./MetaInfoResolver";
import { getYarnLockDir, readYarnLockIfExists } from "./YarnLock";


/**
 * Returns directory where package is located when required from directory `fromDir`
 * @param fromDir Directory from where to resolve the package
 * @param packageName Package name
 */
function resolvePackageLocation(fromDir: string, packageName: string): string {
  return path.dirname(require.resolve(packageName + "/package.json", {
    paths: [ fromDir ]
  }));
}


/**
 * Checks if package is available from given directory
 */
function isInstalled(dir: string, packageName: string): boolean {
  try {
    resolvePackageLocation(dir, packageName);
    return true;
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      return false;
    }
    throw error;
  }
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
function getDependenciesObjectForDir(ctx: BuildContext, moduleDir: string): EntryDeps {
  let target = ctx.dirEntries.get(moduleDir);
  if (!target) {
    target = ctx.root;
  }

  if (!target.dependencies) {
    target.dependencies = {};
  }

  return target.dependencies;
}


function buildLockfileEntryWithoutDeps(dir: string, isRoot: boolean, yarnLock: any): Entry {
  const manifest = readManifest(dir);
  const requires = getRequires(dir, isRoot);

  return {
    version: manifest.version,
    ...getMetaInfo(dir, yarnLock),
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
    if (ctx.visitedDirs.has(resolvedDir)) {
      continue;
    }

    const depEntry = buildLockfileEntryWithoutDeps(resolvedDir, false, ctx.yarnLock);

    // and based on this directory, find in which `dependencies` object the entry should be added (if we need to add it)
    let depsObject: EntryDeps;

    let modulesDir = getOwnerDir(resolvedDir);
    if (!modulesDir) {
      if (!ctx.root.dependencies) {
        ctx.root.dependencies = {};
      }
      depsObject = ctx.root.dependencies;
    } else {
      depsObject = getDependenciesObjectForDir(ctx, modulesDir);
    }

    const existingEntry = depsObject[depName];
    if (existingEntry && existingEntry.version !== depEntry.version) {
      if (!entry.dependencies) {
        entry.dependencies = {};
      }
      depsObject = entry.dependencies;
    }

    if (!(depName in depsObject)) {
      depsObject[depName] = depEntry;
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
function generateLockfile(dir: string): object | undefined {
  let yarnLockDir = getYarnLockDir(dir);

  let yarnLock = yarnLockDir ? readYarnLockIfExists(yarnLockDir) : undefined;
  let ctx: BuildContext = {
    yarnLock,
    startDir: dir,
    root: buildLockfileEntryWithoutDeps(dir, true, yarnLock),
    visitedDirs: new Set(),
    dirEntries: new Map()
  };

  let manifest = readManifestIfExists(dir);
  if (!manifest) {
    return undefined;
  }

  processEntryDeps(ctx, ctx.root, dir);

  walkEntries(ctx.root.dependencies, dep => {
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


export async function generateLockFile(dir: string) {
  let lockfile = generateLockfile(dir);
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
