#!/usr/bin/env node
import * as argparse from "argparse";
import { generateLockFile, updateLocks } from "./lib/Builder";


let parser = new argparse.ArgumentParser({
  description: "NPM lockfile generator"
});

parser.add_argument("-v", "--version", { action: "version", version: require("./package.json").version });
parser.add_argument("dirs", {
  help: "Path to package to generate lockfile for",
  nargs: "*",
  default: [ process.cwd() ]
});

let args: {
  yarn: boolean,
  dirs: string[]
} = parser.parse_args();


updateLocks(args.dirs).catch(error => {
  console.error(`Error while updating lockfiles: ${ error.message }`, error);
});


export { generateLockFile };
