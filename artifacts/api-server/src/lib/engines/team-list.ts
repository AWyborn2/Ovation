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
import { formatFixtureDate, formatFixtureTime } from "./match-day";

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

export function teamListToCardInput(
  fixture: FixtureRow,
  players: TeamListPlayer[],
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
      .map((p) => ({ order: p.order, surname: surnameOf(p.displayName), role: p.role })),
    grade: fixture.grade,
  };
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
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "teamlist",
      family: "matchday",
      sourceKey: teamListKey(fixture.id),
      cardInput: teamListToCardInput(fixture, players),
      appPath: "/fixtures",
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}
