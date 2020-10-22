import * as path from "path";
import * as fs from "fs";
import * as lockfile from "@yarnpkg/lockfile";
import { MetaInfo } from "./MetaInfoResolver";


export function readYarnLockIfExists(dir: string) {
  let location = path.join(dir, "yarn.lock");

  let fileContents: string;
  try {
    fileContents = fs.readFileSync(location, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") {
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


export function getYarnLockDir(startDir: string): string | undefined {
  let root = path.parse(startDir).root;
  let location = startDir;

  while (location !== root) {
    if (fs.existsSync(path.join(location, "yarn.lock"))) {
      return location;
    }

    location = path.dirname(location);
  }

  return undefined;
}
