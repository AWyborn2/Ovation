// Shared helpers + styling tokens for the Juniors section. The juniors area uses
// an emerald accent throughout to read as visually distinct from the navy/gold
// senior side.

export const JUNIOR_ACCENT = {
  text: "text-emerald-700",
  bg: "bg-emerald-600",
  bgSoft: "bg-emerald-500/10",
  border: "border-emerald-600",
  borderSoft: "border-emerald-600/40",
  hoverBorder: "hover:border-emerald-600",
};

/** Junior match dates arrive as free text; show them as-is, falling back to —. */
export function fmtJuniorDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return d;
}

/** Average / rate display: one decimal, or — when null. */
export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}
