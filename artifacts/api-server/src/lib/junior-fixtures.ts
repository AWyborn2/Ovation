import type { JuniorFixtureRow, JuniorTeamListPlayer, TeamListRole } from "@workspace/db";
import {
  formatJuniorName,
  isJuniorWithheld,
  type JuniorNameFacts,
  type JuniorNaming,
} from "./junior-names";

/**
 * Junior fixtures and team lists — the pure rules behind /api/juniors/fixtures
 * (junior PlayHQ sync plan U6; KTD9, KTD12, KTD15, R8, R9, R15, R17, R23).
 *
 * No database here, so every rule unit-tests locally; the route
 * (`routes/juniors-fixtures.ts`) loads the rows and calls these.
 *
 *  - A junior team list stores participants only (order, lowercased PlayHQ id,
 *    role). Names are never stored: public reads derive them through the club's
 *    naming style (`JuniorNaming`), admin reads carry full names.
 *  - An admin save may only name the club's own junior participants: never an
 *    opposition child (who has no participant row of ours) and never another
 *    club's (the canonicaliser is built from this tenant's rows only).
 */

/** The most players one junior team list may hold. */
export const JUNIOR_TEAM_LIST_MAX = 30;

/** A game stays on the public "upcoming" list this long after it starts (match day). */
export const JUNIOR_FIXTURE_LIST_GRACE_HOURS = 12;

const ROLES: readonly TeamListRole[] = ["C", "VC", "WK", "C/WK", "VC/WK"];
const CAPTAIN: readonly TeamListRole[] = ["C", "C/WK"];
const VICE: readonly TeamListRole[] = ["VC", "VC/WK"];
const KEEPER: readonly TeamListRole[] = ["WK", "C/WK", "VC/WK"];

/** The earliest start time the public upcoming list shows. */
export function juniorFixtureListFrom(now: Date): Date {
  return new Date(now.getTime() - JUNIOR_FIXTURE_LIST_GRACE_HOURS * 60 * 60 * 1000);
}

export type JuniorTeamListInput = {
  order: number;
  participantId: string;
  role?: TeamListRole | null;
};

export type JuniorTeamListValidation =
  { ok: true; players: JuniorTeamListPlayer[] } | { ok: false; error: string };

/**
 * Validate an admin's junior team list. `canonical` resolves any id (any casing) to
 * one of THIS club's junior participants, following a merged-away duplicate to its
 * keeper, or null. The saved list is sorted by order and renumbered 1..n.
 */
export function validateJuniorTeamList(
  input: readonly JuniorTeamListInput[],
  canonical: (id: string | null | undefined) => string | null,
): JuniorTeamListValidation {
  if (input.length > JUNIOR_TEAM_LIST_MAX) {
    return { ok: false, error: `A junior team list holds at most ${JUNIOR_TEAM_LIST_MAX} players` };
  }
  const orders = new Set<number>();
  for (const p of input) {
    if (!Number.isInteger(p.order) || p.order < 1) {
      return { ok: false, error: "Each player's order must be a whole number from 1" };
    }
    if (orders.has(p.order)) {
      return { ok: false, error: `Order ${p.order} is used more than once` };
    }
    orders.add(p.order);
    if (p.role != null && !ROLES.includes(p.role)) {
      return { ok: false, error: `Unknown role "${String(p.role)}"` };
    }
  }

  let unknown = 0;
  const seen = new Set<string>();
  const resolved: { order: number; participantId: string; role: TeamListRole | null }[] = [];
  for (const p of input) {
    const id = p.participantId?.trim() ? canonical(p.participantId) : null;
    if (id === null) {
      unknown++;
      continue;
    }
    if (seen.has(id)) {
      return { ok: false, error: "A player appears on the list more than once" };
    }
    seen.add(id);
    resolved.push({ order: p.order, participantId: id, role: p.role ?? null });
  }
  if (unknown > 0) {
    return {
      ok: false,
      error:
        unknown === 1
          ? "1 player is not one of this club's junior players"
          : `${unknown} players are not one of this club's junior players`,
    };
  }

  const count = (set: readonly TeamListRole[]) =>
    resolved.filter((p) => p.role !== null && set.includes(p.role)).length;
  if (count(CAPTAIN) > 1) return { ok: false, error: "Only one captain can be named" };
  if (count(VICE) > 1) return { ok: false, error: "Only one vice-captain can be named" };
  if (count(KEEPER) > 1) return { ok: false, error: "Only one wicket-keeper can be named" };

  const players = resolved
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({
      order: i + 1,
      participantId: p.participantId,
      ...(p.role !== null ? { role: p.role } : {}),
    }));
  return { ok: true, players };
}

/** The public fixture shape (the `JuniorFixture` contract schema). */
export function serializeJuniorFixture(row: JuniorFixtureRow, hasTeamList: boolean) {
  return {
    id: row.id,
    seasonStartYear: row.seasonStartYear,
    ageGroup: row.ageGroup,
    grade: row.grade,
    teamName: row.teamName,
    opponentName: row.opponentName,
    venue: row.venue,
    startAt: row.startAt ? row.startAt.toISOString() : null,
    isHome: row.isHome,
    status: row.status,
    hasTeamList,
  };
}

export type JuniorPublicTeamListPlayer = {
  order: number;
  name: string;
  /** Null when withheld, so a public client cannot link or look the child up. */
  participantId: string | null;
  role: TeamListRole | null;
  shirtNumber: string | null;
  /** An overseas player (ADR-009): a neutral "OS". Never set on a withheld player. */
  overseas?: boolean;
};

const byOrder = <T extends { order: number }>(players: readonly T[]): T[] =>
  [...players].sort((a, b) => a.order - b.order);

/**
 * A published team list for public pages: names in the club's style, a withheld
 * (private, not overridden) player as "Private Player" with no id or number. An
 * entry that is not one of the club's participants (`known`) is left out.
 * `numbers` is the season's shirt-number register, or null when the club has
 * shirt numbers off.
 */
export function shapePublicJuniorTeamList(
  players: readonly JuniorTeamListPlayer[],
  naming: JuniorNaming,
  known: ReadonlySet<string>,
  numbers: ReadonlyMap<string, string> | null,
): JuniorPublicTeamListPlayer[] {
  return byOrder(players)
    .filter((p) => known.has(p.participantId))
    .map((p) => {
      const line = naming.line({
        participantId: p.participantId,
        playerName: null,
        isHallsHead: true,
      });
      return {
        order: p.order,
        name: line.playerName,
        participantId: line.participantId,
        role: p.role ?? null,
        shirtNumber: line.isPrivate ? null : (numbers?.get(p.participantId) ?? null),
        // The overseas mark goes with the name: a withheld player has none.
        ...(p.overseas && !line.isPrivate ? { overseas: true } : {}),
      };
    });
}

export type JuniorAdminTeamListPlayer = {
  order: number;
  participantId: string;
  name: string;
  role: TeamListRole | null;
  shirtNumber: string | null;
  /** Withheld on public pages (private and not overridden). */
  isPrivate: boolean;
  /** Still one of the club's junior participants. */
  isKnown: boolean;
};

export const UNKNOWN_JUNIOR_NAME = "Unknown player";

/** A team list for the admin editor: full names, shirt numbers, the withheld flag. */
export function shapeAdminJuniorTeamList(
  players: readonly JuniorTeamListPlayer[],
  people: ReadonlyMap<string, JuniorNameFacts>,
  numbers: ReadonlyMap<string, string> | null,
): JuniorAdminTeamListPlayer[] {
  return byOrder(players).map((p) => {
    const person = people.get(p.participantId);
    const name = person ? formatJuniorName(person.displayName, "full") : "";
    return {
      order: p.order,
      participantId: p.participantId,
      name: name || UNKNOWN_JUNIOR_NAME,
      role: p.role ?? null,
      shirtNumber: numbers?.get(p.participantId) ?? null,
      isPrivate: person ? isJuniorWithheld(person) : false,
      isKnown: !!person,
    };
  });
}

export type JuniorCandidateRow = JuniorNameFacts & {
  participantId: string;
  teams: string | null;
  lastSeason: string | null;
};

export type JuniorTeamListCandidate = {
  participantId: string;
  name: string;
  isPrivate: boolean;
  shirtNumber: string | null;
  teams: string | null;
  lastSeason: string | null;
};

/** The club's junior players an admin can pick from, by full name (nameless rows left out). */
export function shapeJuniorTeamListCandidates(
  rows: readonly JuniorCandidateRow[],
  numbers: ReadonlyMap<string, string> | null,
): JuniorTeamListCandidate[] {
  return rows
    .map((r) => ({ r, name: formatJuniorName(r.displayName, "full") }))
    .filter(({ name }) => name !== "")
    .sort(
      (a, b) => a.name.localeCompare(b.name) || a.r.participantId.localeCompare(b.r.participantId),
    )
    .map(({ r, name }) => ({
      participantId: r.participantId,
      name,
      isPrivate: isJuniorWithheld(r),
      shirtNumber: numbers?.get(r.participantId) ?? null,
      teams: r.teams,
      lastSeason: r.lastSeason,
    }));
}
