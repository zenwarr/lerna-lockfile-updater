import * as path from "path";
import * as fs from "fs";


export class ManifestReader {
  private _cache: { [path: string]: any } = {};

  private _readFile(location: string) {
    return JSON.parse(fs.readFileSync(location, "utf-8"));
  }

  private _readFileIfExists(location: string) {
    try {
      return this._readFile(location);
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
      return undefined;
    }
  }

  public _read(dir: string, reader: (location: string) => any) {
    let location = path.join(dir, "package.json");

    if (!(location in this._cache)) {
      this._cache[location] = reader(location);
    }

    return this._cache[location];
  }

  public read(dir: string) {
    return this._read(dir, l => this._readFile(l));
  }

  public readIfExists(dir: string) {
    return this._read(dir, l => this._readFileIfExists(l));
  }
}
