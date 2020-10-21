#!/usr/bin/env node
import * as argparse from "argparse";
import { updateLocks } from "./lib/Builder";


let parser = new argparse.ArgumentParser({
  description: "NPM lockfile generator"
});

parser.add_argument("-v", "--version", { action: "version", version: require("./package.json").version });
parser.add_argument("--yarn", {
  action: "store_true",
  dest: "yarn",
  default: false,
  help: "Should be specified when generating lockfiles from modules installed by yarn"
});
parser.add_argument("dirs", {
  help: "Path to package to generate lockfile for",
  nargs: "*",
  default: [ process.cwd() ]
});

let args: {
  yarn: boolean,
  dirs: string[]
} = parser.parse_args();


updateLocks(args.dirs, args.yarn).catch(error => {
  console.error(`Error while updating lockfiles: ${ error.message }`, error);
});
