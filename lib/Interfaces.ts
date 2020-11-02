export type EntryDeps = { [name: string]: Entry }


export interface Entry {
  version: string;
  integrity?: string;
  resolved?: string;
  requires?: { [name: string]: string };
  dependencies?: EntryDeps;
  dev?: boolean;
  optional?: boolean;
  owner?: Entry;
}


export interface BuildContext {
  yarnLock?: string;
  startDir: string;
  root: Entry;
  visitedDirs: Set<string>;

  /**
   * Maps absolute directory paths to lockfile entries
   */
  dirEntries: Map<string, Entry>;
}
