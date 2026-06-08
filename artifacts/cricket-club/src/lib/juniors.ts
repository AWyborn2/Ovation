// Shared helpers + styling tokens for the Juniors section. The juniors area uses
// the club brown (source tertiary #42342B) throughout to read as visually distinct from the gold
// senior side.

export const JUNIOR_ACCENT = {
  text: "text-[#bc8c6b]",
  bg: "bg-[#42342b]",
  bgSoft: "bg-[#bc8c6b]/10",
  border: "border-[#bc8c6b]",
  borderSoft: "border-[#bc8c6b]/40",
  hoverBorder: "hover:border-[#bc8c6b]",
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
