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
    if (!ctx.yarnLockDir) {
      return {};
    }

    let lockfile = readYarnLockIfExists(ctx.yarnLockDir);
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
