import type { ShirtNumberCategory } from "@workspace/db";
import { shirtNumberCategoryForGrade } from "@workspace/db/shirt-numbers";

/**
 * Player profile shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
 * U9; R14, R15, R16; KTD13). Pure: turns a player's senior register rows into
 * the `shirtNumber` / `shirtNumbers` fields of `PlayerDetail`. No database.
 *
 * The senior register has two categories (men / female, migration 0047) and one person
 * can hold a number in each. A public read always shows ONE number per season: the
 * number for the category of the context (a fixture's grade), or on the profile the
 * category of the grades the player played most that season (a tie goes to men).
 */

/** The register columns the profile needs. */
export type PlayerShirtNumberRow = {
  season: number;
  number: string | null;
  playerId: number | null;
  /** Omitted: `men` (every entry from before migration 0047). */
  category?: ShirtNumberCategory;
};

/** A grade-season stats row, as the profile already has it. */
export type GradeSeasonGames = {
  grade: string;
  season: number | null;
  games?: number | null;
};

/**
 * Per season, the category of the grades a player played most: `female` when their
 * women's-grade games outnumber the rest, otherwise `men` (a tie goes to men). Seasons
 * without stats are absent (callers default to men). Pure.
 */
export function profileCategoryBySeason(
  stats: readonly GradeSeasonGames[],
): Map<number, ShirtNumberCategory> {
  const games = new Map<number, { men: number; female: number }>();
  for (const s of stats) {
    if (s.season === null) continue;
    const g = games.get(s.season) ?? { men: 0, female: 0 };
    g[shirtNumberCategoryForGrade(s.grade)] += Math.max(0, s.games ?? 0);
    games.set(s.season, g);
  }
  const out = new Map<number, ShirtNumberCategory>();
  for (const [season, g] of games) out.set(season, g.female > g.men ? "female" : "men");
  return out;
}

/**
 * The one number a public read shows from a person's entries for a season: the
 * `preferred` category's, else (they wear a number only on the other register) the
 * other category's. Null when neither has a number. Pure.
 */
export function shirtNumberForCategory(
  entries: readonly { category?: ShirtNumberCategory; number: string | null }[],
  preferred: ShirtNumberCategory,
): string | null {
  const numbered = entries.filter((e) => e.number !== null && e.number !== "");
  const own = numbered.find((e) => (e.category ?? "men") === preferred);
  return (own ?? numbered[0])?.number ?? null;
}

export type PlayerShirtNumbers = {
  /** The number for the current season, or null when there is none (R15). */
  shirtNumber: string | null;
  /** Numbered seasons, newest first. */
  shirtNumbers: { season: number; number: string }[];
};

/**
 * Held entries (no linked player, KTD2) and unnumbered seasons are dropped
 * (R15, R16). Seasons after the current one (an admin planning ahead) are not
 * worn yet, so they stay off the profile until they start (R14). A season can hold more
 * than one linked entry (a merge group, or the men's and the female register): the
 * season's category (`categoryBySeason`, default men) wins first, then the presented
 * player's own entry, otherwise the first one seen.
 */
export function shapePlayerShirtNumbers(
  rows: readonly PlayerShirtNumberRow[],
  opts: {
    currentSeason: number;
    preferredPlayerId: number;
    categoryBySeason?: ReadonlyMap<number, ShirtNumberCategory>;
  },
): PlayerShirtNumbers {
  const rank = (r: PlayerShirtNumberRow) =>
    ((r.category ?? "men") === (opts.categoryBySeason?.get(r.season) ?? "men") ? 0 : 2) +
    (r.playerId === opts.preferredPlayerId ? 0 : 1);
  const bySeason = new Map<number, PlayerShirtNumberRow & { number: string }>();
  for (const r of rows) {
    if (r.playerId === null || r.number === null || r.number === "") continue;
    if (r.season > opts.currentSeason) continue;
    const existing = bySeason.get(r.season);
    if (!existing || rank(r) < rank(existing)) {
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
