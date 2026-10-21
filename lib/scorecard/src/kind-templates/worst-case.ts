/**
 * Worst-case content (ADR-011 §4, task T2.2): what the fit check draws on
 * each variant of the fit matrix (`fit-matrix.ts`), so a template that fits
 * here fits every real card.
 *
 * - The longest team, competition, ground and player names the associations
 *   produce (`worst-case-names.ts`, refreshed by a script; player names are
 *   stand-ins of the same shape).
 * - The most digits scores and figures take ("9/432", "10/123", 287*).
 * - Rows filled to the layout's capacity, which the caller passes per repeat
 *   (`documentRowsCapacity`); a sensible maximum otherwise.
 * - Every optional field on at Full; the preset decides what shows.
 * - Junior variants: junior grade names, "Private Player" rows.
 *
 * Content kinds are built through the ADR-010 builders and projected with the
 * variant's visible fields, exactly as a carousel slide is. Pure data: the
 * web renderer binds it like any card input.
 */

import { contentInput } from "../card-content/render-input";
import {
  ladderContent,
  lastMeetingContent,
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  milestoneWatchContent,
} from "../card-content/match-day";
import { matchDayDayContent } from "../card-content/day";
import { resultContent, resultDayContent } from "../card-content/result";
import { teamListContent } from "../card-content/team-list";
import { presetFields } from "../card-content/settings";
import type { CardContent, MatchDayFixtureContent, ResultContent } from "../card-content/types";
import type { MatchSummaryInput } from "../match-summary-types";
import type { FitVariant } from "./fit-matrix";
import type { PageKey } from "./format";
import { templateKindFor } from "./pages";
import { WORST_CASE_NAMES } from "./worst-case-names";

const N = WORST_CASE_NAMES;
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length]!;

/** The longest names, by role. */
export const WORST = {
  player: N.players[0],
  /** A name whose longest word can't wrap. */
  playerLongWord: N.playersLongWord[0],
  team: N.teams[0].raw,
  grade: N.grades[0].raw,
  juniorGrade: N.juniorGrades[0].raw,
  venue: N.venues[0],
  sponsor: "Mandurah Toyota & Peel Automotive Group Pty Ltd",
  club: "Rockingham Mandurah Districts Cricket Club",
  hashtag: "#ROCKINGHAMMANDURAHDISTRICTS",
  tagline: "Cricket Club · Established 1897 · Home of the Mariners",
  livestream: "https://www.youtube.com/@RockinghamMandurahDistrictsCricketClub/live",
  /** The masked name of a private junior (`match-summary-input.ts`). */
  privatePlayer: "Private Player",
} as const;

/** How many rows a repeat holds when the caller doesn't say. */
export const DEFAULT_ROWS: Readonly<Record<string, number>> = {
  players: 12,
  rows: 10,
  matches: 6,
  leaders: 6,
  fixtures: 6,
  highlights: 6,
  results: 4,
  dayRows: 7,
  sponsors: 12,
};

export interface WorstCaseOptions {
  /** Rows to fill per repeat key: the layout's capacity at the variant's size. */
  rows?: Partial<Record<string, number>>;
  /** An image URL for a named slot; tiny inline SVGs by default. */
  image?: (name: string) => string;
}

/** Tenant data for a worst-case render: `PackCardData`'s brand, sponsors and photo. */
export interface WorstCaseData {
  brand: { name: string; tagline: string; logoUrl: string; groundPhotoUrl: string };
  hashtag: string;
  presentingSponsorName: string | null;
  sponsors: Array<{ name: string; logoUrl: string }>;
  photoUrl: string | null;
}

export interface WorstCaseCard {
  /** The input's kind (`matchSummary` for the Results set). */
  kind: string;
  page: PageKey;
  input: Record<string, unknown>;
  data: WorstCaseData;
  /** The content fields shown (content kinds), else null. */
  visible: string[] | null;
  junior: boolean;
  sponsorsOn: boolean;
}

/** A flat SVG placeholder image (no network), named for its slot. */
export function placeholderImage(name: string, w = 600, h = 600): string {
  const safe = name.replace(/[^A-Za-z0-9_.-]/g, "_");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<title>worst-case:${safe}</title><rect width="${w}" height="${h}" fill="#7a7a7a"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Round, date and time labels at their longest. */
const ROUND = "Round 15";
const DATE = "WED 31 DEC";
const TIME = "12:30 PM";
const DAY = "2026-10-10";

// ── Content kinds ───────────────────────────────────────────────────────────

function fixture(i: number, junior: boolean, image: (n: string) => string): MatchDayFixtureContent {
  const c = matchDayFixtureContent(
    {
      id: 100 + i,
      grade: junior ? pick(N.juniorGrades, i).raw : pick(N.grades, i).raw,
      roundLabel: ROUND,
      opponentName: pick(N.teams, i).raw,
      opponentLogoUrl: image(`opposition${i}`),
      venue: pick(N.venues, i),
      // 9 am Perth onwards, an hour apart: always the same club day.
      startAt: new Date(Date.UTC(2026, 9, 10, 1 + i)),
      isHome: i % 2 === 1,
    },
    junior ? { junior: true, juniorTeamName: `${pick(N.juniorGrades, i).card} Blue` } : {},
  );
  if (junior) return c;
  return {
    ...c,
    ladder: ladderContent({
      teams: 14,
      tableName: null,
      club: { rank: 12 },
      opposition: { rank: 13 },
    })!,
    lastMeeting: lastMeetingContent({
      outcome: "won",
      margin: "10 wickets (DLS method)",
      date: "2026-02-07",
      season: "2025/26",
    })!,
    milestoneWatch: milestoneWatchContent({
      playerName: WORST.player,
      stat: "wickets",
      tier: 100,
      gap: 3,
    })!,
  };
}

function summary(i: number, junior: boolean, image: (n: string) => string): MatchSummaryInput {
  const name = (j: number) =>
    junior && j % 2 === 1 ? WORST.privatePlayer : pick(N.players, i + j);
  const innings = (teamKey: "club" | "opposition", n: 1 | 2, total: string) => ({
    teamKey,
    inningsNum: n,
    totalRuns: total,
    wickets: "9",
    overs: "49.5",
    declared: n === 1,
    topBatters: [0, 1, 2].map((j) => ({
      name: name(j),
      runs: 287 - j * 90,
      balls: 199,
      notOut: j === 0,
    })),
    topBowlers: [0, 1, 2].map((j) => ({
      name: name(j + 3),
      wickets: 10 - j * 3,
      runs: 123,
      overs: "49.5",
    })),
  });
  return {
    kind: "matchSummary",
    matchTitle: `${junior ? pick(N.juniorGrades, i).raw : pick(N.grades, i).raw} • ${ROUND}`,
    roundLabel: ROUND,
    matchType: "Two Day",
    date: "Wed 31 Dec 2026",
    venue: pick(N.venues, i),
    result: `${WORST.club} won by 10 wickets (DLS method)`,
    resultWinner: "club",
    club: {
      name: WORST.club,
      primaryColor: "#333F48",
      secondaryColor: "#FBAC27",
      textColor: "#F5F2E8",
      logoUrl: image(`club${i}`),
    },
    opposition: {
      name: pick(N.teams, i).raw,
      primaryColor: "#1E3A5F",
      secondaryColor: "#FFFFFF",
      textColor: "#FFFFFF",
      logoUrl: image(`opposition${i}`),
    },
    innings: [
      innings("opposition", 1, "432"),
      innings("club", 1, "421"),
      innings("opposition", 2, "398"),
      innings("club", 2, "410"),
    ],
    headline: "MATCH RESULT",
    ...(junior ? { junior: true } : {}),
  };
}

function result(
  kind: "results" | "matchSummary",
  i: number,
  junior: boolean,
  image: (n: string) => string,
): ResultContent {
  return resultContent(summary(i, junior, image), {
    kind,
    matchId: 200 + i,
    junior,
    grade: junior ? pick(N.juniorGrades, i).raw : pick(N.grades, i).raw,
    day: DAY,
  });
}

function teamPlayers(n: number, junior: boolean) {
  return Array.from({ length: n }, (_, i) => {
    const privateRow = junior && i % 3 === 1;
    const surname = privateRow
      ? WORST.privatePlayer
      : pick(N.players, i).split(" ").slice(1).join(" ");
    return {
      order: i === n - 1 && n >= 12 ? 12 : i + 1,
      surname: surname.toUpperCase(),
      ...(privateRow ? {} : { firstInitial: pick(N.players, i).charAt(0) }),
      ...(i === 0 ? { role: "C/WK" } : i === 1 ? { role: "VC" } : {}),
      ...(i === 2 && !junior ? { debut: true } : {}),
      ...(i === 3 && !junior ? { overseas: true } : {}),
      shirtNumber: String(100 + i),
    };
  });
}

function contentFor(
  kind: string,
  page: PageKey,
  junior: boolean,
  rows: (key: string) => number,
  image: (n: string) => string,
): CardContent {
  if (kind === "matchDay") {
    if (page === "fixture") return fixture(0, junior, image);
    if (page === "day")
      return matchDayDayContent(
        Array.from({ length: rows("dayRows") }, (_, i) => fixture(i, true, image)),
      );
    const bookend = {
      heading: "Round fifteen — every team, every ground, all weekend long",
      from: DAY,
      to: "2026-10-11",
      roundLabels: [ROUND],
      fixtureCount: 99,
      livestreamUrl: WORST.livestream,
    };
    if (page === "title") return matchDayTitleContent(bookend);
    return matchDaySponsorsContent({
      ...bookend,
      sponsors: Array.from({ length: rows("sponsors") }, (_, i) => ({
        name: `${WORST.sponsor} ${i + 1}`,
        logoUrl: image(`sponsor${i + 1}`),
        tier: i < 3 ? "major" : "standard",
        teamSponsor: i >= rows("sponsors") - 2,
      })),
      nextHomeGame: fixture(9, false, image),
      socials: ["@rockinghammandurahdistricts", "Rockingham Mandurah Districts CC", "rmdcc.com.au"],
    });
  }
  if (kind === "teamList") {
    const players = teamPlayers(rows("players"), junior);
    return teamListContent(
      {
        id: 300,
        grade: junior ? WORST.juniorGrade : WORST.grade,
        roundLabel: ROUND,
        opponentName: WORST.team,
        opponentLogoUrl: image("opposition0"),
        venue: WORST.venue,
        startAt: new Date(Date.UTC(2026, 9, 10, 2)),
      },
      {
        kind: "teamList",
        gradeRound: `${junior ? WORST.juniorGrade : WORST.grade} — ${ROUND}`.toUpperCase(),
        competitionLine: `${WORST.grade} • Two Day`,
        venueDateTime: `${WORST.venue} • ${DATE} • ${TIME}`,
        roundLabel: ROUND.toUpperCase(),
        opponent: WORST.team,
        venue: WORST.venue,
        date: DATE,
        startTime: TIME,
        homeAway: "AWAY",
        numbering: "shirt",
        players,
        ...(junior ? { junior: true } : {}),
      },
      junior ? { junior: true, juniorTeamName: `${N.juniorGrades[0].card} Blue` } : {},
    );
  }
  const resultKind = kind === "results" ? "results" : "matchSummary";
  if (page === "day")
    return resultDayContent(
      Array.from({ length: rows("dayRows") }, (_, i) => result(resultKind, i, true, image)),
    );
  return result(resultKind, 0, junior, image);
}

// ── Every other kind ────────────────────────────────────────────────────────

/** Rows of a list, each a variation on `row(i)`, `n` of them. */
const list = <T>(n: number, row: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => row(i));

function cardInput(
  kind: string,
  rows: (key: string) => number,
  image: (n: string) => string,
  photo: boolean,
): Record<string, unknown> {
  const p = WORST.player;
  const photoUrl = photo ? image("photo") : null;
  const team = WORST.team;
  const grade = WORST.grade;
  switch (kind) {
    case "milestone":
      return {
        kind,
        playerName: p,
        tierLabel: "Ten Thousand Club",
        tierIndex: 2,
        milestoneLabel: "Career Runs Across All Grades",
        currentValue: 10000,
        threshold: 10000,
        headline: "10,000 CAREER RUNS",
        photoUrl,
        shirtNumber: "100",
      };
    case "player":
      return {
        kind,
        playerName: p,
        gradesPlayed: grade,
        stats: [
          { label: "Runs", value: 12345 },
          { label: "Wickets", value: 999 },
          { label: "Matches", value: 350 },
        ],
        headline: "PLAYER SPOTLIGHT",
        photoUrl,
        shirtNumber: "100",
      };
    case "record":
      return {
        kind,
        title: "Highest Partnership for Any Wicket",
        playerName: p,
        value: "287*",
        grade,
        headline: "CLUB RECORD",
        photoUrl,
      };
    case "gradeLeader":
      return {
        kind,
        grade,
        category: "Runs",
        playerName: p,
        value: 1234,
        headline: "LEADERBOARD",
        photoUrl,
      };
    case "premiership":
      return {
        kind,
        grade,
        year: 2025,
        competition: `${grade} Two Day Premiership`,
        result: `${WORST.club} won by 10 wickets (DLS method)`,
        mom: p,
        headline: "PREMIERS",
        teamPhotoUrl: photoUrl,
      };
    case "debut":
      return {
        kind,
        playerName: p,
        grade,
        capNumber: 1234,
        season: "2025/26",
        opponent: team,
        round: 15,
        headline: "DEBUT",
        photoUrl,
      };
    case "century":
      return {
        kind,
        playerName: p,
        grade,
        runs: 287,
        balls: 199,
        notOut: true,
        opponent: team,
        round: 15,
        headline: "CENTURY",
        photoUrl,
        shirtNumber: "100",
      };
    case "fiveFor":
      return {
        kind,
        playerName: p,
        grade,
        wickets: 10,
        runsConceded: 123,
        overs: "49.5",
        figures: "10/123",
        opponent: team,
        round: 15,
        headline: "FIVE-FOR",
        photoUrl,
        shirtNumber: "100",
      };
    case "weekendWrap":
      return {
        kind,
        roundLabel: "ROUND 15 WRAP",
        dateRange: "SAT 31 – SUN 1 JAN",
        matches: list(rows("matches"), (i) => ({
          gradeLabel: pick(N.grades, i).card.toUpperCase(),
          resultLine: `def. ${pick(N.teams, i).raw} by 10 wickets (DLS method)`,
          performers: `${pick(N.players, i)} 287* • ${WORST.playerLongWord} 10/123`,
          outcome: (["won", "lost", "draw"] as const)[i % 3],
        })),
      };
    case "ladder":
      return {
        kind,
        competitionName: grade.toUpperCase(),
        gradeLabel: grade.toUpperCase(),
        asOfLabel: "AFTER ROUND 15",
        rows: list(rows("rows"), (i) => ({
          pos: i + 1,
          team: pick(N.teams, i).raw,
          played: 18,
          won: 18 - i,
          lost: i,
          points: 132 - i * 6,
          ...(i === 0 ? { isClub: true } : {}),
        })),
      };
    case "bigMoment":
      return {
        kind,
        momentLabel: "CENTURY ALERT",
        playerName: p,
        runs: 287,
        balls: 199,
        boundaryDetail: "28 fours • 12 sixes",
        oppositionName: team,
        inningsLabel: "2ND INNINGS",
        liveScore: "9/432",
        oversChaseLine: "49.5 overs · need 123 off 18 balls",
        equation: "Brings up his ton with a six over mid-wicket off the last ball of the over",
        photoUrl,
      };
    case "newSigning": {
      const [first, ...rest] = p.split(" ");
      return {
        kind,
        playerFirstName: first,
        playerLastName: rest.join(" "),
        role: "Wicket-keeper batter",
        formerClub: team,
        headline: "WELCOME TO THE CLUB",
        season: "2025/26",
        photoUrl,
      };
    }
    case "countdown":
      return {
        kind,
        daysToGo: "100",
        eventLabel: "SEASON OPENER",
        hypeLine1: "THE WAIT IS ALMOST OVER",
        hypeLine2: "GET AROUND THE CLUB THIS WEEKEND",
        dateVenue: `Wed 31 Dec • ${WORST.venue}`,
        fixtureLine: `${grade} vs ${team}`,
      };
    case "clubLeaderboard":
      return {
        kind,
        title: "CLUB RUN SCORERS",
        subtitle: "Leading run scorer in each grade this season",
        season: "2025/26",
        category: "Runs",
        leaders: list(rows("leaders"), (i) => ({
          gradeLabel: pick(N.grades, i).card.toUpperCase(),
          playerName: pick(N.players, i),
          value: "1,234",
        })),
      };
    case "roundFixtures":
      return {
        kind,
        roundLabel: "ROUND 15",
        date: "WEDNESDAY 31 DECEMBER",
        fixtures: list(rows("fixtures"), (i) => ({
          grade: pick(N.grades, i).card,
          opponent: pick(N.teams, i).raw,
          venue: pick(N.venues, i),
          startTime: "12:30",
        })),
      };
    case "tradingCard":
      return {
        kind,
        playerName: p,
        role: "Wicket-keeper batter",
        capNumber: 1234,
        season: "2025/26",
        stats: [
          { label: "Matches", value: "350" },
          { label: "Runs", value: "12,345" },
          { label: "Wickets", value: "999" },
          { label: "Average", value: "123.45" },
        ],
        photoUrl,
        shirtNumber: "100",
      };
    case "juniorHighlights":
      return {
        kind,
        grade: WORST.juniorGrade,
        roundLabel: "ROUND 15 · WEDNESDAY",
        highlights: list(rows("highlights"), (i) => ({
          name: i % 3 === 1 ? WORST.privatePlayer : pick(N.players, i),
          note: "Best bowling figures of the round",
          figure: "10/123",
        })),
      };
    case "teamListRound":
      return {
        kind,
        roundLabel: "ROUND 15",
        date: "WEDNESDAY 31 DECEMBER",
        teams: list(3, (i) => ({
          grade: pick(N.grades, i).card,
          gradeRound: `${pick(N.grades, i).card} · ROUND 15`.toUpperCase(),
          competitionLine: "TWO DAY",
          venueDateTime: `v ${pick(N.teams, i).raw} · Wed 31 Dec · 12:30 PM`,
          players: teamPlayers(12, false),
        })),
      };
    case "announcement":
      return {
        kind,
        eyebrow: "CLUB NEWS",
        headline: "Senior and junior registrations for the new season are now open",
        subline:
          "Register online before the first training session at the club this Thursday night",
      };
    case "sponsor":
      return {
        kind,
        seasonLabel: "2025/26",
        sponsorName: WORST.sponsor,
        tagline: "Proudly supporting our community and its cricket for twenty five years",
        sponsorLogoUrl: image("sponsorArt"),
      };
    case "resultsSummary":
      return {
        kind,
        dateLabel: "WEDNESDAY 31 DECEMBER",
        roundLabel: "ROUND 15",
        results: list(rows("results"), (i) => ({
          grade: pick(N.grades, i).card.toUpperCase(),
          clubName: WORST.club.toUpperCase(),
          clubScore: "9/432 (49.5)",
          oppName: pick(N.teams, i).raw.toUpperCase(),
          oppScore: "9/431 (49.5)",
          outcome: (["won", "lost", "draw"] as const)[i % 3],
          bat1Name: pick(N.players, i),
          bat1Figure: "287* (199)",
          bat2Name: WORST.playerLongWord,
          bat2Figure: "123 (99)",
          bowl1Name: pick(N.players, i + 1),
          bowl1Figure: "10/123 (49.5)",
          bowl2Name: pick(N.players, i + 2),
          bowl2Figure: "5/99 (20)",
        })),
      };
    case "teamOfWeek":
      return {
        kind,
        title: "SENIOR TEAM OF THE WEEK",
        dateLabel: "31 DECEMBER",
        players: list(rows("players"), (i) => ({
          name: pick(N.players, i),
          figure: "287* & 10/123",
          grade: pick(N.grades, i).card.toUpperCase(),
          ...(i === 0 ? { role: "(C)" } : i === 5 ? { role: "(WK)" } : {}),
          photoUrl: photo ? image(`player${i}`) : null,
        })),
      };
    default:
      throw new Error(`No worst-case content for card kind: ${kind}`);
  }
}

// ── The card for a variant ──────────────────────────────────────────────────

/** The worst-case card a fit-matrix variant draws for a template of `kind`. */
export function worstCaseCard(
  kind: string,
  variant: Pick<FitVariant, "page" | "contentKind" | "preset" | "photo" | "sponsors" | "junior">,
  opts: WorstCaseOptions = {},
): WorstCaseCard {
  const image = opts.image ?? ((name: string) => placeholderImage(name));
  const rows = (key: string) => Math.max(1, opts.rows?.[key] ?? DEFAULT_ROWS[key] ?? 6);
  const photo = variant.photo !== false;
  const sponsorsOn = variant.sponsors !== "none";
  const contentKind = variant.contentKind ?? templateKindFor(kind);
  const isContent = ["matchDay", "results", "matchSummary", "teamList"].includes(contentKind);
  const data: WorstCaseData = {
    brand: {
      name: WORST.club,
      tagline: WORST.tagline,
      logoUrl: image("clubLogo"),
      groundPhotoUrl: image("groundPhoto"),
    },
    hashtag: WORST.hashtag,
    presentingSponsorName: sponsorsOn ? WORST.sponsor : null,
    sponsors: sponsorsOn
      ? [1, 2, 3].map((n) => ({ name: `${WORST.sponsor} ${n}`, logoUrl: image(`sponsor${n}`) }))
      : [],
    photoUrl: photo && !variant.junior ? image("photo") : null,
  };

  if (!isContent)
    return {
      kind,
      page: variant.page,
      input: {
        ...cardInput(kind, rows, image, photo),
        ...(variant.junior ? { junior: true } : {}),
      },
      data,
      visible: null,
      junior: variant.junior || kind === "juniorHighlights",
      sponsorsOn,
    };

  const content = contentFor(contentKind, variant.page, variant.junior, rows, image);
  const visible = presetFields(contentKind, variant.preset ?? "full");
  const input = contentInput(content, visible, { hasCoverPhoto: photo });
  return {
    kind: templateKindFor(contentKind),
    page: variant.page,
    input: {
      ...input,
      // One match a slide: a fixture, result or team list is a carousel slide.
      ...(["fixture", "result", "team"].includes(variant.page) ? { carouselContent: true } : {}),
    },
    data,
    visible: [...visible],
    junior: variant.junior,
    sponsorsOn,
  };
}
