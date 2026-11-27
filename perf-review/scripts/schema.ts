// Minimal runtime schemas with inferred types, so external JSON is parsed once at the edge.
// A local copy instead of zod: skills ship as folders without node_modules.

export type Schema<T> = (value: unknown, path: string) => T;
export type Infer<S> = S extends Schema<infer T> ? T : never;

export class ParseError extends Error {}

export const fail = (path: string, expected: string, value: unknown): never => {
  throw new ParseError(`${path || "value"}: expected ${expected}, got ${JSON.stringify(value)?.slice(0, 80) ?? String(value)}`);
};

export const string: Schema<string> = (v, p) => (typeof v === "string" ? v : fail(p, "string", v));
export const number: Schema<number> = (v, p) => (typeof v === "number" && Number.isFinite(v) ? v : fail(p, "number", v));
export const boolean: Schema<boolean> = (v, p) => (typeof v === "boolean" ? v : fail(p, "boolean", v));

export const literal =
  <const L extends readonly string[]>(...values: L): Schema<L[number]> =>
  (v, p) => {
    const match = values.find((x) => x === v);
    return match === undefined ? fail(p, values.join(" | "), v) : match;
  };

export const nullable =
  <T>(s: Schema<T>): Schema<T | null> =>
  (v, p) => (v === null || v === undefined ? null : s(v, p));

/** A missing or null field becomes a fresh `fallback()`, so parsed records never share a default object. */
export const withDefault =
  <T>(s: Schema<T>, fallback: () => T): Schema<T> =>
  (v, p) => (v === null || v === undefined ? fallback() : s(v, p));

/** Narrow a parsed value with a type guard, e.g. a string to a branded type. */
export const refine =
  <T, U extends T>(s: Schema<T>, guard: (x: T) => x is U, expected: string): Schema<U> =>
  (v, p) => {
    const x = s(v, p);
    return guard(x) ? x : fail(p, expected, v);
  };

export const array =
  <T>(s: Schema<T>): Schema<T[]> =>
  (v, p) => (Array.isArray(v) ? v.map((x, i) => s(x, `${p}[${i}]`)) : fail(p, "array", v));

export const record =
  <T>(s: Schema<T>): Schema<Record<string, T>> =>
  (v, p) => {
    if (!isObject(v)) return fail(p, "object", v);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, s(x, p ? `${p}.${k}` : k)]));
  };

type Shape = Record<string, Schema<unknown>>;
type ObjectOf<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

function parseShape<S extends Shape>(shape: S, v: Record<string, unknown>, p: string): ObjectOf<S> {
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(shape)) out[key] = schema(Object.hasOwn(v, key) ? v[key] : undefined, p ? `${p}.${key}` : key);
  // The only cast in the package: every declared key was just set by its own schema.
  return out as ObjectOf<S>;
}

/** Unknown keys are dropped, so the parsed value holds exactly the declared fields. For API responses. */
export const object =
  <S extends Shape>(shape: S): Schema<ObjectOf<S>> =>
  (v, p) => (isObject(v) ? parseShape(shape, v, p) : fail(p, "object", v));

/** Unknown keys are an error, so a typo in a hand- or agent-written file fails instead of being dropped. */
export const strictObject =
  <S extends Shape>(shape: S): Schema<ObjectOf<S>> =>
  (v, p) => {
    if (!isObject(v)) return fail(p, "object", v);
    const extra = Object.keys(v).filter((k) => !Object.hasOwn(shape, k));
    if (extra.length) throw new ParseError(`${p || "value"}: unknown field ${extra.join(", ")}; expected only ${Object.keys(shape).join(", ")}`);
    return parseShape(shape, v, p);
  };

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export const parse = <T>(s: Schema<T>, value: unknown, path = ""): T => s(value, path);
