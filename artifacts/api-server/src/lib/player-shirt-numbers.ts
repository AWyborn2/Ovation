/**
 * Player profile shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
 * U9; R14, R15, R16; KTD13). Pure: turns a player's senior register rows into
 * the `shirtNumber` / `shirtNumbers` fields of `PlayerDetail`. No database.
 */

/** The register columns the profile needs. */
export type PlayerShirtNumberRow = {
  season: number;
  number: string | null;
  playerId: number | null;
};

export type PlayerShirtNumbers = {
  /** The number for the current season, or null when there is none (R15). */
  shirtNumber: string | null;
  /** Numbered seasons, newest first. */
  shirtNumbers: { season: number; number: string }[];
};

/**
 * Held entries (no linked player, KTD2) and unnumbered seasons are dropped
 * (R15, R16). Seasons after the current one (an admin planning ahead) are not
 * worn yet, so they stay off the profile until they start (R14). A merge group can hold more than one linked entry for a season;
 * the presented player's own entry wins, otherwise the first one seen.
 */
export function shapePlayerShirtNumbers(
  rows: readonly PlayerShirtNumberRow[],
  opts: { currentSeason: number; preferredPlayerId: number },
): PlayerShirtNumbers {
  const bySeason = new Map<number, PlayerShirtNumberRow & { number: string }>();
  for (const r of rows) {
    if (r.playerId === null || r.number === null || r.number === "") continue;
    if (r.season > opts.currentSeason) continue;
    const existing = bySeason.get(r.season);
    if (
      !existing ||
      (existing.playerId !== opts.preferredPlayerId && r.playerId === opts.preferredPlayerId)
    ) {
      bySeason.set(r.season, { ...r, number: r.number });
    }
  }
  const shirtNumbers = [...bySeason.values()]
    .sort((a, b) => b.season - a.season)
    .map((r) => ({ season: r.season, number: r.number }));
  return {
    shirtNumber: bySeason.get(opts.currentSeason)?.number ?? null,
    shirtNumbers,
  };
}
