import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  db,
  juniorFixturesTable,
  juniorTeamListsTable,
  type FixtureRow,
  type JuniorFixtureRow,
} from "@workspace/db";
import { clubTimeToUtc } from "./round-schedules";
import { isJuniorSyncOn } from "./junior-sync";
import { resolveUnlinkedJuniorOpponent } from "./junior-helpers";
import { overlayNativeOpponents } from "./club-brand";
import type { JuniorFixtureMeta } from "./card-content/match-day";
import {
  buildJuniorTeamListContent,
  juniorTeamGrade,
  type JuniorTeamListSide,
} from "./card-content/team-list";

/** Separate namespace from native fixtures and both junior/senior scorecards. */
export const juniorCarouselFixtureId = (id: number) => -(2_000_000_000 + id);

export function eligibleJuniorCarouselFixture(fixture: JuniorFixtureRow): boolean {
  return (
    !!fixture.startAt &&
    !!fixture.opponentName?.trim() &&
    !/^bye$/i.test(fixture.opponentName.trim()) &&
    !/\b(cancelled|canceled|abandoned|bye)\b/i.test(fixture.status ?? "")
  );
}

/**
 * Only junior tables and neutral cosmetic club references; never senior players,
 * selection drafts, cap/debut history or senior shirt-number registers.
 *
 * Team lists come from the junior team list content builder (ADR-010 P7), the
 * same one the junior team list sweep uses, so a carousel slide prints the
 * side exactly as the auto-queued card does: the club's public junior naming,
 * withheld players as "Private Player", junior season numbers.
 */
export async function juniorCarouselContent(
  tenantId: number,
  type: "matchDay" | "teamList",
  from: string,
  to: string,
) {
  const fixtures: FixtureRow[] = [];
  const content: Record<string, Record<string, unknown>> = {};
  const warnings: string[] = [];
  // Match Day: how each junior fixture names its side; the content builder
  // (card-content/match-day.ts) makes the slide, as it does for senior fixtures.
  const junior = new Map<number, JuniorFixtureMeta>();
  if (!(await isJuniorSyncOn(tenantId, { requireActive: false })))
    return { fixtures, content, warnings, junior };

  const end = new Date(`${to}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const rows = await db
    .select()
    .from(juniorFixturesTable)
    .where(
      and(
        eq(juniorFixturesTable.tenantId, tenantId),
        gte(juniorFixturesTable.startAt, clubTimeToUtc(`${from}T00:00`)!),
        lt(juniorFixturesTable.startAt, clubTimeToUtc(`${end.toISOString().slice(0, 10)}T00:00`)!),
      ),
    )
    .orderBy(asc(juniorFixturesTable.startAt), asc(juniorFixturesTable.id));
  const eligible = rows.filter(eligibleJuniorCarouselFixture);
  if (eligible.length < rows.length)
    warnings.push(
      `Excluded ${rows.length - eligible.length} junior bye, cancelled, abandoned or incomplete fixture(s).`,
    );
  if (!eligible.length) return { fixtures, content, warnings, junior };

  const lists =
    type === "teamList"
      ? await db
          .select()
          .from(juniorTeamListsTable)
          .where(
            and(
              eq(juniorTeamListsTable.tenantId, tenantId),
              eq(juniorTeamListsTable.isPublished, true),
              inArray(
                juniorTeamListsTable.juniorFixtureId,
                eligible.map((f) => f.id),
              ),
            ),
          )
      : [];

  const sides: Array<JuniorTeamListSide & { id: number }> = [];
  for (const row of eligible) {
    const teamGrade = juniorTeamGrade(row);
    const label = `${teamGrade} v ${row.opponentName}`;
    const list = lists.find((l) => l.juniorFixtureId === row.id);
    if (type === "teamList" && !list?.players.length) {
      warnings.push(
        `${label}: no published junior team list. Name and publish the team in Junior fixtures or finalise it in the Selection Hub first.`,
      );
      continue;
    }
    const [opponent] = await overlayNativeOpponents([
      await resolveUnlinkedJuniorOpponent(row.opponentName),
    ]);
    const fixture: FixtureRow = {
      id: juniorCarouselFixtureId(row.id),
      tenantId,
      grade: row.ageGroup || row.grade || "Juniors",
      opponentName: row.opponentName!.trim(),
      opponentClubId: opponent?.id ?? null,
      opponentLogoUrl: opponent?.logoUrl128 ?? opponent?.logoUrl ?? null,
      startAt: row.startAt!,
      createdAt: row.createdAt,
      isHome: row.isHome ?? true,
      source: "playhq",
      playhqMatchId: row.playhqMatchId,
      venue: row.venue,
      roundLabel: null,
      notes: null,
      matchFormat: null,
      venueLatitude: null,
      venueLongitude: null,
      competitionName: null,
      associationOrgId: null,
      associationName: null,
      homeTeamName: null,
      awayTeamName: null,
    };
    if (type === "matchDay")
      junior.set(fixture.id, { gradeLabel: teamGrade, juniorTeamName: row.teamName ?? null });
    else sides.push({ id: fixture.id, fixture: row, players: list!.players });
    fixtures.push(fixture);
  }
  const built = await buildJuniorTeamListContent(tenantId, sides);
  sides.forEach(({ id }, i) => (content[id] = built[i] as unknown as Record<string, unknown>));
  return { fixtures, content, warnings, junior };
}
