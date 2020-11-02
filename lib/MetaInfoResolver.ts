import { BuildContext } from "./Interfaces";
import { readManifestIfExists } from "./ManifestReader";
import { findMetaInYarnLock } from "./YarnLock";


export interface MetaInfo {
  resolved?: string;
  integrity?: string;
}


/**
 * Tries to resolve information for `resolved` and `integrity` fields for given package
 * @param dir Directory for package to resolve information on
 * @param yarnLock yarn.lock contents
 */
export function getMetaInfo(dir: string, yarnLock: any): MetaInfo {
  let manifest = readManifestIfExists(dir);
  if (!manifest) {
    return {};
  }

  let result: MetaInfo = {
    resolved: manifest._resolved,
    integrity: manifest._integrity
  };

  let isIncomplete = !result.integrity || !result.resolved;

  if (isIncomplete && yarnLock) {
    result = {
      ...result,
      ...findMetaInYarnLock(yarnLock, manifest.name, manifest.version)
    };
  }

  return result;
}
