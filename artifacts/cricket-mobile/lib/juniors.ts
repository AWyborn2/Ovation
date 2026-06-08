/**
 * Shared helpers for the mobile Juniors section. The junior data is kept
 * COMPLETELY separate from senior records and served only via /api/juniors/*;
 * these helpers never touch any senior data. An emerald accent visually marks
 * every junior screen as distinct from the senior (navy/gold) side.
 */

export const JUNIOR = {
  accent: "#059669", // emerald-600
  accentDark: "#047857", // emerald-700
  accentSoft: "rgba(16,185,129,0.12)",
  accentBorder: "rgba(5,150,105,0.5)",
  onAccent: "#ffffff",
};

/**
 * Junior match dates are free-text and frequently null. Format an ISO date to
 * dd/mm/yyyy; otherwise pass the string through unchanged. Returns null when
 * there is nothing to show.
 */
export function fmtJuniorDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return trimmed;
}

/** Format a possibly-null number to a fixed number of digits, or an em dash. */
export function fmtNum(
  value: number | null | undefined,
  digits = 2,
): string {
  return value != null ? value.toFixed(digits) : "—";
}

/** Render a player's season span (e.g. "2019/20 – 2024/25") or single season. */
export function fmtSeasonSpan(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  if (first && last && first !== last) return `${first} – ${last}`;
  return first ?? "—";
}
