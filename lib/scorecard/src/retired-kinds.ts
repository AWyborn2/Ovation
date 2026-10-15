/**
 * Card kinds retired by plan 2026-10-15-001 (R5): no engine drafts them and they
 * cannot be made by hand. Their renderers, pack templates and caption templates
 * stay so cards posted before the retirement still display; only the entry
 * points go. Grade leaders live on as the season recap's champion cards.
 */
export const RETIRED_CARD_KINDS = ["gradeLeader", "tradingCard", "countdown"] as const;
export type RetiredCardKind = (typeof RETIRED_CARD_KINDS)[number];

export function isRetiredCardKind(kind: string | null | undefined): kind is RetiredCardKind {
  return (RETIRED_CARD_KINDS as readonly string[]).includes(kind ?? "");
}
