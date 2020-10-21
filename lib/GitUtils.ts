import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";


/**
 * Returns contents of a file at git HEAD.
 * If there was some error getting file contents from git, tries to return current content of the file.
 * If file does not exists neither in git nor on disk right now, `undefined` is returned.
 */
export async function readFileFromHeadOrNow(filepath: string): Promise<string | undefined> {
  let currentFile: string | undefined;
  try {
    currentFile = fs.readFileSync(filepath, "utf-8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return new Promise(resolve => {
    let dir = path.dirname(filepath);
    let filename = path.basename(filepath);
    child_process.execFile("git", ["show", `HEAD:./${filename}`], {
      cwd: dir
    }, (err, stdout, stderr) => {
      if (err != null) {
        console.warn(`Failed to get "${filename}" contents at HEAD, falling back to actual state...`, stderr);
      }
      resolve(err != null ? currentFile : stdout);
    });
  });
}
