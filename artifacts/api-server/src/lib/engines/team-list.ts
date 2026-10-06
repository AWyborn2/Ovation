import { and, eq, gt, lte } from "drizzle-orm";
import {
  db,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  type FixtureRow,
  type TeamListPlayer,
} from "@workspace/db";
import { familyAllows, resolveFamilyConfig } from "../social-families";
import { upsertDraftByKey } from "../draft-upsert";
import { teamListPhotoPlayer } from "../draft-enrich";
import { resolveRoundSchedules } from "../round-schedules";
import { formatFixtureDate, formatFixtureTime } from "./match-day";
import { autoDebutPlayerIds, isDebut } from "../team-list-debuts";
import { logger } from "../logger";

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

/**
 * A fixture's XI as a team-list card. `autoDebuts` holds the players the match
 * records say are debuting (see team-list-debuts.ts); an admin's `debut` on a
 * player wins over it.
 */
export function teamListToCardInput(
  fixture: FixtureRow,
  players: TeamListPlayer[],
  autoDebuts: ReadonlySet<number> = new Set(),
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
      .map((p) => ({
        order: p.order,
        surname: surnameOf(p.displayName),
        role: p.role,
        ...(isDebut(p, autoDebuts) ? { debut: true } : {}),
      })),
    grade: fixture.grade,
    // The match itself, for designs that set it out in parts (Starting XI).
    roundLabel: round,
    opponent: fixture.opponentName,
    ...(fixture.opponentLogoUrl ? { opponentLogoUrl: fixture.opponentLogoUrl } : {}),
    homeAway: fixture.isHome ? "HOME" : "AWAY",
    venue: fixture.venue ?? "",
    date: formatFixtureDate(fixture.startAt),
    startTime: formatFixtureTime(fixture.startAt),
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
