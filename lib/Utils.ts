import * as path from "path";
import * as fs from "fs";


export function readFile(location: string) {
  return JSON.parse(fs.readFileSync(location, "utf-8"));
}


export function readFileIfExists(location: string) {
  try {
    return require(location);
  } catch (e) {
    if (e.code === "ENOENT") {
      return undefined;
    }
    throw e;
  }
}


/**
 * Given a path, returns a path to the closest parent `node_modules` directory, if exists.
 */
export function getClosestParentModulesDir(location: string): string | undefined {
  let root = path.parse(location).root;

  while (true) {
    if (path.basename(location) === "node_modules") {
      return location;
    } else if (location === root) {
      return undefined;
    }

    location = path.dirname(location);
  }
}
