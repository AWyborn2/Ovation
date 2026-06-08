// Shared helpers + styling tokens for the Juniors section. The juniors area uses
// the same gold accents as the senior side; only the section banner (in
// layout.tsx) stays club brown (with gold writing) to distinguish the two sides.

export const JUNIOR_ACCENT = {
  text: "text-primary",
  bg: "bg-primary",
  bgSoft: "bg-primary/10",
  border: "border-primary",
  borderSoft: "border-primary/40",
  hoverBorder: "hover:border-primary",
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
