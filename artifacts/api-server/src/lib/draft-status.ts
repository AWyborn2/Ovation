/**
 * Social draft states (Social Studio automation, KTD1).
 *
 * The stored column still accepts the legacy values `pending` (= awaiting
 * review) and `approved` (= ready) until the contract migration lands, so a
 * build from before the rename keeps working while prod is migrated ahead of
 * publishing. New writes always use the new values; every read goes through
 * `normalizeDraftStatus`.
 */
export const DRAFT_STATUSES = ["awaiting_review", "ready", "posted", "dismissed"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

const LEGACY: Record<string, DraftStatus> = {
  pending: "awaiting_review",
  approved: "ready",
};

/** Map a stored status (new or legacy) to its current name. */
export function normalizeDraftStatus(stored: string): DraftStatus {
  if (stored in LEGACY) return LEGACY[stored];
  return (DRAFT_STATUSES as readonly string[]).includes(stored)
    ? (stored as DraftStatus)
    : "awaiting_review";
}

/** Every stored value that means `status` (for SQL `IN` filters). */
export function storedValuesFor(status: DraftStatus): string[] {
  const legacy = Object.entries(LEGACY)
    .filter(([, v]) => v === status)
    .map(([k]) => k);
  return [status, ...legacy];
}

export function isDraftStatus(value: unknown): value is DraftStatus {
  return typeof value === "string" && (DRAFT_STATUSES as readonly string[]).includes(value);
}
