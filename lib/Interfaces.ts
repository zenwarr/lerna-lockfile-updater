export type EntryDeps = { [name: string]: Entry }


export interface Entry {
  version: string;
  integrity?: string;
  resolved?: string;
  requires?: { [name: string]: string };
  dependencies?: EntryDeps;
  dev?: boolean;
  optional?: boolean;
}


export interface BuildContext {
  yarnLock?: string;
  startDir: string;
  rootDeps: EntryDeps;
  visited: Set<string>;

  /**
   * Maps absolute directory paths to lockfile entries
   */
  moduleDirs: Map<string, Entry | null>;
}
