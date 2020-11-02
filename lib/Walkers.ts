import { BuildContext, Entry, EntryDeps } from "./Interfaces";


/**
 * Recursively walks all entries inside `dependencies` field of given entry.
 */
export function walkEntries(deps: EntryDeps | undefined, walker: (dep: Entry) => void) {
  if (!deps) {
    return;
  }

  for (let value of Object.values(deps)) {
    walkEntries(value.dependencies, walker);
    walker(value);
  }
}


function resolveDependencyEntryIfExists(ctx: BuildContext, parent: Entry, name: string): Entry | undefined {
  return parent.dependencies ? parent.dependencies[name] : undefined;
}


function resolveDependencyEntry(ctx: BuildContext, parentName: string, parent: Entry, depName: string, parents: Entry[]): Entry {
  let resolvedEntry = resolveDependencyEntryIfExists(ctx, parent, depName);
  if (resolvedEntry) {
    return resolvedEntry;
  }

  for (let q = parents.length - 1; q >= 0; --q) {
    resolvedEntry = resolveDependencyEntryIfExists(ctx, parents[q], depName);
    if (resolvedEntry) {
      return resolvedEntry;
    }
  }

  throw new Error(`Internal error: failed to resolve entry for ${ parentName } -> ${ depName }`);
}


/**
 * Recursively walks all dependencies of given entry.
 * The difference from `walkEntries` is that this function enumerates all items in `requires` field and resolves them.
 */
export function walkDeps(ctx: BuildContext, entryName: string, entry: Entry, walker: (dep: Entry) => void, parents: Entry[], walked?: Set<Entry>) {
  if (!walked) {
    walked = new Set();
  }

  if (walked.has(entry)) {
    return;
  }

  walked.add(entry);

  if (!entry.requires) {
    return;
  }

  for (let packageName of Object.keys(entry.requires)) {
    const resolvedEntry = resolveDependencyEntry(ctx, entryName, entry, packageName, parents);

    walker(resolvedEntry);

    walkDeps(ctx, packageName, resolvedEntry, walker, [ ...parents, entry ], walked);
  }
}


/**
 * Walks all entries not required by at least one of given packages or dependencies of these packages.
 */
export function walkNonSubsetDeps(ctx: BuildContext, subset: string[], walker: (entry: Entry) => void) {
  if (!ctx.root.dependencies) {
    return;
  }

  let subsetDeps = new Set<Entry>();
  for (let packageName of subset) {
    let entry = ctx.root.dependencies[packageName];
    if (!entry) {
      continue;
    }

    subsetDeps.add(entry);
    walkDeps(ctx, packageName, entry, e => subsetDeps.add(e), [ ctx.root ]);
  }

  walkEntries(ctx.root.dependencies, e => {
    if (!subsetDeps.has(e)) {
      walker(e);
    }
  });
}
