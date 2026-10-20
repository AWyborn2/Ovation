import { and, eq, gt, lte } from "drizzle-orm";
import { db, fixturesTable } from "@workspace/db";
import { loadDraftingGates } from "../posting-plan";
import { upsertDraftByKey } from "../draft-upsert";
import {
  formatFixtureDate,
  formatFixtureTime,
  matchDayDraftInput,
} from "@workspace/scorecard/card-content";
import { buildMatchDayContent } from "../card-content/match-day";

/** How far ahead of the first ball a match-day card is drafted. */
export const MATCH_DAY_LEAD_MS = 48 * 60 * 60 * 1000;

export type MatchDayResult = { drafted: number; refreshed: number; skipped: number };

// Club-time date and time ("SAT 12 OCT", "12:30 PM"); shared with the content
// pipeline so every card formats a fixture the same way.
export { formatFixtureDate, formatFixtureTime };

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
  // A club drafting this card per round (or not at all) gets no per-match cards.
  const gates = await loadDraftingGates(tenantId);
  if (!gates.gameDayIndividual()) return result;

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

  const drafting = fixtures.filter((f) => gates.gameDayGrade(f.grade, false));
  result.skipped = fixtures.length - drafting.length;
  // The same content the Weekend Carousel shows for these fixtures (ADR-010).
  const content = await buildMatchDayContent(tenantId, drafting);
  for (const fixture of drafting) {
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "matchday",
      family: "matchday",
      sourceKey: matchDayKey(fixture.id),
      // Saved as it always was, so existing auto-queued drafts are never rewritten.
      cardInput: matchDayDraftInput(content.get(fixture.id)!),
      appPath: "/fixtures",
      sourceImportedAt: now,
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}
