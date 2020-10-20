export type EntryDeps = { [name: string]: Entry }


export interface Entry {
  version: string;
  integrity: string | undefined;
  resolved: string | undefined;
  requires: { [name: string]: string } | undefined;
  dependencies: EntryDeps | undefined;
  dev?: boolean;
  optional?: boolean;
}


export interface BuildContext {
  packagesDir: string;
  startDir: string;
  rootDeps: EntryDeps;
  visited: Set<string>;
  moduleDirs: Map<string, Entry | null>;
  resolves: Map<Entry, Map<string, Entry>>;
}
