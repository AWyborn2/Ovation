/**
 * The seasons and rounds a carousel set is filled from (New Studio → Create →
 * Carousel set: "Season, then Round"). Each round lists its games by the ids
 * the weekend carousel sources give them, so a pick of one round or several
 * loads exactly those games.
 *
 *  - Team List and Match Day: the club's fixtures, current and upcoming seasons,
 *    by each fixture's round label (senior `fixtures`, or `junior_fixtures`).
 *  - Results and Match Summary: every completed game the club has, every season.
 *    Seniors read central through central-queries.ts for a central-read club
 *    (club-filtered, senior grades only, before-boundary seasons left out, as
 *    carousel-content.ts does) or the native tables; juniors read
 *    `junior_matches` only.
 *
 * Senior and junior rounds are never blended (juniors isolation): the senior
 * loader reads no junior table and the junior loader reads nothing senior or
 * central. No player is read, so fill-ins and private players never surface.
 */
import type { Request } from "express";
import { and, eq, gte } from "drizzle-orm";
import {
  db,
  fixturesTable,
  juniorFixturesTable,
  juniorMatchesTable,
  matchesTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { seasonLabel } from "./grades-helpers";
import { dataSource } from "./tenant";
import { beforeBoundary, loadClubOverlayData } from "./club-overlay";
import { carouselMatchDay, hasFinalResult, scorecardCarouselId } from "./carousel-content";
import { eligibleJuniorCarouselFixture, juniorCarouselFixtureId } from "./junior-carousel-content";
import { clubTimeToUtc } from "./round-schedules";
import { isJuniorSyncOn } from "./junior-sync";

export type CarouselRoundsSetType = "matchDay" | "teamList" | "results" | "matchSummary";

/** One game, as the picker groups it. */
export type RoundGame = {
  /** The weekend carousel sources' id for the game. */
  id: number;
  season: number;
  /** Club-time day, YYYY-MM-DD. */
  day: string;
  /** The round as the club names it; null or blank puts it in "Other games". */
  round: string | null;
};

export type CarouselRound = {
  key: string;
  label: string;
  from: string;
  to: string;
  other: boolean;
  gameIds: number[];
};

export type CarouselRounds = {
  seasons: Array<{ season: number; label: string; rounds: CarouselRound[] }>;
  defaultSeason: number | null;
  defaultRounds: string[];
};

export const OTHER_GAMES = "Other games";

const isFixtureSet = (t: CarouselRoundsSetType) => t === "matchDay" || t === "teamList";

/** "5" → "Round 5"; any other label as written, spaces tidied. */
export function roundLabelOf(round: string | number | null | undefined): string | null {
  const text = String(round ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? `Round ${Number(text)}` : text;
}

/**
 * Group games into seasons (newest first) and rounds (date order, "Other games"
 * last), and pick the round the picker opens on: the next round for an upcoming
 * set (else the latest), the most recent completed round for a results set. The
 * default never picks "Other games"; with no labelled round it is empty.
 */
export function groupCarouselRounds(
  games: readonly RoundGame[],
  upcoming: boolean,
  today: string,
): CarouselRounds {
  const bySeason = new Map<number, Map<string, CarouselRound>>();
  for (const g of games) {
    const label = roundLabelOf(g.round);
    const key = label ? `r:${label.toLowerCase()}` : "other";
    let rounds = bySeason.get(g.season);
    if (!rounds) bySeason.set(g.season, (rounds = new Map()));
    const r = rounds.get(key);
    if (!r)
      rounds.set(key, {
        key,
        label: label ?? OTHER_GAMES,
        from: g.day,
        to: g.day,
        other: !label,
        gameIds: [g.id],
      });
    else {
      if (g.day < r.from) r.from = g.day;
      if (g.day > r.to) r.to = g.day;
      if (!r.gameIds.includes(g.id)) r.gameIds.push(g.id);
    }
  }
  const seasons = [...bySeason.entries()]
    .sort(([a], [b]) => b - a)
    .map(([season, rounds]) => ({
      season,
      label: seasonLabel(season),
      rounds: [...rounds.values()].sort(
        (a, b) =>
          Number(a.other) - Number(b.other) ||
          a.from.localeCompare(b.from) ||
          a.to.localeCompare(b.to) ||
          a.label.localeCompare(b.label, "en-AU", { numeric: true }),
      ),
    }));
  const labelled = seasons.flatMap((s) =>
    s.rounds.filter((r) => !r.other).map((r) => ({ season: s.season, r })),
  );
  const latest = (xs: typeof labelled) =>
    xs.reduce<(typeof labelled)[number] | null>(
      (best, x) =>
        !best || x.r.to > best.r.to || (x.r.to === best.r.to && x.r.from > best.r.from) ? x : best,
      null,
    );
  const next = labelled
    .filter((x) => x.r.to >= today)
    .reduce<(typeof labelled)[number] | null>(
      (best, x) => (!best || x.r.from < best.r.from ? x : best),
      null,
    );
  const pick = upcoming ? (next ?? latest(labelled)) : latest(labelled);
  return {
    seasons,
    defaultSeason: pick?.season ?? null,
    defaultRounds: pick ? [pick.r.key] : [],
  };
}

/** Today in club time, YYYY-MM-DD. */
export const clubToday = (now = new Date()) => carouselMatchDay(now.toISOString())!;

/** The first day of the season `now` falls in, as a UTC instant (club time). */
function currentSeasonStart(now: Date): Date {
  return clubTimeToUtc(`${seasonStartYearFor(now)}-07-01T00:00`)!;
}

/** A senior set's rounds. Senior data only: no junior table is read. */
export async function seniorCarouselRounds(
  req: Request,
  tenantId: number,
  setType: CarouselRoundsSetType,
  now = new Date(),
): Promise<CarouselRounds> {
  const games: RoundGame[] = [];
  if (isFixtureSet(setType)) {
    const rows = await db
      .select()
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.tenantId, tenantId),
          gte(fixturesTable.startAt, currentSeasonStart(now)),
        ),
      );
    for (const f of rows) {
      // The fixtures the weekend carousel sources drop as byes or cancelled games.
      if (/^bye$/i.test(f.opponentName.trim())) continue;
      if (/\b(cancelled|canceled|abandoned)\b/i.test(f.notes ?? "")) continue;
      games.push({
        id: f.id,
        season: seasonStartYearFor(f.startAt),
        day: carouselMatchDay(f.startAt.toISOString())!,
        round: f.roundLabel,
      });
    }
    return groupCarouselRounds(games, true, clubToday(now));
  }

  // Results and match summaries: the same reads as carousel-content.ts.
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralClubMatches } = await import("@workspace/db/central-queries");
    const { boundaries } = await loadClubOverlayData(tenantId);
    // centralClubMatches keeps senior grades only (junior / pathway labels never map).
    for (const m of await centralClubMatches(source.clubId)) {
      if (beforeBoundary(boundaries, m.grade, m.season)) continue;
      const day = carouselMatchDay(m.matchDate);
      if (!day || !hasFinalResult(m)) continue;
      games.push({
        id: scorecardCarouselId(m.id, false),
        season: m.season,
        day,
        round: m.round != null ? String(m.round) : m.stage,
      });
    }
  } else {
    // Native stats are tenant #1's own tables (dataSource never answers native for another).
    for (const m of await db.select().from(matchesTable)) {
      const day = carouselMatchDay(m.matchDate);
      if (!day || !hasFinalResult(m)) continue;
      games.push({
        id: scorecardCarouselId(m.id, false),
        season: m.season,
        day,
        round: m.round != null ? String(m.round) : m.stage,
      });
    }
  }
  return groupCarouselRounds(games, false, clubToday(now));
}

/** A junior set's rounds. Junior tables only: nothing senior or central is read. */
export async function juniorCarouselRounds(
  tenantId: number,
  setType: CarouselRoundsSetType,
  now = new Date(),
): Promise<CarouselRounds> {
  const games: RoundGame[] = [];
  if (isFixtureSet(setType)) {
    if (!(await isJuniorSyncOn(tenantId, { requireActive: false })))
      return groupCarouselRounds([], true, clubToday(now));
    const rows = await db
      .select()
      .from(juniorFixturesTable)
      .where(
        and(
          eq(juniorFixturesTable.tenantId, tenantId),
          gte(juniorFixturesTable.startAt, currentSeasonStart(now)),
        ),
      );
    for (const f of rows) {
      if (!eligibleJuniorCarouselFixture(f)) continue;
      games.push({
        id: juniorCarouselFixtureId(f.id),
        season: f.seasonStartYear,
        day: carouselMatchDay(f.startAt!.toISOString())!,
        // Junior fixtures carry no round label: they are the season's "Other games".
        round: null,
      });
    }
    return groupCarouselRounds(games, true, clubToday(now));
  }
  const rows = await db
    .select()
    .from(juniorMatchesTable)
    .where(eq(juniorMatchesTable.tenantId, tenantId));
  for (const m of rows) {
    const day = carouselMatchDay(m.matchDate);
    const season = m.seasonStartYear ?? (day ? seasonStartYearFor(`${day}T12:00:00+08:00`) : null);
    if (!day || season === null || !hasFinalResult({ result: m.hhResult })) continue;
    games.push({ id: scorecardCarouselId(m.id, true), season, day, round: m.round });
  }
  return groupCarouselRounds(games, false, clubToday(now));
}
