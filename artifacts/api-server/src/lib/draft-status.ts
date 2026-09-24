/**
 * Social draft states (Social Studio automation, KTD1). The stored column
 * holds exactly these values (the legacy `pending` / `approved` names were
 * rewritten by the contract migration, 0013).
 */
export const DRAFT_STATUSES = ["awaiting_review", "ready", "posted", "dismissed"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export function isDraftStatus(value: unknown): value is DraftStatus {
  return typeof value === "string" && (DRAFT_STATUSES as readonly string[]).includes(value);
}

/** A stored status as a DraftStatus; anything unexpected reads as awaiting review. */
export function normalizeDraftStatus(stored: string): DraftStatus {
  return isDraftStatus(stored) ? stored : "awaiting_review";
}
