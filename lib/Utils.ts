import * as path from "path";
import * as fs from "fs";


export function readFile(location: string) {
  return JSON.parse(fs.readFileSync(location, "utf-8"));
}


export function readFileIfExists(location: string) {
  try {
    return readFile(location);
  } catch (e) {
    if (e.code === "ENOENT") {
      return undefined;
    }
    throw e;
  }
}


/**
 * Given a path, returns a path to the module that owns `node_modules` directory `location` is located in.
 * If `location` is outside any `node_modules`, returns `undefined`.
 */
export function getOwnerDir(location: string): string | undefined {
  let root = path.parse(location).root;

  while (true) {
    if (path.basename(location) === "node_modules") {
      return path.dirname(location);
    } else if (location === root) {
      return undefined;
    }

    location = path.dirname(location);
  }
}
