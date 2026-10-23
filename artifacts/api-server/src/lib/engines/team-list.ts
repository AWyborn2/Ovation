import { and, eq, gt, lte } from "drizzle-orm";
import {
  db,
  fixturesTable,
  teamListsTable,
  shirtNumbersTable,
  squadMembersTable,
  type FixtureRow,
  type TeamListPlayer,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import {
  getShirtNumberSettings,
  normaliseParticipantId,
  shirtNumberCategoryForGrade,
} from "@workspace/db/shirt-numbers";
import type { ShirtNumberCategory } from "@workspace/db";
import { logger } from "../logger";
import { loadDraftingGates } from "../posting-plan";
import { upsertDraftByKey } from "../draft-upsert";
import { teamListPhotoPlayer } from "../draft-enrich";
import { formatFixtureDate, formatFixtureTime } from "./match-day";
import { autoDebutPlayerIds, isDebut } from "../team-list-debuts";
import { PRIVATE_PLAYER } from "../selection-published-players";
import { teamListDraftInput } from "@workspace/scorecard/card-content";
import { buildTeamListContent } from "../card-content/team-list";
import { contentVisibleFields } from "../card-content/visible-fields";

/**
 * Team lists are usually named a few days out, so look further ahead than the
 * 48-hour match-day card.
 */
export const TEAM_LIST_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

export type TeamListResult = { drafted: number; refreshed: number; skipped: number };

function surnameOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

/** Presentation metadata only; never derive player identity from a name. */
function firstInitialOf(displayName: string): string | undefined {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || displayName.trim().toLowerCase() === "private player") return undefined;
  return parts[0].match(/\p{L}/u)?.[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// Season shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
// U7 / KTD10)
// ---------------------------------------------------------------------------

/**
 * One season's shirt numbers, as a team-list card reads them: by player id
 * for linked entries, and by (lowercased) PlayHQ participant id for any entry
 * that carries one, HELD entries included. That second map is the R16
 * exception: a held player selected on a team list may show their number on
 * that fixture's card (and nowhere else). Unique exact full names may supply
 * presentation-only numbers when neither identity resolves. Unnumbered entries
 * still participate in ambiguity checks and prevent borrowing another number.
 */
export type TeamListShirtNumbers = {
  byPlayerId: ReadonlyMap<number, string>;
  byParticipantId: ReadonlyMap<string, string>;
  /** Presentation-only fallback; never a player/participant identity link. */
  byExactName?: ReadonlyMap<string, string>;
  registeredPlayerIds?: ReadonlySet<number>;
  registeredParticipantIds?: ReadonlySet<string>;
};

type ShirtNumberEntryLike = {
  playerId: number | null;
  participantId: string | null;
  number: string | null;
  name?: string;
};

const fullNameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** The lookup maps for a season's register entries (pure). */
export function buildTeamListShirtNumbers(
  entries: readonly ShirtNumberEntryLike[],
): TeamListShirtNumbers {
  const byPlayerId = new Map<number, string>();
  const byParticipantId = new Map<string, string>();
  const byExactName = new Map<string, string>();
  const registeredPlayerIds = new Set<number>();
  const registeredParticipantIds = new Set<string>();
  const nameCounts = new Map<string, number>();
  // Count unnumbered entries too: a same-named person without a number must
  // not borrow the numbered person's entry.
  for (const e of entries) {
    const key = fullNameKey(e.name ?? "");
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  for (const e of entries) {
    const participant = normaliseParticipantId(e.participantId);
    if (e.playerId != null) registeredPlayerIds.add(e.playerId);
    if (participant !== null) registeredParticipantIds.add(participant);
    if (!e.number) continue;
    if (e.playerId != null) byPlayerId.set(e.playerId, e.number);
    if (participant !== null) byParticipantId.set(participant, e.number);
    const key = fullNameKey(e.name ?? "");
    if (
      key.includes(" ") &&
      key !== fullNameKey(PRIVATE_PLAYER) &&
      nameCounts.get(key) === 1 &&
      (e.playerId == null || e.playerId < 90000)
    )
      byExactName.set(key, e.number);
  }
  return {
    byPlayerId,
    byParticipantId,
    byExactName,
    registeredPlayerIds,
    registeredParticipantIds,
  };
}

/** A selected player's number: their linked entry first, else a participant match. */
export function shirtNumberOf(p: TeamListPlayer, numbers: TeamListShirtNumbers): string | null {
  if (p.playerId != null) {
    const linked = numbers.byPlayerId.get(p.playerId);
    if (linked) return linked;
  }
  const participant = normaliseParticipantId(p.participantId);
  return participant !== null ? (numbers.byParticipantId.get(participant) ?? null) : null;
}

/**
 * Loads a season's team-list numbers for one senior register (the fixture grade's
 * category, default `men`), or null when the club has the feature off.
 */
export type TeamListShirtNumberLoader = (
  season: number,
  category?: ShirtNumberCategory,
) => Promise<TeamListShirtNumbers | null>;

/**
 * A per-run loader for a tenant's team-list shirt numbers: reads the settings
 * once, then each (season, category) of the senior register at most once. Feature off: every
 * call returns null, so card inputs stay exactly as before (R1, AE5). A failed
 * read is logged and treated as "no numbers" rather than failing the drafts.
 */
export function teamListShirtNumberLoader(tenantId: number): TeamListShirtNumberLoader {
  let enabled: Promise<boolean> | null = null;
  const seasons = new Map<string, Promise<TeamListShirtNumbers | null>>();
  return (season, category = "men") => {
    enabled ??= getShirtNumberSettings(db, tenantId).then(
      (s) => s.enabled,
      (err: unknown) => {
        logger.warn({ err, tenantId }, "team-list shirt-number settings read failed");
        return false;
      },
    );
    const key = `${season}:${category}`;
    let pending = seasons.get(key);
    if (!pending) {
      pending = enabled.then(async (on) => {
        if (!on) return null;
        try {
          const [rows, roster] = await Promise.all([
            db
              .select({
                playerId: shirtNumbersTable.playerId,
                participantId: shirtNumbersTable.participantId,
                number: shirtNumbersTable.number,
                name: shirtNumbersTable.name,
              })
              .from(shirtNumbersTable)
              .where(
                and(
                  eq(shirtNumbersTable.tenantId, tenantId),
                  eq(shirtNumbersTable.season, season),
                  eq(shirtNumbersTable.category, category),
                ),
              ),
            db
              .select({
                firstName: squadMembersTable.firstName,
                lastName: squadMembersTable.lastName,
                preferredName: squadMembersTable.preferredName,
                isPrivate: squadMembersTable.isPrivate,
                linkedPlayerId: squadMembersTable.linkedPlayerId,
              })
              .from(squadMembersTable)
              .where(eq(squadMembersTable.tenantId, tenantId)),
          ]);
          const numbers = buildTeamListShirtNumbers(rows);
          const byExactName = new Map(numbers.byExactName);
          const owners = new Map<string, number>();
          const blocked = new Set<string>();
          for (const m of roster) {
            const keys = new Set([
              fullNameKey(`${m.firstName} ${m.lastName}`),
              fullNameKey(`${m.preferredName || m.firstName} ${m.lastName}`),
            ]);
            for (const key of keys) {
              owners.set(key, (owners.get(key) ?? 0) + 1);
              // A public junior can also play in a senior side and have an
              // allocated senior number. The register queried above (not the
              // roster section) determines which number this card may display.
              if (m.isPrivate || (m.linkedPlayerId ?? 0) >= 90000) blocked.add(key);
            }
          }
          for (const [key, count] of owners)
            if (count > 1 || blocked.has(key)) byExactName.delete(key);
          return { ...numbers, byExactName };
        } catch (err) {
          logger.warn({ err, tenantId, season }, "team-list shirt-number lookup failed");
          return null;
        }
      });
      seasons.set(key, pending);
    }
    return pending;
  };
}

/** The season (start year) a fixture's team-list numbers come from (KTD7). */
export const teamListSeasonOf = (fixture: Pick<FixtureRow, "startAt">): number =>
  seasonStartYearFor(fixture.startAt);

/** The senior register a fixture's team-list numbers come from: its grade's category. */
export const teamListCategoryOf = (fixture: Pick<FixtureRow, "grade">): ShirtNumberCategory =>
  shirtNumberCategoryForGrade(fixture.grade);

/**
 * A fixture's team-list card input. Synchronous and pure: given `numbers` (the
 * fixture season's map, passed only when the club has shirt numbers on) each
 * kept player carries their `shirtNumber` (none when unnumbered) and the card
 * carries `numbering: "shirt"`. Without it the input is exactly as before.
 *
 * `autoDebuts` holds the players the match records say are debuting (see
 * team-list-debuts.ts); an admin's `debut` on a player wins over it.
 */
export function teamListToCardInput(
  fixture: FixtureRow,
  players: TeamListPlayer[],
  autoDebuts: ReadonlySet<number> = new Set(),
  numbers?: TeamListShirtNumbers | null,
): Record<string, unknown> {
  const nameCounts = new Map<string, number>();
  for (const p of players) {
    const key = fullNameKey(p.displayName);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const round = (fixture.roundLabel ?? "").toUpperCase();
  const venueDateTime = [
    fixture.venue ?? "",
    formatFixtureDate(fixture.startAt),
    formatFixtureTime(fixture.startAt),
  ]
    .filter(Boolean)
    .join(" • ");
  return {
    kind: "teamList",
    gradeRound: [fixture.grade.toUpperCase(), round].filter(Boolean).join(" — "),
    competitionLine: fixture.grade,
    venueDateTime,
    // Fill-ins (playerId >= 90000) never appear on published cards.
    players: players
      .filter((p) => p.playerId == null || p.playerId < 90000)
      .sort((a, b) => a.order - b.order)
      .map((p) => {
        const firstInitial = firstInitialOf(p.displayName);
        const row = {
          order: p.order,
          surname: surnameOf(p.displayName),
          ...(firstInitial ? { firstInitial } : {}),
          role: p.role,
          ...(isDebut(p, autoDebuts) ? { debut: true } : {}),
          // The snapshot's overseas mark (ADR-009), never on a "Private Player".
          ...(p.overseas && p.displayName !== PRIVATE_PLAYER ? { overseas: true } : {}),
        };
        let shirtNumber = numbers ? shirtNumberOf(p, numbers) : null;
        if (!shirtNumber && numbers) {
          const participant = normaliseParticipantId(p.participantId);
          const hasRegisterIdentity =
            (p.playerId != null && numbers.registeredPlayerIds?.has(p.playerId)) ||
            (participant != null && numbers.registeredParticipantIds?.has(participant));
          const key = fullNameKey(p.displayName);
          // Number display only, not identity recovery. Never override an
          // explicitly unnumbered identity or guess between duplicate names.
          if (!hasRegisterIdentity && nameCounts.get(key) === 1)
            shirtNumber = numbers.byExactName?.get(key) ?? null;
        }
        return shirtNumber ? { ...row, shirtNumber } : row;
      }),
    grade: fixture.grade,
    // The match itself, for designs that set it out in parts (Starting XI).
    roundLabel: round,
    opponent: fixture.opponentName,
    ...(fixture.opponentLogoUrl ? { opponentLogoUrl: fixture.opponentLogoUrl } : {}),
    homeAway: fixture.isHome ? "HOME" : "AWAY",
    venue: fixture.venue ?? "",
    date: formatFixtureDate(fixture.startAt),
    startTime: formatFixtureTime(fixture.startAt),
    ...(numbers ? { numbering: "shirt" } : {}),
  };
}

/** The XI's automatic debutants; a failed lookup only drops the automatic badges. */
export async function loadAutoDebuts(
  tenantId: number,
  players: readonly TeamListPlayer[],
  before: Date,
): Promise<Set<number>> {
  try {
    return new Set(
      await autoDebutPlayerIds(
        tenantId,
        players.map((p) => p.playerId),
        before,
      ),
    );
  } catch (err) {
    logger.warn({ err, tenantId }, "team list debut lookup failed");
    return new Set();
  }
}

export const teamListKey = (fixtureId: number) => `teamlist:${fixtureId}`;

/**
 * Team list card (match day family, R1): one draft per upcoming fixture whose
 * XI has been published in the fixtures admin. Keyed on the fixture, so a
 * changed selection refreshes the card rather than adding another. The card
 * comes from the team list content builder (ADR-010 P7), the same one the team
 * list carousel and Create a Card use.
 */
export async function generateTeamListDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<TeamListResult> {
  const result: TeamListResult = { drafted: 0, refreshed: 0, skipped: 0 };
  // A club drafting this card per round (or not at all) gets no per-match cards.
  const gates = await loadDraftingGates(tenantId);
  if (!gates.teamListsIndividual()) return result;

  const rows = await db
    .select({ fixture: fixturesTable, list: teamListsTable })
    .from(teamListsTable)
    .innerJoin(fixturesTable, eq(fixturesTable.id, teamListsTable.fixtureId))
    .where(
      and(
        eq(teamListsTable.tenantId, tenantId),
        eq(fixturesTable.tenantId, tenantId),
        eq(teamListsTable.isPublished, true),
        gt(fixturesTable.startAt, now),
        lte(fixturesTable.startAt, new Date(now.getTime() + TEAM_LIST_LEAD_MS)),
      ),
    );

  const sides = rows.filter(
    ({ fixture, list }) => list.players.length > 0 && gates.teamListsGrade(fixture.grade, false),
  );
  result.skipped += rows.length - sides.length;
  if (!sides.length) return result;
  const [contents, visible] = await Promise.all([
    buildTeamListContent(tenantId, sides),
    contentVisibleFields(tenantId, "teamList"),
  ]);
  for (const [i, { fixture, list }] of sides.entries()) {
    const players = list.players;
    const sourceKey = teamListKey(fixture.id);
    // The card's photo: one of the selected players, picked at random per
    // fixture, from the photo library (or their headshot).
    const featured = await teamListPhotoPlayer(
      tenantId,
      players.map((p) => p.playerId),
      sourceKey,
    );
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "teamlist",
      family: "matchday",
      sourceKey,
      cardInput: teamListDraftInput(contents[i]!, visible),
      appPath: "/fixtures",
      playerId: featured,
      // The photo: one of the selected side, rotating towards the players and
      // photos least used on recent Team List posts (PHOTO_POLICY).
      candidatePlayerIds: players.flatMap((p) => (p.playerId != null ? [p.playerId] : [])),
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}
