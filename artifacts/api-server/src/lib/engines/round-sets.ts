import { and, eq, gt, lte } from "drizzle-orm";
import {
  db,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  type FixtureRow,
  type SocialSettingsRow,
} from "@workspace/db";
import { gradeTile, isJuniorGradeLabel } from "@workspace/scorecard";
import { familyAllows, resolveFamilyConfig } from "../social-families";
import { upsertDraftByKey } from "../draft-upsert";
import { loadClubIdentity } from "../club-overlay";
import { getTenantCentralClubId, tenantIsCentral } from "../tenant";
import {
  CLUB_TIME_ZONE,
  ROUND_WINDOW_MS,
  lastScheduledAt,
  resolveRoundSchedules,
} from "../round-schedules";
import { formatFixtureTime } from "./match-day";
import { teamListSeasonOf, teamListShirtNumberLoader, teamListToCardInput } from "./team-list";

/**
 * Round sets on a schedule (balanced card sets, plan 2026-10-01-001 U5): a
 * club that drafts game day, team lists or the weekend wrap "per round" gets
 * one draft for the whole round at its chosen day and hour. Each draft is a
 * list card the Studio and post pack split into an even set.
 *
 * - Keyed per round and section (seniors / juniors never share a draft), so
 *   the hourly sweep drafts each round once and refreshes it as fixtures or
 *   selections change, until the round's first ball.
 * - Only the week after the scheduled moment is drafted, so switching a card
 *   to "per round" never re-drafts past rounds.
 */

export type RoundSetResult = { drafted: number; refreshed: number };

const HOUR_MS = 60 * 60 * 1000;
/** Perth is UTC+8 all year (no daylight saving). */
const CLUB_OFFSET_MS = 8 * HOUR_MS;

async function loadSettings(tenantId: number): Promise<SocialSettingsRow | null> {
  const [row] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return row ?? null;
}

/** YYYY-MM-DD (club time) of the weekend a start falls in: Sunday → the day before, else the coming Saturday. */
export function weekendOf(d: Date): string {
  const local = new Date(d.getTime() + CLUB_OFFSET_MS);
  const day = local.getUTCDay();
  const shift = day === 0 ? -1 : (6 - day + 7) % 7;
  return new Date(local.getTime() + shift * 24 * HOUR_MS).toISOString().slice(0, 10);
}

/** "SATURDAY 14 FEB" (club time), the Studio prefill's round date. */
export function formatRoundDate(d: Date): string {
  return d
    .toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: CLUB_TIME_ZONE,
    })
    .replace(/,/g, "")
    .toUpperCase();
}

export type FixtureRoundGroup = {
  key: string;
  roundLabel: string;
  junior: boolean;
  /** Earliest start first. */
  fixtures: FixtureRow[];
};

/**
 * Fixtures → rounds: the same round label on the same weekend, seniors and
 * juniors apart (the Studio's "this round's fixtures" grouping).
 */
export function groupFixtureRounds(fixtures: readonly FixtureRow[]): FixtureRoundGroup[] {
  const groups = new Map<string, FixtureRoundGroup>();
  for (const f of fixtures) {
    const roundLabel = (f.roundLabel ?? "").trim().toUpperCase();
    const junior = isJuniorGradeLabel(f.grade);
    const key = `${weekendOf(f.startAt)}:${roundLabel || "ROUND"}:${junior ? "junior" : "senior"}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, roundLabel, junior, fixtures: [] };
      groups.set(key, g);
    }
    g.fixtures.push(f);
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.fixtures.sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id - b.id);
  }
  return out;
}

export function roundToGameDayInput(round: FixtureRoundGroup): Record<string, unknown> {
  return {
    kind: "roundFixtures",
    roundLabel: round.roundLabel,
    date: round.fixtures[0] ? formatRoundDate(round.fixtures[0].startAt) : "",
    fixtures: round.fixtures.map((f) => ({
      grade: gradeTile(f.grade),
      opponent: f.opponentName,
      venue: f.venue || (f.isHome ? "Home" : "Away"),
      startTime: formatFixtureTime(f.startAt),
    })),
    ...(round.junior ? { junior: true } : {}),
  };
}

/** The scheduled week's fixtures for a per-round card, grouped, rounds not yet started. */
async function scheduledRounds(
  tenantId: number,
  now: Date,
  anchor: Date,
  allows: (grade: string, junior: boolean) => boolean,
): Promise<FixtureRoundGroup[]> {
  const fixtures = await db
    .select()
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        gt(fixturesTable.startAt, anchor),
        lte(fixturesTable.startAt, new Date(anchor.getTime() + ROUND_WINDOW_MS)),
      ),
    );
  return groupFixtureRounds(
    fixtures.filter((f) => allows(f.grade, isJuniorGradeLabel(f.grade))),
  ).filter((r) => (r.fixtures[0]?.startAt.getTime() ?? 0) > now.getTime());
}

/** Game day as one round set, at the club's chosen day and hour. */
export async function generateRoundGameDayDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const families = resolveFamilyConfig(settings);
  const schedule = resolveRoundSchedules(settings?.roundSchedules).gameDay;
  if (!families.matchday.enabled || schedule.mode !== "perRound") return result;

  const anchor = lastScheduledAt(now, schedule);
  const rounds = await scheduledRounds(tenantId, now, anchor, (g, j) =>
    familyAllows(families, "matchday", g, j),
  );
  for (const round of rounds) {
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "gameday-round",
      family: "matchday",
      sourceKey: `gameday-round:${round.key}`,
      cardInput: roundToGameDayInput(round),
      appPath: "/fixtures",
      sourceMatchIsJunior: round.junior,
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}

/** Team lists as one round set: every published XI of the round, at the chosen day and hour. */
export async function generateRoundTeamListDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const families = resolveFamilyConfig(settings);
  const schedule = resolveRoundSchedules(settings?.roundSchedules).teamLists;
  if (!families.matchday.enabled || schedule.mode !== "perRound") return result;

  const anchor = lastScheduledAt(now, schedule);
  const rounds = await scheduledRounds(tenantId, now, anchor, (g, j) =>
    familyAllows(families, "matchday", g, j),
  );
  if (rounds.length === 0) return result;

  const lists = await db
    .select({ fixtureId: teamListsTable.fixtureId, players: teamListsTable.players })
    .from(teamListsTable)
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.isPublished, true)));
  const byFixture = new Map(lists.map((l) => [l.fixtureId, l.players]));

  // Season shirt numbers: read only when the club has the feature on.
  const shirtNumbers = teamListShirtNumberLoader(tenantId);
  for (const round of rounds) {
    const teams: Record<string, unknown>[] = [];
    for (const f of round.fixtures) {
      const players = byFixture.get(f.id);
      if (!players) continue;
      // Each team is exactly the fixture's own team-list card (fill-ins excluded).
      const { kind: _kind, ...team } = teamListToCardInput(
        f,
        players,
        await shirtNumbers(teamListSeasonOf(f)),
      );
      if ((team.players as unknown[]).length > 0) teams.push(team);
    }
    if (teams.length === 0) continue;
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "teamlists-round",
      family: "matchday",
      sourceKey: `teamlists-round:${round.key}`,
      cardInput: {
        kind: "teamListRound",
        roundLabel: round.roundLabel,
        date: round.fixtures[0] ? formatRoundDate(round.fixtures[0].startAt) : "",
        teams,
      },
      appPath: "/fixtures",
      sourceMatchIsJunior: round.junior,
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}

const WRAP_OUTCOME: Record<string, "won" | "lost" | "draw"> = { WON: "won", LOST: "lost" };

/** Season start year for a date (seasons roll over in October). */
function seasonOf(d: Date): number {
  const local = new Date(d.getTime() + CLUB_OFFSET_MS);
  return local.getUTCMonth() >= 9 ? local.getUTCFullYear() : local.getUTCFullYear() - 1;
}

/**
 * The weekend wrap as one round set, at the club's chosen day and hour: the
 * latest round the club played in the week before that moment. Central-data
 * clubs only (the wrap reads central results); seniors only, as central data
 * holds no junior grades.
 */
export async function generateWeekendWrapDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const families = resolveFamilyConfig(settings);
  const schedule = resolveRoundSchedules(settings?.roundSchedules).weekendWrap;
  if (!families.roundup.enabled || schedule.mode !== "perRound") return result;
  if (!(await tenantIsCentral(tenantId))) return result;

  const anchor = lastScheduledAt(now, schedule);
  const toDay = (d: Date) => new Date(d.getTime() + CLUB_OFFSET_MS).toISOString().slice(0, 10);
  const from = toDay(new Date(anchor.getTime() - 6 * 24 * HOUR_MS));
  const to = toDay(anchor);

  const { centralClubMatches, centralWeekendWrap } = await import("@workspace/db/central-queries");
  const clubId = await getTenantCentralClubId(tenantId);
  const season = seasonOf(anchor);
  const played = (await centralClubMatches(clubId, { season })).filter(
    (m) => m.round != null && m.matchDate != null && m.matchDate >= from && m.matchDate <= to,
  );
  if (played.length === 0) return result;
  const latest = played.reduce((a, b) => ((b.matchDate ?? "") > (a.matchDate ?? "") ? b : a));
  const round = latest.round!;

  const { merges } = await loadClubIdentity(tenantId);
  const wrap = await centralWeekendWrap(clubId, season, round, merges);
  if (wrap.matches.length === 0) return result;

  const { action } = await upsertDraftByKey({
    tenantId,
    engine: "weekendwrap-round",
    family: "roundup",
    sourceKey: `weekendwrap-round:${season}:${round}`,
    cardInput: {
      kind: "weekendWrap",
      roundLabel: wrap.roundLabel.toUpperCase(),
      dateRange: wrap.dateRange,
      matches: wrap.matches.map((m) => ({
        gradeLabel: m.gradeLabel,
        resultLine: m.resultLine,
        performers: m.performers,
        outcome: WRAP_OUTCOME[m.outcome] ?? "draw",
      })),
    },
    appPath: "/fixtures",
    sourceImportedAt: now,
  });
  if (action === "inserted") result.drafted++;
  else if (action === "refreshed") result.refreshed++;
  return result;
}
