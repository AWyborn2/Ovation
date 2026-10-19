import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  db, juniorFixturesTable, juniorTeamListsTable, juniorParticipantsTable,
  juniorShirtNumbersTable, type FixtureRow, type JuniorFixtureRow,
} from "@workspace/db";
import { getShirtNumberSettings } from "@workspace/db/shirt-numbers";
import { clubTimeToUtc } from "./round-schedules";
import { isJuniorSyncOn } from "./junior-sync";
import { getJuniorNameStyle, resolveUnlinkedJuniorOpponent } from "./junior-helpers";
import { makeJuniorNaming, type JuniorNameFacts } from "./junior-names";
import { shapePublicJuniorTeamList } from "./junior-fixtures";
import { overlayNativeOpponents } from "./club-brand";
import { teamListToCardInput } from "./engines/team-list";
import { formatFixtureDate, formatFixtureTime } from "./engines/match-day";

/** Separate namespace from native fixtures and both junior/senior scorecards. */
export const juniorCarouselFixtureId = (id: number) => -(2_000_000_000 + id);

export function eligibleJuniorCarouselFixture(fixture: JuniorFixtureRow): boolean {
  return !!fixture.startAt && !!fixture.opponentName?.trim() &&
    !/^bye$/i.test(fixture.opponentName.trim()) &&
    !/\b(cancelled|canceled|abandoned|bye)\b/i.test(fixture.status ?? "");
}

/** Only junior tables and neutral cosmetic club references; never senior players,
 * selection drafts, cap/debut history or senior shirt-number registers. */
export async function juniorCarouselContent(
  tenantId: number,
  type: "matchDay" | "teamList",
  from: string,
  to: string,
) {
  const fixtures: FixtureRow[] = [];
  const content: Record<string, Record<string, unknown>> = {};
  const warnings: string[] = [];
  if (!(await isJuniorSyncOn(tenantId, { requireActive: false })))
    return { fixtures, content, warnings };

  const end = new Date(`${to}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const rows = await db.select().from(juniorFixturesTable).where(and(
    eq(juniorFixturesTable.tenantId, tenantId),
    gte(juniorFixturesTable.startAt, clubTimeToUtc(`${from}T00:00`)!),
    lt(juniorFixturesTable.startAt, clubTimeToUtc(`${end.toISOString().slice(0, 10)}T00:00`)!),
  )).orderBy(asc(juniorFixturesTable.startAt), asc(juniorFixturesTable.id));
  const eligible = rows.filter(eligibleJuniorCarouselFixture);
  if (eligible.length < rows.length)
    warnings.push(`Excluded ${rows.length - eligible.length} junior bye, cancelled, abandoned or incomplete fixture(s).`);
  if (!eligible.length) return { fixtures, content, warnings };

  const lists = type === "teamList" ? await db.select().from(juniorTeamListsTable).where(and(
    eq(juniorTeamListsTable.tenantId, tenantId),
    eq(juniorTeamListsTable.isPublished, true),
    inArray(juniorTeamListsTable.juniorFixtureId, eligible.map(f => f.id)),
  )) : [];
  const ids = [...new Set(lists.flatMap(l => l.players.map(p => p.participantId.toLowerCase())))];
  const people = ids.length ? await db.select({
    participantId: juniorParticipantsTable.participantId,
    displayName: juniorParticipantsTable.displayName,
    isPrivate: juniorParticipantsTable.isPrivate,
    privacyOverride: juniorParticipantsTable.privacyOverride,
  }).from(juniorParticipantsTable).where(and(
    eq(juniorParticipantsTable.tenantId, tenantId),
    inArray(sql`lower(${juniorParticipantsTable.participantId})`, ids),
  )) : [];
  // Keep original casing here: makeJuniorNaming merges duplicate spellings
  // using the stricter privacy facts, rather than letting the last row win.
  const facts = new Map<string, JuniorNameFacts>(people.map(p => [p.participantId, p]));
  const naming = makeJuniorNaming(
    lists.length ? await getJuniorNameStyle(tenantId) : "full", facts,
  );
  const numbered = lists.length && (await getShirtNumberSettings(db, tenantId)).enabled;
  const numberRows = numbered ? await db.select({
    participantId: juniorShirtNumbersTable.participantId,
    season: juniorShirtNumbersTable.season,
    number: juniorShirtNumbersTable.number,
  }).from(juniorShirtNumbersTable).where(and(
    eq(juniorShirtNumbersTable.tenantId, tenantId),
    inArray(juniorShirtNumbersTable.season, [...new Set(eligible.map(f => f.seasonStartYear))]),
    eq(juniorShirtNumbersTable.held, false),
    isNotNull(juniorShirtNumbersTable.number),
  )) : [];

  for (const row of eligible) {
    const grade = row.ageGroup || row.grade || "Juniors";
    const teamGrade = row.teamName && row.teamName !== grade
      ? `${grade} — ${row.teamName}` : grade;
    const label = `${teamGrade} v ${row.opponentName}`;
    const list = lists.find(l => l.juniorFixtureId === row.id);
    if (type === "teamList" && !list?.players.length) {
      warnings.push(`${label}: no published junior team list. Name and publish the team in Junior fixtures or finalise it in the Selection Hub first.`);
      continue;
    }
    const [opponent] = await overlayNativeOpponents([
      await resolveUnlinkedJuniorOpponent(row.opponentName),
    ]);
    const fixture: FixtureRow = {
      id: juniorCarouselFixtureId(row.id), tenantId, grade,
      opponentName: row.opponentName!.trim(),
      opponentClubId: opponent?.id ?? null,
      opponentLogoUrl: opponent?.logoUrl128 ?? opponent?.logoUrl ?? null,
      startAt: row.startAt!, createdAt: row.createdAt, isHome: row.isHome ?? true,
      source: "playhq", playhqMatchId: row.playhqMatchId,
      venue: row.venue, roundLabel: null, notes: null,
      matchFormat: null, venueLatitude: null, venueLongitude: null,
      competitionName: null, associationOrgId: null, associationName: null,
      homeTeamName: null, awayTeamName: null,
    };
    if (type === "matchDay") {
      content[fixture.id] = {
        kind: "matchDay", grade: teamGrade, roundLabel: "",
        oppositionName: fixture.opponentName, oppositionLogoUrl: fixture.opponentLogoUrl,
        venue: fixture.venue?.trim() || "Venue TBC",
        date: formatFixtureDate(fixture.startAt),
        startTime: formatFixtureTime(fixture.startAt),
        junior: true, juniorTeamName: row.teamName,
      };
    } else {
      const numbers = numbered ? new Map(numberRows
        .filter(n => n.season === row.seasonStartYear && n.number != null)
        .map(n => [n.participantId.toLowerCase(), n.number!])) : null;
      const players = shapePublicJuniorTeamList(
        list!.players.map(p => ({ ...p, participantId: p.participantId.toLowerCase() })),
        naming, new Set([...facts.keys()].map(id => id.toLowerCase())), numbers,
      );
      if (!players.length) {
        warnings.push(`${label}: published list has no recognised club juniors. Check the list in Junior fixtures.`);
        continue;
      }
      content[fixture.id] = {
        ...teamListToCardInput(fixture, players.map(p => ({
          order: p.order, displayName: p.name, role: p.role ?? undefined,
        }))),
        // Preserve the already-public name exactly, including shortened styles
        // and "Private Player"; never reconstruct a surname or expose an id.
        players: players.map(p => ({
          order: p.order, surname: p.name,
          ...(p.role ? { role: p.role } : {}),
          ...(p.shirtNumber ? { shirtNumber: p.shirtNumber } : {}),
        })),
        ...(numbered ? { numbering: "shirt" } : {}),
        grade: teamGrade, gradeRound: teamGrade.toUpperCase(),
        junior: true, juniorTeamName: row.teamName,
      };
    }
    fixtures.push(fixture);
  }
  return { fixtures, content, warnings };
}
