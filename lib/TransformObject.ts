function isObject(x: unknown): boolean {
  return typeof x === "object" && x != null;
}


/**
 * Basically, it is just `source = into`.
 * The point of this function is to try to keep order of properties in `source` to minimize text diff with original object.
 */
export function transformInto(source: any, into: any): any {
  if (!(isObject(source) && isObject(into))) {
    return into;
  }

  if (Array.isArray(source) || Array.isArray(into)) {
    return into;
  }

  for (let key of Object.keys(source)) {
    if (key in into) {
      source[key] = transformInto(source[key], into[key]);
    } else {
      delete source[key];
    }
  }

  for (let key of Object.keys(into)) {
    if (!(key in source)) {
      source[key] = into[key];
    }
  }

  return source;
}
