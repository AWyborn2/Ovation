import { and, eq, gt, isNotNull, lte } from "drizzle-orm";
import {
  db,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  shirtNumbersTable,
  type FixtureRow,
  type TeamListPlayer,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { getShirtNumberSettings, normaliseParticipantId } from "@workspace/db/shirt-numbers";
import { logger } from "../logger";
import { familyAllows, resolveFamilyConfig } from "../social-families";
import { upsertDraftByKey } from "../draft-upsert";
import { teamListPhotoPlayer } from "../draft-enrich";
import { resolveRoundSchedules } from "../round-schedules";
import { formatFixtureDate, formatFixtureTime } from "./match-day";
import { autoDebutPlayerIds, isDebut } from "../team-list-debuts";

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

// ---------------------------------------------------------------------------
// Season shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
// U7 / KTD10)
// ---------------------------------------------------------------------------

/**
 * One season's shirt numbers, as a team-list card reads them: by player id
 * for linked entries, and by (lowercased) PlayHQ participant id for any entry
 * that carries one, HELD entries included. That second map is the R16
 * exception: a held player selected on a team list may show their number on
 * that fixture's card (and nowhere else). Only numbered entries are kept.
 */
export type TeamListShirtNumbers = {
  byPlayerId: ReadonlyMap<number, string>;
  byParticipantId: ReadonlyMap<string, string>;
};

type ShirtNumberEntryLike = {
  playerId: number | null;
  participantId: string | null;
  number: string | null;
};

/** The lookup maps for a season's register entries (pure). */
export function buildTeamListShirtNumbers(
  entries: readonly ShirtNumberEntryLike[],
): TeamListShirtNumbers {
  const byPlayerId = new Map<number, string>();
  const byParticipantId = new Map<string, string>();
  for (const e of entries) {
    if (!e.number) continue;
    if (e.playerId != null) byPlayerId.set(e.playerId, e.number);
    const participant = normaliseParticipantId(e.participantId);
    if (participant !== null) byParticipantId.set(participant, e.number);
  }
  return { byPlayerId, byParticipantId };
}

/** A selected player's number: their linked entry first, else a participant match. */
function shirtNumberOf(p: TeamListPlayer, numbers: TeamListShirtNumbers): string | null {
  if (p.playerId != null) {
    const linked = numbers.byPlayerId.get(p.playerId);
    if (linked) return linked;
  }
  const participant = normaliseParticipantId(p.participantId);
  return participant !== null ? (numbers.byParticipantId.get(participant) ?? null) : null;
}

/** Loads a season's team-list numbers, or null when the club has the feature off. */
export type TeamListShirtNumberLoader = (season: number) => Promise<TeamListShirtNumbers | null>;

/**
 * A per-run loader for a tenant's team-list shirt numbers: reads the settings
 * once, then each season's senior register at most once. Feature off: every
 * call returns null, so card inputs stay exactly as before (R1, AE5). A failed
 * read is logged and treated as "no numbers" rather than failing the drafts.
 */
export function teamListShirtNumberLoader(tenantId: number): TeamListShirtNumberLoader {
  let enabled: Promise<boolean> | null = null;
  const seasons = new Map<number, Promise<TeamListShirtNumbers | null>>();
  return (season) => {
    enabled ??= getShirtNumberSettings(db, tenantId).then(
      (s) => s.enabled,
      (err: unknown) => {
        logger.warn({ err, tenantId }, "team-list shirt-number settings read failed");
        return false;
      },
    );
    let pending = seasons.get(season);
    if (!pending) {
      pending = enabled.then(async (on) => {
        if (!on) return null;
        try {
          const rows = await db
            .select({
              playerId: shirtNumbersTable.playerId,
              participantId: shirtNumbersTable.participantId,
              number: shirtNumbersTable.number,
            })
            .from(shirtNumbersTable)
            .where(
              and(
                eq(shirtNumbersTable.tenantId, tenantId),
                eq(shirtNumbersTable.season, season),
                isNotNull(shirtNumbersTable.number),
              ),
            );
          return buildTeamListShirtNumbers(rows);
        } catch (err) {
          logger.warn({ err, tenantId, season }, "team-list shirt-number lookup failed");
          return null;
        }
      });
      seasons.set(season, pending);
    }
    return pending;
  };
}

/** The season (start year) a fixture's team-list numbers come from (KTD7). */
export const teamListSeasonOf = (fixture: Pick<FixtureRow, "startAt">): number =>
  seasonStartYearFor(fixture.startAt);

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
        const row = {
          order: p.order,
          surname: surnameOf(p.displayName),
          role: p.role,
          ...(isDebut(p, autoDebuts) ? { debut: true } : {}),
        };
        const shirtNumber = numbers ? shirtNumberOf(p, numbers) : null;
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
 * changed selection refreshes the card rather than adding another.
 */
export async function generateTeamListDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<TeamListResult> {
  const result: TeamListResult = { drafted: 0, refreshed: 0, skipped: 0 };
  const [settings] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const families = resolveFamilyConfig(settings ?? null);
  if (!families.matchday.enabled) return result;
  // A club drafting this card per round (or not at all) gets no per-match cards.
  if (resolveRoundSchedules(settings?.roundSchedules).teamLists.mode !== "perFixture")
    return result;

  const rows = await db
    .select({ fixture: fixturesTable, players: teamListsTable.players })
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

  const shirtNumbers = teamListShirtNumberLoader(tenantId);
  for (const { fixture, players } of rows) {
    if (players.length === 0 || !familyAllows(families, "matchday", fixture.grade, false)) {
      result.skipped++;
      continue;
    }
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
      cardInput: teamListToCardInput(
        fixture,
        players,
        await loadAutoDebuts(tenantId, players, fixture.startAt),
        await shirtNumbers(teamListSeasonOf(fixture)),
      ),
      appPath: "/fixtures",
      playerId: featured,
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}
