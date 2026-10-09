import type { Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, matchesTable, juniorMatchesTable, teamListsTable, type FixtureRow } from "@workspace/db";
import type { MatchDetail, JuniorMatchDetail } from "@workspace/api-zod";
import { isJuniorGradeLabel, matchToSummaryInput, juniorMatchToSummaryInput } from "@workspace/scorecard";
import { dataSource } from "./tenant";
import { loadMatchDetail, loadCentralMatchDetail } from "./match-detail";
import { loadJuniorMatchDetail } from "./match-summary-drafter";
import { parseMatchDate } from "./match-date";
import { clubTimeToUtc } from "./round-schedules";
import { getPrivateIds, MASK_NAME } from "./junior-helpers";
import { getTenantBrand } from "./tenant-brand";
import { beforeBoundary, loadClubOverlayData } from "./club-overlay";
import { teamListToCardInput, teamListShirtNumberLoader, teamListSeasonOf, loadAutoDebuts } from "./engines/team-list";
import { recoverPublishedSelectionIdentities } from "./selection-published-players";

export type CarouselSetType = "matchDay" | "teamList" | "results" | "matchSummary";
type Content = Record<string, Record<string, unknown>>;

export function carouselMatchDay(value: string | null): string | null {
  // Timestamp sources must cross midnight in club time, not UTC/browser time.
  if (value && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    if (!Number.isFinite(+date)) return null;
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth",
      year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    return ["year", "month", "day"].map(k => p.find(x => x.type === k)!.value).join("-");
  }
  return parseMatchDate(value);
}

/** Reuse published-list and scorecard builders; never read Selection Hub drafts. */
export async function carouselContent(req: Request, tenantId: number, type: CarouselSetType,
  fixtures: FixtureRow[], from: string, to: string,
): Promise<{ fixtures: FixtureRow[]; content: Content; warnings: string[] }> {
  const content: Content = {};
  const warnings: string[] = [];
  if (type === "matchDay") return { fixtures, content, warnings };
  if (type === "teamList") {
    const lists = fixtures.length ? await db.select().from(teamListsTable).where(and(
      eq(teamListsTable.tenantId, tenantId), inArray(teamListsTable.fixtureId, fixtures.map(f => f.id)),
      eq(teamListsTable.isPublished, true),
    )) : [];
    const numbers = teamListShirtNumberLoader(tenantId);
    const privateIds = await getPrivateIds(tenantId);
    const available: FixtureRow[] = [];
    for (const fixture of fixtures) {
      const list = lists.find(l => l.fixtureId === fixture.id);
      if (!list?.players.length) {
        warnings.push(`${fixture.grade} v ${fixture.opponentName}: no published team list. Publish the saved list first.`);
        continue;
      }
      const junior = isJuniorGradeLabel(fixture.grade);
      const shirtNumbers = junior ? null : await numbers(teamListSeasonOf(fixture));
      const resolved = shirtNumbers
        ? await recoverPublishedSelectionIdentities(tenantId, list, fixture.startAt) : { players: list.players };
      if (resolved.warning) warnings.push(`${fixture.grade} v ${fixture.opponentName}: ${resolved.warning}`);
      // Junior cards never look up senior identities, shirt numbers or debut records.
      const players = resolved.players.map(p => junior && (!p.participantId || privateIds.has(p.participantId))
        ? { ...p, displayName: MASK_NAME, playerId: undefined, participantId: undefined, debut: false } : p);
      content[fixture.id] = {
        ...teamListToCardInput(fixture, players,
          junior ? new Set() : await loadAutoDebuts(tenantId, players, fixture.startAt),
          shirtNumbers),
        junior,
      };
      available.push(fixture);
    }
    return { fixtures: available, content, warnings };
  }

  const source = await dataSource(req); // fail-closed native/central tenant guard
  const senior = source.kind === "central"
    ? await (await import("@workspace/db/central-queries")).centralClubMatches(source.clubId)
    : await db.select().from(matchesTable);
  const boundaries = source.kind === "central" ? (await loadClubOverlayData(tenantId)).boundaries : [];
  const juniors = await db.select().from(juniorMatchesTable).where(eq(juniorMatchesTable.tenantId, tenantId));
  const privateIds = await getPrivateIds(tenantId);
  const brand = await getTenantBrand(tenantId);
  const available: FixtureRow[] = [];
  let undated = 0;
  const seen = new Set<string>();
  const candidates = [
    ...senior.filter(m => !beforeBoundary(boundaries, m.grade, m.season)).map(m => ({ ...m, junior: false })),
    ...juniors.map(m => ({ ...m, junior: true, grade: m.ageGroup || m.grade || "Juniors",
      opponent: m.opponentName, result: m.hhResult })),
  ];
  for (const match of candidates) {
    const day = carouselMatchDay(match.matchDate);
    if (!day) { undated++; continue; }
    if (day < from || day > to) continue;
    const label = `${match.grade} v ${match.opponent || "opponent unknown"}`;
    if (!match.result?.trim() || /\b(pending|scheduled|in progress|unknown|upcoming|not started)\b/i.test(match.result.trim())) {
      warnings.push(`${label}: result is not available yet.`);
      continue;
    }
    const identity = JSON.stringify([match.junior, match.grade, day, match.round, match.opponent,
      "teamName" in match ? match.teamName : null]);
    if (seen.has(identity)) continue;
    const detail = match.junior ? await loadJuniorMatchDetail(match.id, tenantId, privateIds)
      : source.kind === "central" ? await loadCentralMatchDetail(source, match.id)
      : await loadMatchDetail(match.id, tenantId);
    if (!detail) { warnings.push(`${label}: scorecard is no longer available.`); continue; }
    const input = match.junior
      ? juniorMatchToSummaryInput(detail as JuniorMatchDetail, brand)
      : matchToSummaryInput(detail as MatchDetail);
    if (type === "matchSummary" && !input.innings.some(i => i.topBatters.length || i.topBowlers.length)) {
      warnings.push(`${label}: no detailed innings or player performances recorded. Try Results instead.`);
      continue;
    }
    // A source namespace avoids fixture/import/junior ID collisions. We offer
    // only the canonical scorecard, not additional copies from linked fixtures.
    const id = -(match.id + (match.junior ? 1_000_000_000 : 0));
    const fixture = {
      id, tenantId, grade: match.grade, opponentName: match.opponent || "Opponent unknown",
      startAt: clubTimeToUtc(`${day}T00:00`)!, venue: match.venue,
      roundLabel: input.roundLabel ?? "",
      isHome: true, source: "scorecard", createdAt: new Date(0),
      playhqMatchId: null, opponentLogoUrl: input.opposition.logoUrl ?? null, notes: null,
    } as FixtureRow;
    content[id] = { ...input, grade: match.grade, junior: match.junior,
      carouselDetail: type === "matchSummary",
      ...(type === "results" ? { innings: input.innings.map(i => ({ ...i, topBatters: [], topBowlers: [] })) } : {}),
    };
    available.push(fixture);
    seen.add(identity);
  }
  for (const fixture of fixtures) {
    const day = carouselMatchDay(fixture.startAt.toISOString());
    if (!available.some(f => f.grade === fixture.grade && carouselMatchDay(f.startAt.toISOString()) === day &&
      f.opponentName.toLowerCase() === fixture.opponentName.toLowerCase())) {
      warnings.push(`${fixture.grade} v ${fixture.opponentName}: no eligible completed scorecard matched this fixture. Check results or try another date range.`);
    }
  }
  if (undated) warnings.push(`${undated} undated or unrecognised-date scorecard(s) excluded; add match dates to include them.`);
  if (!available.length) warnings.push("No eligible completed matches in this range. Pending results and unavailable scorecards cannot be generated.");
  return { fixtures: available.sort((a, b) => +a.startAt - +b.startAt || a.id - b.id), content, warnings };
}
