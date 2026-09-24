/**
 * Stats analytics module (plan 2026-09-24-002, U4 / KTD1): pure derivations
 * behind the Player profile and Compare charts. Every per-match chart reads
 * the same enriched `GET /players/{id}/matches` rows, so per-opponent and
 * per-split totals sum back to `matchTotals` for the same range (R5).
 * Season-level figures read `GET /players/{id}/seasons`.
 *
 * No React, no fetch — callers pass query results in.
 */
export * from "./shared";
export * from "./range";
export * from "./dismissals";
export * from "./splits";
export * from "./form";
export * from "./distribution";
export * from "./opposition";
export * from "./race";
export * from "./percentiles";
export * from "./milestones";
