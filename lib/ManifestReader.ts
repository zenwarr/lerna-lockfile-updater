import * as path from "path";
import { readFile, readFileIfExists } from "./Utils";


export function readManifest(dir: string) {
  return readFile(path.join(dir, "package.json"));
}


export function readManifestIfExists(dir: string) {
  return readFileIfExists(path.join(dir, "package.json"));
}
