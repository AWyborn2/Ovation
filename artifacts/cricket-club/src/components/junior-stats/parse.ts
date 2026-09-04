/** Input-string → number parsing shared by the junior scorecard editors. */

/** Parse an <input> string to int-or-null (empty = null). */
export function intOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const str = (v: number | null | undefined): string => (v == null ? "" : String(v));
