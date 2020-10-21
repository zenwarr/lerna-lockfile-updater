import * as path from "path";
import { getClosestParentModulesDir } from "./Utils";
import { BuildContext } from "./Interfaces";
import { readManifestIfExists } from "./ManifestReader";
import { findMetaInYarnLock, getYarnLockDir, readYarnLockIfExists } from "./YarnLock";


export interface MetaInfo {
  resolved?: string;
  integrity?: string;
}


/**
 * Tries to resolve information for `resolved` and `integrity` fields for given package
 * @param ctx
 * @param dir Directory for package to resolve information on
 */
export function getMetaInfo(ctx: BuildContext, dir: string): MetaInfo {
  let manifest = readManifestIfExists(dir);
  if (!manifest) {
    return {};
  }

  if (ctx.isYarn) {
    let yarnLockDir = getYarnLockDir(dir);
    if (!yarnLockDir) {
      return {};
    }

    let lockfile = readYarnLockIfExists(yarnLockDir);
    if (!lockfile) {
      return {};
    }

    return findMetaInYarnLock(lockfile, manifest.name, manifest.version);
  } else {
    return {
      resolved: manifest._resolved,
      integrity: manifest._integrity
    };
  }
}
