/**
 * Compact grade code for tight Broadcast surfaces (ticker, junior tiles):
 * "A Grade" → "A", "Female A" → "FA", "Female" → "F", "Under 17s" / "U17 Boys"
 * → "U17", "PPL" → "PPL", anything else → its first word, up to 3 letters.
 */
export function gradeCode(grade: string | null | undefined): string {
  const g = (grade ?? "").trim();
  if (!g) return "";
  let m = /^([A-Z])\s*grade$/i.exec(g);
  if (m) return m[1].toUpperCase();
  m = /^female\s*([A-Z])?\b/i.exec(g);
  if (m) return `F${(m[1] ?? "").toUpperCase()}`;
  m = /\b(?:under|u)\s*-?\s*(\d{1,2})/i.exec(g);
  if (m) return `U${m[1]}`;
  const first = g.split(/\s+/)[0];
  return first.slice(0, 3).toUpperCase();
}

/** Short club label for score lines: its short name, else up to 4 initials. */
export function clubAbbrev(name: string | null | undefined, shortName?: string | null): string {
  if (shortName?.trim()) return shortName.trim().toUpperCase();
  const words = (name ?? "")
    .replace(/cricket club|\bcc\b|\bcricket\b|\bclub\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
