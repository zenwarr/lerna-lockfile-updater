import {BuildContext, Entry, EntryDeps} from "./Interfaces";


/**
 * Recursively walks all entries inside `dependencies` field of given entry.
 */
export function walkEntries(deps: EntryDeps | undefined, walker: (dep: Entry) => void) {
  if (!deps) {
    return;
  }

  for (let name of Object.keys(deps)) {
    walkEntries(deps[name].dependencies, walker);
    walker(deps[name]);
  }
}


/**
 * Recursively walks all dependencies of given entry.
 * The difference from `walkEntries` is that this function enumerates all items in `requires` field and resolves them.
 */
export function walkDeps(ctx: BuildContext, entry: Entry, walker: (dep: Entry) => void, walked?: Set<Entry>) {
  if (!walked) {
    walked = new Set<Entry>();
  }

  if (!entry.requires) {
    return;
  }

  for (let packageName of Object.keys(entry.requires)) {
    let entryResolves = ctx.resolves.get(entry);
    if (!entryResolves) {
      throw new Error("Entry resolves not found");
    }

    let resolvedEntry = entryResolves.get(packageName);
    if (!resolvedEntry) {
      continue;
    }

    walked.add(resolvedEntry);
    walker(resolvedEntry);

    walkDeps(ctx, resolvedEntry, walker, walked);
  }
}


/**
 * Walks all entries not required by at least one of given packages or dependencies of these packages.
 */
export function walkNonSubsetDeps(ctx: BuildContext, subset: string[], walker: (entry: Entry) => void) {
  let subsetDeps = new Set<Entry>();
  for (let packageName of subset) {
    let entry = ctx.rootDeps[packageName];
    if (!entry) {
      continue;
    }

    subsetDeps.add(entry);
    walkDeps(ctx, entry, e => subsetDeps.add(e));
  }

  walkEntries(ctx.rootDeps, e => {
    if (!subsetDeps.has(e)) {
      walker(e);
    }
  });
}
