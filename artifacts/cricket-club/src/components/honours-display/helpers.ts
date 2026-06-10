/** Player-card initials from a display name (up to two letters). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Compact grade-chip label. */
export function gradeBadge(g: string): string {
  if (g.startsWith("Female")) return g.replace("Female ", "F-");
  if (g === "U21 Colts") return "U21";
  if (g.startsWith("Mid-Year"))
    return g.replace("Mid-Year T20 ", "T20 ").replace("Female ", "F-");
  return g;
}

/** Format an ISO-ish date string as "21 Mar 2026"; falls back to the raw value. */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
