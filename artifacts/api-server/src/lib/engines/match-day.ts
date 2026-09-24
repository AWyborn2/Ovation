import { and, eq, gt, lte } from "drizzle-orm";
import { db, fixturesTable, socialSettingsTable, type FixtureRow } from "@workspace/db";
import { familyAllows, resolveFamilyConfig } from "../social-families";
import { upsertDraftByKey } from "../draft-upsert";

/** How far ahead of the first ball a match-day card is drafted. */
export const MATCH_DAY_LEAD_MS = 48 * 60 * 60 * 1000;

/**
 * Pilot clubs are all in Western Australia and tenants carry no timezone yet,
 * so fixture times are formatted in Perth time (the server runs in UTC).
 */
const CLUB_TIME_ZONE = "Australia/Perth";

export type MatchDayResult = { drafted: number; refreshed: number; skipped: number };

/** "SAT 12 OCT" — same shape the Studio's fixture prefill produces. */
export function formatFixtureDate(d: Date): string {
  return d
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: CLUB_TIME_ZONE,
    })
    .replace(/,/g, "")
    .toUpperCase();
}

/** "12:30 PM". */
export function formatFixtureTime(d: Date): string {
  return d
    .toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: CLUB_TIME_ZONE,
    })
    .toUpperCase();
}

export function fixtureToMatchDayInput(fixture: FixtureRow): Record<string, unknown> {
  return {
    kind: "matchDay",
    roundLabel: (fixture.roundLabel ?? "").toUpperCase(),
    oppositionName: fixture.opponentName,
    oppositionLogoUrl: fixture.opponentLogoUrl ?? null,
    homeAway: fixture.isHome ? "HOME" : "AWAY",
    venue: fixture.venue ?? "",
    date: formatFixtureDate(fixture.startAt),
    startTime: formatFixtureTime(fixture.startAt),
    grade: fixture.grade,
  };
}

export const matchDayKey = (fixtureId: number) => `matchday:${fixtureId}`;

/**
 * Match day family (R1): one draft per fixture that starts within the next 48
 * hours. Keyed on the fixture, so repeated sweeps add nothing and a changed
 * fixture (venue, time) refreshes the existing card. Fixtures are senior-only;
 * junior fixtures never reach this table.
 */
export async function generateMatchDayDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<MatchDayResult> {
  const result: MatchDayResult = { drafted: 0, refreshed: 0, skipped: 0 };
  const [settings] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const families = resolveFamilyConfig(settings ?? null);
  if (!families.matchday.enabled) return result;

  const fixtures = await db
    .select()
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        gt(fixturesTable.startAt, now),
        lte(fixturesTable.startAt, new Date(now.getTime() + MATCH_DAY_LEAD_MS)),
      ),
    );

  for (const fixture of fixtures) {
    if (!familyAllows(families, "matchday", fixture.grade, false)) {
      result.skipped++;
      continue;
    }
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "matchday",
      family: "matchday",
      sourceKey: matchDayKey(fixture.id),
      cardInput: fixtureToMatchDayInput(fixture),
      appPath: "/fixtures",
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}
