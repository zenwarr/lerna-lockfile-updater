import * as path from "path";
import * as fs from "fs";


export class ManifestReader {
  private _cache: { [path: string]: any } = {};

  private _readFile(location: string) {
    return JSON.parse(fs.readFileSync(location, "utf-8"));
  }

  public read(dir: string) {
    let location = path.join(dir, "package.json");

    if (!(location in this._cache)) {
      this._cache[location] = this._readFile(location);
    }

    return this._cache[location];
  }
}
