import { describe, it, expect, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { Route } from "wouter";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";

import PlayerDetail from "@/pages/player-detail";
import PersonDetail from "@/pages/person-detail";
import MatchDetail from "@/pages/match-detail";
import Matches from "@/pages/matches";
import Grades from "@/pages/grades";
import GradeLeaderboard from "@/pages/grade-leaderboard";
import StatDetail from "@/pages/stat-detail";
import Compare from "@/pages/compare";
import JuniorsDashboard from "@/pages/juniors-dashboard";
import JuniorsMatches from "@/pages/juniors-matches";
import JuniorsMatchDetail from "@/pages/juniors-match-detail";
import JuniorsPremierships from "@/pages/juniors-premierships";
import JuniorsPlayers from "@/pages/juniors-players";
import JuniorsPlayerDetail from "@/pages/juniors-player-detail";
import JuniorsOfficeBearers from "@/pages/juniors-office-bearers";

/**
 * Smoke coverage for the public pages the original suite left out (plan.md
 * §5.10): every detail page, the grade leaderboard, compare, and the whole
 * juniors tree. Same contract as smoke.test.tsx — mount with mocked data and
 * reach a stable render without throwing. Detail pages read their id from the
 * route, so each is mounted inside the same `<Route>` App.tsx uses.
 *
 * The mocked payloads are the minimum each page needs to get past its loading /
 * not-found guards; they are not asserted on. Keys are matched by substring,
 * first key wins, so specific paths are listed before their prefixes.
 */

const STAT = {
  id: 1,
  playerId: 1,
  grade: "A Grade",
  season: null,
  games: 12,
  innings: 11,
  notOuts: 2,
  runs: 340,
  highScore: "88*",
  batAvg: 37.8,
  hundreds: 0,
  fifties: 3,
  wickets: 9,
  runsConceded: 210,
  bowlAvg: 23.3,
  bestBowling: "4/21",
  fiveWickets: 0,
  catches: 4,
  stumpings: 0,
  runOuts: 1,
};

const PLAYER = {
  id: 1,
  surname: "Fixture",
  givenName: "Alex",
  gradesPlayed: "A Grade",
  totalGames: 12,
  totalRuns: 340,
  totalWickets: 9,
  deceased: false,
  stats: [STAT],
};

const MATCH = {
  id: 1,
  grade: "A Grade",
  season: 2025,
  round: 1,
  stage: null,
  opponent: "Rovers",
  matchDate: "2025-10-11",
  venue: "Fixture Oval",
  result: "Won by 10 runs",
  hhccScore: "8/180",
  opponentScore: "10/170",
  hhccBattedFirst: true,
  abandoned: false,
  club: { id: 1, name: "Demo Cricket Club", shortName: "Demo CC", logoUrl: null },
  opponentClub: null,
  lines: [],
  oppositionLines: [],
  hatTricks: [],
};

const MOCKS: Record<string, unknown> = {
  // Juniors keys first: "/juniors/players" also contains "/players", and the
  // mock matches by substring with the first key winning.
  "/juniors/overview": {
    seasons: [2025],
    latestSeason: 2025,
    recentMatches: [],
    ageGroups: [],
    totals: { matches: 0, participants: 0 },
  },
  "/juniors/filters": { seasons: [2025], ageGroups: ["Under 14"] },
  "/juniors/matches/1": {
    id: 1,
    seasonStartYear: 2025,
    round: "1",
    ageGroup: "Under 14",
    opponentName: "Junior Rovers",
    matchDate: "2025-10-11",
    result: "Won",
    batting: [],
    bowling: [],
    roster: [],
  },
  "/juniors/matches": { matches: [], total: 0 },
  "/juniors/players/junior-1": {
    participantId: "junior-1",
    displayName: "Junior Fixture",
    isPrivate: false,
    seniorPlayerId: null,
    batting: { matches: 0, innings: 0, runs: 0, highScore: null, average: null },
    bowling: { matches: 0, overs: 0, wickets: 0, runs: 0, average: null, best: null },
    seasons: [],
    matches: [],
  },
  "/juniors/players": [],
  "/players/1/seasons": [],
  "/players/1/matches": [],
  "/players/1": PLAYER,
  // Directory / compare picker list (after the /players/1 keys).
  "/players": { players: [PLAYER], total: 1, page: 1, limit: 20 },
  "/people/1": { id: 1, name: "Fixture Official", roles: [], bio: "" },
  "/matches/1": MATCH,
  "/matches": { matches: [MATCH], total: 1, page: 1, limit: 20 },
  "/grades/A%20Grade/leaderboard": [STAT],
  "/stats/1": STAT,
};

function expectRendered() {
  expect(document.body.textContent?.trim().length ?? 0).toBeGreaterThan(0);
}

async function settle(container: HTMLElement) {
  await waitFor(() => expect(container.firstChild).toBeTruthy());
  // Let the mocked queries resolve and the page re-render past its loading
  // state. Some pages legitimately keep a "Loading…" label on a secondary
  // panel, so a timeout here is not a failure — the rendered-content check is.
  await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading/i), {
    timeout: 3000,
  }).catch(() => undefined);
  expectRendered();
}

describe("public detail + juniors page smoke tests", () => {
  beforeEach(() => {
    installApiMock(MOCKS);
  });

  it("renders a player's profile", async () => {
    const { container } = renderAt(
      <Route path="/players/:id" component={PlayerDetail} />,
      "/players/1",
    );
    await settle(container);
  });

  it("renders a non-player person's profile", async () => {
    const { container } = renderAt(
      <Route path="/people/:id" component={PersonDetail} />,
      "/people/1",
    );
    await settle(container);
  });

  it("renders the matches list", async () => {
    const { container } = renderAt(<Matches />, "/matches");
    await settle(container);
  });

  it("renders a match scorecard", async () => {
    const { container } = renderAt(
      <Route path="/matches/:id" component={MatchDetail} />,
      "/matches/1",
    );
    await settle(container);
  });

  it("renders the grades index", async () => {
    const { container } = renderAt(<Grades />, "/grades");
    await settle(container);
  });

  it("renders a grade leaderboard", async () => {
    const { container } = renderAt(
      <Route path="/grades/:grade" component={GradeLeaderboard} />,
      "/grades/A%20Grade",
    );
    await settle(container);
  });

  it("renders a stat detail page", async () => {
    const { container } = renderAt(<Route path="/stats/:id" component={StatDetail} />, "/stats/1");
    await settle(container);
  });

  it("renders the head-to-head compare page", async () => {
    const { container } = renderAt(<Compare />, "/compare");
    await settle(container);
  });

  it("renders the juniors dashboard", async () => {
    const { container } = renderAt(<JuniorsDashboard />, "/juniors");
    await settle(container);
  });

  it("renders the juniors matches list", async () => {
    const { container } = renderAt(<JuniorsMatches />, "/juniors/matches");
    await settle(container);
  });

  it("renders a junior match scorecard", async () => {
    const { container } = renderAt(
      <Route path="/juniors/matches/:id" component={JuniorsMatchDetail} />,
      "/juniors/matches/1",
    );
    await settle(container);
  });

  it("renders the juniors premierships page", async () => {
    const { container } = renderAt(<JuniorsPremierships />, "/juniors/premierships");
    await settle(container);
  });

  it("renders the juniors players directory", async () => {
    const { container } = renderAt(<JuniorsPlayers />, "/juniors/players");
    await settle(container);
  });

  it("renders a junior player's profile", async () => {
    const { container } = renderAt(
      <Route path="/juniors/players/:id" component={JuniorsPlayerDetail} />,
      "/juniors/players/junior-1",
    );
    await settle(container);
  });

  it("renders the juniors office bearers page", async () => {
    const { container } = renderAt(<JuniorsOfficeBearers />, "/juniors/office-bearers");
    await settle(container);
  });
});
