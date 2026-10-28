import { and, eq, gt, gte, inArray, lte, ne } from "drizzle-orm";
import {
  db,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  juniorFixturesTable,
  juniorTeamListsTable,
  juniorMatchesTable,
  JUNIOR_SYNC_ID_START,
  type FixtureRow,
  type JuniorFixtureRow,
  type SocialSettingsRow,
} from "@workspace/db";
import type { MatchDetail } from "@workspace/api-zod";
import {
  gradeTile,
  groupOfGrade,
  isJuniorGradeLabel,
  juniorMatchToSummaryInput,
  matchToSummaryInput,
} from "@workspace/scorecard";
import type { JuniorPackaging } from "@workspace/scorecard/posting-plan";
// The junior helpers are imported only when a row lists junior grades, like the
// central queries below, so a club without juniors never loads them.
import { loadCentralMatchDetail } from "../match-detail";
import { inClubGradeOrder } from "../club-grade-order";
import { draftingGates, type DraftingGates } from "../posting-plan";
import { clubLeaderboardCarousel } from "@workspace/scorecard/club-leaderboard-input";
import {
  ladderCarousel,
  ladderInput,
  type LadderCardInput,
} from "@workspace/scorecard/ladder-input";
import { upsertDraftByKey } from "../draft-upsert";
import { juniorPhotoFields, juniorPhotoLoader, pickJuniorCardPhoto } from "../junior-photos";
import { loadClubIdentity } from "../club-overlay";
import { getTenantCentralClubId, getTenantPlayhqOrgId, tenantIsCentral } from "../tenant";
import {
  CLUB_TIME_ZONE,
  ROUND_WINDOW_MS,
  lastScheduledAt,
  resolveRoundSchedules,
} from "../round-schedules";
import { formatFixtureTime } from "./match-day";
import {
  loadAutoDebuts,
  teamListCategoryOf,
  teamListSeasonOf,
  teamListShirtNumberLoader,
  teamListToCardInput,
} from "./team-list";

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

/** The junior team a slide covers, for the per-team publishing gate (ADR-006). */
export type JuniorTeamRef = { ageGroup: string | null; teamName: string | null };

/**
 * What a round set needs from a fixture. Senior rows satisfy it as they are; a
 * junior-sync fixture is adapted onto it with its age group as the grade and its
 * team on `juniorTeam`.
 */
export type RoundFixture = Pick<
  FixtureRow,
  "id" | "grade" | "roundLabel" | "opponentName" | "venue" | "startAt" | "isHome"
> & {
  juniorTeam?: JuniorTeamRef;
  /** The junior_fixtures id, for its team list. */
  juniorFixtureId?: number;
};

export type FixtureRoundGroup = {
  key: string;
  roundLabel: string;
  /** Every fixture is junior: the round's own junior set. */
  junior: boolean;
  /** Any fixture is junior: the card carries junior markers (KTD6). */
  hasJuniors: boolean;
  /** Team lists only: whose teams these are (men's and women's post apart). */
  audience?: RoundAudience;
  /** Earliest start first; seniors before juniors in a combined set. */
  fixtures: RoundFixture[];
};

/** The junior teams a set of fixtures covers, one entry per team. */
export function juniorTeamsOf(fixtures: readonly RoundFixture[]): JuniorTeamRef[] {
  const seen = new Map<string, JuniorTeamRef>();
  for (const f of fixtures) {
    const ref =
      f.juniorTeam ?? (isJuniorGradeLabel(f.grade) ? { ageGroup: f.grade, teamName: null } : null);
    if (ref) seen.set(`${ref.ageGroup ?? ""}|${ref.teamName ?? ""}`, ref);
  }
  return [...seen.values()];
}

function isJuniorFixture(f: RoundFixture): boolean {
  return f.juniorTeam != null || isJuniorGradeLabel(f.grade);
}

export type RoundAudience = "men" | "women" | "junior";

/** Whose team a grade is: women's and girls' grades apart, everything else senior is men's. */
export function audienceOfGrade(grade: string): RoundAudience {
  const g = groupOfGrade(grade);
  return g === "junior" ? "junior" : g === "women" ? "women" : "men";
}

/** The cover's word for an audience ("MEN'S TEAMS NAMED"). */
export const AUDIENCE_LABEL: Record<RoundAudience, string> = {
  men: "MEN'S",
  women: "WOMEN'S",
  junior: "JUNIOR",
};

/**
 * Fixtures → rounds: the same round label on the same weekend, seniors and
 * juniors apart (the Studio's "this round's fixtures" grouping). With
 * `byAudience` (team lists), men's and women's teams are apart too; the men's
 * key stays "senior", so a round already drafted before the split keeps its
 * draft.
 */
export function groupFixtureRounds(
  fixtures: readonly RoundFixture[],
  opts: { byAudience?: boolean; juniors?: JuniorPackaging } = {},
): FixtureRoundGroup[] {
  const groups = new Map<string, FixtureRoundGroup>();
  // A combined set keeps the senior key, so a round drafted before juniors were
  // switched on refreshes in place rather than drafting again.
  const combined = opts.juniors === "combined";
  for (const f of fixtures) {
    const junior = isJuniorFixture(f);
    // A junior-sync fixture has no round label; it joins the weekend's senior round.
    const roundLabel = junior && f.juniorTeam ? "" : (f.roundLabel ?? "").trim().toUpperCase();
    const audience = opts.byAudience ? (junior ? "junior" : audienceOfGrade(f.grade)) : undefined;
    const section = junior && !combined ? "junior" : audience === "women" ? "women" : "senior";
    const weekend = weekendOf(f.startAt);
    let g = junior && combined ? seniorGroupFor(groups, weekend, section) : undefined;
    if (!g) {
      const key = `${weekend}:${roundLabel || "ROUND"}:${section}`;
      g = groups.get(key);
      if (!g) {
        const aud = junior && !combined ? "junior" : audience === "junior" ? undefined : audience;
        g = {
          key,
          roundLabel,
          junior,
          hasJuniors: junior,
          ...(aud ? { audience: aud } : {}),
          fixtures: [],
        };
        groups.set(key, g);
      }
    }
    g.fixtures.push(f);
    g.junior = g.junior && junior;
    g.hasJuniors = g.hasJuniors || junior;
    if (!g.roundLabel && roundLabel) g.roundLabel = roundLabel;
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.fixtures.sort(
      (a, b) =>
        Number(isJuniorFixture(a)) - Number(isJuniorFixture(b)) ||
        a.startAt.getTime() - b.startAt.getTime() ||
        a.id - b.id,
    );
  }
  return out;
}

/** The weekend's existing senior group in a section, for a combined junior fixture to join. */
function seniorGroupFor(
  groups: Map<string, FixtureRoundGroup>,
  weekend: string,
  section: string,
): FixtureRoundGroup | undefined {
  for (const [key, g] of groups) {
    if (key.startsWith(`${weekend}:`) && key.endsWith(`:${section}`) && !g.junior) return g;
  }
  return undefined;
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
      ...(f.juniorTeam?.teamName ? { team: f.juniorTeam.teamName } : {}),
    })),
    // Any junior fixture makes the whole set a junior card (KTD6): junior rules apply.
    ...(round.hasJuniors ? { junior: true, juniorTeams: juniorTeamsOf(round.fixtures) } : {}),
  };
}

/** The junior-sync fixtures starting in a window, adapted onto the round-set shape. */
async function juniorRoundFixtures(
  tenantId: number,
  anchor: Date,
  allows: (grade: string, junior: boolean) => boolean,
): Promise<(RoundFixture & { juniorFixtureId: number; row: JuniorFixtureRow })[]> {
  const rows = await db
    .select()
    .from(juniorFixturesTable)
    .where(
      and(
        eq(juniorFixturesTable.tenantId, tenantId),
        gt(juniorFixturesTable.startAt, anchor),
        lte(juniorFixturesTable.startAt, new Date(anchor.getTime() + ROUND_WINDOW_MS)),
      ),
    );
  const out: (RoundFixture & { juniorFixtureId: number; row: JuniorFixtureRow })[] = [];
  for (const r of rows) {
    const grade = r.ageGroup ?? r.grade ?? "";
    if (!r.startAt || !grade || !allows(grade, true)) continue;
    out.push({
      id: r.id,
      grade,
      roundLabel: null,
      opponentName: r.opponentName ?? "",
      venue: r.venue,
      startAt: r.startAt,
      isHome: r.isHome ?? false,
      juniorTeam: { ageGroup: r.ageGroup ?? null, teamName: r.teamName ?? null },
      juniorFixtureId: r.id,
      row: r,
    });
  }
  return out;
}

/** The scheduled week's fixtures for a per-round card, grouped, rounds not yet started. */
async function scheduledRounds(
  tenantId: number,
  now: Date,
  anchor: Date,
  allows: (grade: string, junior: boolean) => boolean,
  opts: { byAudience?: boolean; juniors?: JuniorPackaging | null } = {},
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
  const all: RoundFixture[] = fixtures.filter((f) => allows(f.grade, isJuniorGradeLabel(f.grade)));
  // Junior-sync fixtures join only when the row lists junior grades (KTD6).
  if (opts.juniors) all.push(...(await juniorRoundFixtures(tenantId, anchor, allows)));
  return groupFixtureRounds(all, {
    byAudience: opts.byAudience,
    ...(opts.juniors ? { juniors: opts.juniors } : {}),
  }).filter((r) => (r.fixtures[0]?.startAt.getTime() ?? 0) > now.getTime());
}

/** The row's junior packaging when it lists any junior grade, else null. */
function juniorsFor(gates: DraftingGates, row: "results" | "gameDay" | "teamLists") {
  return gates.juniorsAny(row) ? gates.juniorPackaging(row) : null;
}

/** Game day as one round set, at the club's chosen day and hour. */
export async function generateRoundGameDayDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const gates = draftingGates(settings, await tenantIsCentral(tenantId));
  const schedule = resolveRoundSchedules(settings?.roundSchedules).gameDay;
  if (!gates.gameDayRound()) return result;

  const anchor = lastScheduledAt(now, schedule);
  const rounds = await scheduledRounds(tenantId, now, anchor, gates.gameDayGrade, {
    juniors: juniorsFor(gates, "gameDay"),
  });
  for (const round of rounds) {
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "gameday-round",
      family: "matchday",
      sourceKey: `gameday-round:${round.key}`,
      cardInput: roundToGameDayInput(round),
      appPath: "/fixtures",
      sourceMatchIsJunior: round.hasJuniors,
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
  const gates = draftingGates(settings, await tenantIsCentral(tenantId));
  const schedule = resolveRoundSchedules(settings?.roundSchedules).teamLists;
  if (!gates.teamListsRound()) return result;

  const anchor = lastScheduledAt(now, schedule);
  // Men's and women's teams post as their own sets (juniors apart as always).
  const juniors = juniorsFor(gates, "teamLists");
  const rounds = await scheduledRounds(tenantId, now, anchor, gates.teamListsGrade, {
    byAudience: true,
    juniors,
  });
  if (rounds.length === 0) return result;

  const lists = await db
    .select({ fixtureId: teamListsTable.fixtureId, players: teamListsTable.players })
    .from(teamListsTable)
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.isPublished, true)));
  const byFixture = new Map(lists.map((l) => [l.fixtureId, l.players]));

  // Junior-sync team lists, named in the club's junior style (never a photo, KTD6).
  const juniorFixtureIds = rounds.flatMap((r) =>
    r.fixtures.flatMap((f) => (f.juniorFixtureId != null ? [f.juniorFixtureId] : [])),
  );
  const juniorLists = juniorFixtureIds.length
    ? await db
        .select({
          fixtureId: juniorTeamListsTable.juniorFixtureId,
          players: juniorTeamListsTable.players,
        })
        .from(juniorTeamListsTable)
        .where(
          and(
            eq(juniorTeamListsTable.tenantId, tenantId),
            eq(juniorTeamListsTable.isPublished, true),
            inArray(juniorTeamListsTable.juniorFixtureId, juniorFixtureIds),
          ),
        )
    : [];
  const byJuniorFixture = new Map(juniorLists.map((l) => [l.fixtureId, l.players]));
  const juniorTools = juniorLists.length
    ? await (async () => {
        const [{ juniorCardNamer, juniorTeamListToCardInput }, { loadJuniorNaming }] =
          await Promise.all([import("./junior-team-list"), import("../junior-helpers")]);
        const nameOf = juniorCardNamer(
          await loadJuniorNaming(
            tenantId,
            juniorLists.flatMap((l) => l.players.map((p) => p.participantId)),
          ),
        );
        return { nameOf, toCardInput: juniorTeamListToCardInput };
      })()
    : null;
  const juniorNumbers = new Map<number, unknown>();
  const juniorNumbersFor = async (season: number) => {
    if (!juniorNumbers.has(season)) {
      const { loadJuniorSeasonShirtNumbers } = await import("../junior-shirt-numbers");
      juniorNumbers.set(
        season,
        await loadJuniorSeasonShirtNumbers(tenantId, season).catch(() => null),
      );
    }
    return (juniorNumbers.get(season) ?? null) as Parameters<
      NonNullable<typeof juniorTools>["toCardInput"]
    >[3];
  };

  // Season shirt numbers: read only when the club has the feature on.
  const shirtNumbers = teamListShirtNumberLoader(tenantId);
  for (const round of rounds) {
    const teams: Record<string, unknown>[] = [];
    for (const f of round.fixtures) {
      if (f.juniorFixtureId != null) {
        const players = byJuniorFixture.get(f.juniorFixtureId);
        const row = (f as RoundFixture & { row?: JuniorFixtureRow }).row;
        if (!players || !row || !juniorTools) continue;
        const { kind: _kind, ...team } = juniorTools.toCardInput(
          row,
          players,
          juniorTools.nameOf,
          await juniorNumbersFor(row.seasonStartYear),
        );
        if ((team.players as unknown[]).length > 0) teams.push(team);
        continue;
      }
      const players = byFixture.get(f.id);
      if (!players) continue;
      // Each team is exactly the fixture's own team-list card (fill-ins excluded).
      const debuts = await loadAutoDebuts(tenantId, players, f.startAt);
      const { kind: _kind, ...team } = teamListToCardInput(
        f as FixtureRow,
        players,
        debuts,
        await shirtNumbers(teamListSeasonOf(f as FixtureRow), teamListCategoryOf(f as FixtureRow)),
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
        ...(round.audience ? { audience: AUDIENCE_LABEL[round.audience] } : {}),
        teams,
        // Any junior team makes the whole set a junior card (KTD6).
        ...(round.hasJuniors ? { junior: true, juniorTeams: juniorTeamsOf(round.fixtures) } : {}),
      },
      appPath: "/fixtures",
      sourceMatchIsJunior: round.hasJuniors,
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
 * The round's match results as one carousel, at the club's chosen day and hour: the
 * latest round the club played in the week before that moment, as the weekend wrap
 * (its cover) followed by each match's own result card, in the club's grade order.
 * Drafted when match results are "perRound" or "both". Central-data clubs only (the
 * wrap reads central results); seniors only, as central data holds no junior grades.
 */
export async function generateWeekendWrapDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const central = await tenantIsCentral(tenantId);
  // The round carousel's day and hour stay on the weekend-wrap schedule
  // (release 1); whether it drafts is the Posting Plan's Results row.
  const gates = draftingGates(settings, central);
  if (!central || !gates.resultsCarousel()) return result;

  const played = await latestPlayedRound(tenantId, settings, now);
  if (!played) return result;
  const { clubId, season, round } = played;
  const { centralWeekendWrap } = await import("@workspace/db/central-queries");

  const { merges } = await loadClubIdentity(tenantId);
  const wrap = await centralWeekendWrap(clubId, season, round, merges);
  if (wrap.matches.length === 0) return result;

  // The round as a carousel (Ash, 6 Oct 2026): the wrap is its cover, then each match's own
  // result card in the same grade order. A match whose scorecard can't be read keeps its row
  // on the cover but gets no slide.
  const ordered = await inClubGradeOrder(tenantId, wrap.matches);
  const rows: typeof ordered = [];
  const results: Record<string, unknown>[] = [];
  for (const m of ordered) {
    const detail = await loadCentralMatchDetail({ tenantId, clubId }, m.matchId);
    if (detail) {
      rows.push(m);
      results.push(
        matchToSummaryInput(detail as unknown as MatchDetail) as Record<string, unknown>,
      );
    }
  }
  const listed = [...rows, ...ordered.filter((m) => !rows.includes(m))];
  const seniorRows = listed.map((m) => ({
    gradeLabel: m.gradeLabel,
    resultLine: m.resultLine,
    performers: m.performers,
    outcome: WRAP_OUTCOME[m.outcome] ?? "draw",
  }));

  // Junior results from the junior sync, when the row lists junior age groups (KTD6):
  // in the same carousel after the seniors, or as their own set.
  const juniors = juniorsFor(gates, "results");
  const juniorSet = juniors
    ? await juniorRoundResults(tenantId, played.from, played.to, gates)
    : null;

  const upsert = (
    key: string,
    cover: typeof seniorRows,
    slides: Record<string, unknown>[],
    junior: { teams: JuniorTeamRef[]; photo?: ReturnType<typeof juniorPhotoFields> } | null,
  ) =>
    upsertDraftByKey({
      tenantId,
      engine: "weekendwrap-round",
      family: "roundup",
      sourceKey: key,
      cardInput: {
        kind: "weekendWrap",
        roundLabel: wrap.roundLabel.toUpperCase(),
        dateRange: wrap.dateRange,
        matches: cover,
        results: slides,
        // Any junior slide makes the whole set a junior card (KTD6).
        ...(junior ? { junior: true, juniorTeams: junior.teams } : {}),
        // A junior-only set may feature one allowed player's own photo (ADR-007); a
        // combined set keeps the senior pick and its junior slides stay photo-less.
        ...(junior?.photo ? junior.photo.cardInput : {}),
      },
      appPath: "/fixtures",
      sourceMatchIsJunior: junior != null,
      ...(junior?.photo ? { photo: junior.photo.photo } : {}),
      sourceImportedAt: now,
    });

  const count = (action: string) => {
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  };

  if (juniors === "combined" && juniorSet && juniorSet.slides.length > 0) {
    const { action } = await upsert(
      `weekendwrap-round:${season}:${round}`,
      [...seniorRows, ...juniorSet.cover],
      [...results, ...juniorSet.slides],
      { teams: juniorSet.teams },
    );
    count(action);
    return result;
  }
  count((await upsert(`weekendwrap-round:${season}:${round}`, seniorRows, results, null)).action);
  if (juniors === "separate" && juniorSet && juniorSet.slides.length > 0) {
    count(
      (
        await upsert(
          `weekendwrap-round:${season}:${round}:junior`,
          juniorSet.cover,
          juniorSet.slides,
          {
            teams: juniorSet.teams,
            photo: juniorPhotoFields(
              pickJuniorCardPhoto(
                await juniorPhotoLoader(tenantId, juniorSet.candidates)("weekendWrap"),
                juniorSet.candidates,
                `weekendwrap-round:${season}:${round}:junior`,
                juniorSet.preferred,
              ),
            ),
          },
        )
      ).action,
    );
  }
  return result;
}

/**
 * The club's synced junior results in a round's date window, as weekend-wrap cover
 * rows and result slides. Only finished, scored matches of age groups the Match
 * result row lists; names follow the club's junior naming (private players withheld).
 */
async function juniorRoundResults(
  tenantId: number,
  from: string,
  to: string,
  gates: DraftingGates,
): Promise<{
  cover: {
    gradeLabel: string;
    resultLine: string;
    performers: string;
    outcome: "won" | "lost" | "draw";
  }[];
  slides: Record<string, unknown>[];
  teams: JuniorTeamRef[];
  /** Club players in these matches who may feature a photo, top performers first (ADR-007). */
  candidates: string[];
  preferred: string[];
}> {
  const rows = await db
    .select({
      id: juniorMatchesTable.id,
      ageGroup: juniorMatchesTable.ageGroup,
      grade: juniorMatchesTable.grade,
      teamName: juniorMatchesTable.teamName,
      hhResult: juniorMatchesTable.hhResult,
      matchDate: juniorMatchesTable.matchDate,
    })
    .from(juniorMatchesTable)
    .where(
      and(
        eq(juniorMatchesTable.tenantId, tenantId),
        gte(juniorMatchesTable.id, JUNIOR_SYNC_ID_START),
        ne(juniorMatchesTable.status, "IN_PROGRESS"),
        gte(juniorMatchesTable.matchDate, from),
        lte(juniorMatchesTable.matchDate, to),
      ),
    );
  const allowed = rows.filter((m) => gates.resultsGrade(m.ageGroup ?? m.grade ?? "", true));
  const out = {
    cover: [] as never[],
    slides: [] as Record<string, unknown>[],
    teams: [] as JuniorTeamRef[],
    candidates: [] as string[],
    preferred: [] as string[],
  } as {
    cover: {
      gradeLabel: string;
      resultLine: string;
      performers: string;
      outcome: "won" | "lost" | "draw";
    }[];
    slides: Record<string, unknown>[];
    teams: JuniorTeamRef[];
    candidates: string[];
    preferred: string[];
  };
  if (allowed.length === 0) return out;
  const [
    { loadJuniorMatchDetail, juniorPhotoCandidates },
    { loadJuniorNaming },
    { getTenantBrand },
  ] = await Promise.all([
    import("../match-summary-drafter"),
    import("../junior-helpers"),
    import("../tenant-brand"),
  ]);
  const brand = await getTenantBrand(tenantId);
  const naming = await loadJuniorNaming(tenantId);
  const seen = new Set<string>();
  for (const m of allowed.sort(
    (a, b) => (a.matchDate ?? "").localeCompare(b.matchDate ?? "") || a.id - b.id,
  )) {
    const detail = await loadJuniorMatchDetail(m.id, tenantId, naming);
    if (!detail) continue;
    const input = juniorMatchToSummaryInput(
      detail as Parameters<typeof juniorMatchToSummaryInput>[0],
      brand,
    );
    const resultText = m.hhResult ?? "";
    out.cover.push({
      gradeLabel: [m.ageGroup ?? m.grade ?? "", m.teamName ?? ""].filter(Boolean).join(" · "),
      resultLine: (input as { result?: string }).result ?? resultText,
      performers: "",
      outcome: /\bwon\b/i.test(resultText) ? "won" : /\blost\b/i.test(resultText) ? "lost" : "draw",
    });
    out.slides.push(input as unknown as Record<string, unknown>);
    const who = juniorPhotoCandidates(detail as Parameters<typeof juniorPhotoCandidates>[0]);
    out.candidates.push(...who.candidates);
    out.preferred.push(...who.preferred);
    const ref = { ageGroup: m.ageGroup ?? null, teamName: m.teamName ?? null };
    const key = `${ref.ageGroup ?? ""}|${ref.teamName ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.teams.push(ref);
    }
  }
  return out;
}

/**
 * The round the weekend-wrap cadence posts: the latest round the club played
 * in the six days before the weekend-wrap anchor (its day and hour), with that
 * round's matches. Central clubs only. Shared by the results, club
 * leaderboards and ladders round carousels (plan 2026-10-07-001 KTD9).
 */
export async function latestPlayedRound(
  tenantId: number,
  settings: SocialSettingsRow | null,
  now: Date,
): Promise<{
  clubId: number;
  season: number;
  round: number;
  /** The club-time date window (YYYY-MM-DD, inclusive) the round was found in. */
  from: string;
  to: string;
  matches: { id: number; grade: string; matchDate: string | null; abandoned: boolean }[];
} | null> {
  const schedule = resolveRoundSchedules(settings?.roundSchedules).weekendWrap;
  const anchor = lastScheduledAt(now, schedule);
  const toDay = (d: Date) => new Date(d.getTime() + CLUB_OFFSET_MS).toISOString().slice(0, 10);
  const from = toDay(new Date(anchor.getTime() - 6 * 24 * HOUR_MS));
  const to = toDay(anchor);
  const { centralClubMatches } = await import("@workspace/db/central-queries");
  const clubId = await getTenantCentralClubId(tenantId);
  const season = seasonOf(anchor);
  const all = await centralClubMatches(clubId, { season });
  const played = all.filter(
    (m) => m.round != null && m.matchDate != null && m.matchDate >= from && m.matchDate <= to,
  );
  if (played.length === 0) return null;
  const latest = played.reduce((a, b) => ((b.matchDate ?? "") > (a.matchDate ?? "") ? b : a));
  const round = latest.round!;
  return { clubId, season, round, from, to, matches: played.filter((m) => m.round === round) };
}

/**
 * Club leaderboards as one round carousel (Posting Plan U4): one card per
 * category (runs, wickets, catches, dismissals), each listing every senior
 * grade's season leader. Drafted on the weekend-wrap cadence; refreshed while
 * unposted; nothing when no category has a leader yet.
 */
export async function generateClubLeaderboardDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const central = await tenantIsCentral(tenantId);
  if (!central || !draftingGates(settings, central).clubLeaderboards()) return result;
  const played = await latestPlayedRound(tenantId, settings, now);
  if (!played) return result;
  const { clubId, season, round } = played;

  const { centralClubTotalsBySeason } = await import("@workspace/db/central-queries");
  const { merges } = await loadClubIdentity(tenantId);
  const grades = await centralClubTotalsBySeason(clubId, season, merges);
  const cardInput = clubLeaderboardCarousel(season, grades);
  if (!cardInput) return result;

  const { action } = await upsertDraftByKey({
    tenantId,
    engine: "clubleaderboard-round",
    family: "roundup",
    sourceKey: `clubleaderboard-round:${season}:${round}`,
    cardInput: { ...cardInput },
    appPath: "/records",
    sourceImportedAt: now,
  });
  if (action === "inserted") result.drafted++;
  else if (action === "refreshed") result.refreshed++;
  return result;
}

/**
 * Ladders as one round carousel (Posting Plan U5): one card per published
 * PlayHQ ladder table for each senior grade the club played this round, in
 * the club's grade order. A grade's ladder is used only once the club's
 * games-played count on it has caught up with its finished matches this
 * season (KTD7), so a scrape taken before PlayHQ recalculated never posts
 * last week's standings. Grades with no published ladder are skipped.
 */
export async function generateLadderDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<RoundSetResult> {
  const result: RoundSetResult = { drafted: 0, refreshed: 0 };
  const settings = await loadSettings(tenantId);
  const central = await tenantIsCentral(tenantId);
  const gates = draftingGates(settings, central);
  if (!central || !gates.ladders()) return result;
  const orgId = await getTenantPlayhqOrgId(tenantId);
  if (!orgId) return result;
  const played = await latestPlayedRound(tenantId, settings, now);
  if (!played) return result;
  const { clubId, season, round } = played;

  const { centralClubMatches, playhqGradeIdsForCentralMatches, playhqGradeLadderUncached } =
    await import("@workspace/db/central-queries");
  const seasonMatches = await centralClubMatches(clubId, { season });
  const gradeIdOf = await playhqGradeIdsForCentralMatches(seasonMatches.map((m) => m.id));
  const roundDate = played.matches.reduce(
    (d, m) => ((m.matchDate ?? "") > d ? m.matchDate! : d),
    "",
  );

  // One entry per PlayHQ grade the club played this round.
  const grades = new Map<string, { gradeLabel: string; gradeId: string }>();
  for (const m of played.matches) {
    const gradeId = gradeIdOf.get(m.id);
    // Juniors never appear, whatever the row ticks (R13).
    if (!gradeId || m.abandoned || isJuniorGradeLabel(m.grade) || !gates.ladderGrade(m.grade))
      continue;
    grades.set(gradeId, { gradeLabel: m.grade, gradeId });
  }
  const finished = (gradeId: string) =>
    seasonMatches.filter(
      (m) =>
        gradeIdOf.get(m.id) === gradeId &&
        !m.abandoned &&
        m.result != null &&
        (m.matchDate ?? "") <= roundDate,
    ).length;

  const slides: LadderCardInput[] = [];
  for (const g of await inClubGradeOrder(tenantId, [...grades.values()])) {
    const ladder = await playhqGradeLadderUncached(g.gradeId, orgId);
    if (!ladder) continue;
    const need = finished(g.gradeId);
    const several = ladder.ladders.length > 1;
    for (const table of ladder.ladders) {
      const club = table.teams.find((t) => t.isClub);
      if (!club || (club.played ?? 0) < need) continue;
      slides.push(
        ladderInput({
          grade: g.gradeLabel,
          tableName: several ? table.name : null,
          asOfLabel: `AFTER ROUND ${round}`,
          teams: table.teams,
        }),
      );
    }
  }
  const cardInput = ladderCarousel(slides);
  if (!cardInput) return result;

  const { action } = await upsertDraftByKey({
    tenantId,
    engine: "ladder-round",
    family: "roundup",
    sourceKey: `ladder-round:${season}:${round}`,
    cardInput: { ...cardInput },
    appPath: "/fixtures",
    sourceImportedAt: now,
  });
  if (action === "inserted") result.drafted++;
  else if (action === "refreshed") result.refreshed++;
  return result;
}
