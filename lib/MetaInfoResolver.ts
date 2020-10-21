import * as path from "path";
import { getClosestParentModulesDir } from "./Utils";
import { BuildContext } from "./Interfaces";
import { readManifestIfExists } from "./ManifestReader";
import { findMetaInYarnLock, readYarnLockIfExists } from "./YarnLock";


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
    let closestNodeModules = getClosestParentModulesDir(dir);
    if (!closestNodeModules) {
      return {};
    }

    let lockfile = readYarnLockIfExists(path.dirname(closestNodeModules));
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
