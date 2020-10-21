import * as path from "path";
import * as fs from "fs";
import * as lockfile from "@yarnpkg/lockfile";
import { MetaInfo } from "./MetaInfoResolver";


const cache = new Map<string, any>();


export function readYarnLockIfExists(dir: string) {
  if (cache.has(dir)) {
    return cache.get(dir);
  }

  let location = path.join(dir, "yarn.lock");

  let fileContents: string;
  try {
    fileContents = fs.readFileSync(location, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") {
      cache.set(dir, undefined);
      return undefined;
    }
    throw e;
  }

  let result = lockfile.parse(fileContents);
  if (result.type === "merge") {
    throw new Error(`Failed to parse yarn.lock at "${ location }": complete git merge before continuing`);
  } else if (result.type === "conflict") {
    throw new Error(`Failed to parse yarn.lock at "${ location }": resolve git conflicts before continuing`);
  } else {
    cache.set(dir, result.object);
    return result.object;
  }
}


export function findMetaInYarnLock(lockfile: any, packageName: string, packageVersion: string): MetaInfo {
  let prefix = packageName + "@";
  for (let [ key, value ] of Object.entries<any>(lockfile)) {
    if (key.startsWith(prefix) && value.version === packageVersion) {
      let resolved: string | undefined;
      if (value.resolved) {
        let sepIndex = value.resolved.indexOf("#");
        resolved = sepIndex >= 0 ? value.resolved.slice(0, sepIndex) : value.resolved;
      }

      return {
        integrity: value.integrity,
        resolved
      };
    }
  }

  return {};
}
