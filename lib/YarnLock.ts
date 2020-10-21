import * as path from "path";
import * as fs from "fs";
import * as lockfile from "@yarnpkg/lockfile";


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
