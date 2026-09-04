/** Small pure helpers shared by the layout editor's sub-components. */

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Snap threshold expressed as a fraction of the 1080 base width.
export const SNAP = 0.012;

// Normalise a typed colour to #RRGGBB (expanding #abc → #aabbcc); null if invalid.
export const normaliseHex = (raw: string): string | null => {
  let v = raw.trim();
  if (!v) return null;
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    v = `#${v
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
};
