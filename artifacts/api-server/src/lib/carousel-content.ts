import type { Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  matchesTable,
  juniorMatchesTable,
  teamListsTable,
  type FixtureRow,
} from "@workspace/db";
import type { MatchDetail, JuniorMatchDetail } from "@workspace/api-zod";
import { dataSource } from "./tenant";
import { loadMatchDetail, loadCentralMatchDetail } from "./match-detail";
import { loadJuniorMatchDetail } from "./match-summary-drafter";
import { clubTimeToUtc } from "./round-schedules";
import { beforeBoundary, loadClubOverlayData } from "./club-overlay";
import { juniorCarouselContent } from "./junior-carousel-content";
import { contentNames, type JuniorFixtureMeta } from "./card-content/match-day";
import { contentJuniorNames } from "./card-content/junior-names";
import {
  buildMatchSummaryContent,
  buildResultsContent,
  resultDay,
  type ResultSource,
} from "./card-content/results";
import { buildTeamListContent, type TeamListSide } from "./card-content/team-list";

export type CarouselSetType = "matchDay" | "teamList" | "results" | "matchSummary";
type Content = Record<string, Record<string, unknown>>;
/** Content as the sources response carries it (an opaque object per fixture). */
const toContent = (c: object) => c as unknown as Record<string, unknown>;

/** A source's club-time day (timestamps cross midnight in club time, not UTC/browser time). */
export const carouselMatchDay = (value: string | null): string | null => resultDay(value);

/** Grade labels as the same team: "A Grade" / "a-grade" / "A GRADE". */
function sameGrade(a: string, b: string): boolean {
  const key = (g: string) => g.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(a) === key(b);
}

/**
 * Each set's sources. Team lists, results and match summaries come from the
 * content builders (ADR-010 P7) that also make the auto-queued cards and
 * Create a Card's prefill; Match Day's fixtures go to its own builder in the
 * route. Published lists only; never Selection Hub drafts.
 */
export async function carouselContent(
  req: Request,
  tenantId: number,
  type: CarouselSetType,
  fixtures: FixtureRow[],
  from: string,
  to: string,
  audience: "all" | "senior" | "junior" = "all",
): Promise<{
  fixtures: FixtureRow[];
  content: Content;
  warnings: string[];
  /** Match Day: the junior fixtures among `fixtures` (their slides come from the content builder). */
  junior?: Map<number, JuniorFixtureMeta>;
}> {
  const content: Content = {};
  const warnings: string[] = [];
  const juniorSources =
    (type === "matchDay" || type === "teamList") && audience !== "senior"
      ? await juniorCarouselContent(tenantId, type, from, to)
      : { fixtures: [], content: {}, warnings: [], junior: new Map<number, JuniorFixtureMeta>() };
  if (audience === "junior" && (type === "matchDay" || type === "teamList")) return juniorSources;
  if (type === "matchDay")
    return {
      fixtures: [...fixtures, ...juniorSources.fixtures],
      content: juniorSources.content,
      warnings: juniorSources.warnings,
      junior: juniorSources.junior,
    };
  if (type === "teamList") {
    const lists = fixtures.length
      ? await db
          .select()
          .from(teamListsTable)
          .where(
            and(
              eq(teamListsTable.tenantId, tenantId),
              inArray(
                teamListsTable.fixtureId,
                fixtures.map((f) => f.id),
              ),
              eq(teamListsTable.isPublished, true),
            ),
          )
      : [];
    const sides: TeamListSide[] = [];
    for (const fixture of fixtures) {
      const list = lists.find((l) => l.fixtureId === fixture.id);
      if (!list?.players.length) {
        warnings.push(
          `${fixture.grade} v ${fixture.opponentName}: no published team list. Publish the saved list first.`,
        );
        continue;
      }
      sides.push({ fixture, list });
    }
    const built = await buildTeamListContent(tenantId, sides, {
      onWarning: (fixture, warning) =>
        warnings.push(`${fixture.grade} v ${fixture.opponentName}: ${warning}`),
    });
    sides.forEach(({ fixture }, i) => (content[fixture.id] = toContent(built[i])));
    const available = sides.map((s) => s.fixture);
    return {
      fixtures: [...available, ...juniorSources.fixtures],
      content: { ...content, ...juniorSources.content },
      warnings: [...warnings, ...juniorSources.warnings],
    };
  }

  const source = audience === "junior" ? null : await dataSource(req);
  const senior =
    source?.kind === "central"
      ? await (await import("@workspace/db/central-queries")).centralClubMatches(source.clubId)
      : source
        ? await db.select().from(matchesTable)
        : [];
  const boundaries =
    source?.kind === "central" ? (await loadClubOverlayData(tenantId)).boundaries : [];
  const juniors =
    audience === "senior"
      ? []
      : await db.select().from(juniorMatchesTable).where(eq(juniorMatchesTable.tenantId, tenantId));
  const names = audience === "junior" ? {} : await contentNames(tenantId);
  // Junior results take the club's junior names only (juniors isolation).
  const juniorNames = juniors.length ? await contentJuniorNames(tenantId) : {};
  const build = type === "results" ? buildResultsContent : buildMatchSummaryContent;
  const available: FixtureRow[] = [];
  let undated = 0;
  const seen = new Set<string>();
  const candidates = [
    ...senior
      .filter((m) => !beforeBoundary(boundaries, m.grade, m.season))
      .map((m) => ({ ...m, junior: false })),
    ...juniors.map((m) => ({
      ...m,
      junior: true,
      grade: m.ageGroup || m.grade || "Juniors",
      opponent: m.opponentName,
      result: m.hhResult,
    })),
  ];
  for (const match of candidates) {
    const day = carouselMatchDay(match.matchDate);
    if (!day) {
      undated++;
      continue;
    }
    if (day < from || day > to) continue;
    const label = `${match.grade} v ${match.opponent || "opponent unknown"}`;
    // An abandoned (washed-out) match is a final result: it gets a "no result"
    // card even though no winner or result line was recorded.
    const abandoned = "abandoned" in match && match.abandoned === true;
    if (
      !abandoned &&
      (!match.result?.trim() ||
        /\b(pending|scheduled|in progress|unknown|upcoming|not started)\b/i.test(
          match.result.trim(),
        ))
    ) {
      warnings.push(`${label}: result is not available yet.`);
      continue;
    }
    const identity = JSON.stringify([
      match.junior,
      match.grade,
      day,
      match.round,
      match.opponent,
      "teamName" in match ? match.teamName : null,
    ]);
    if (seen.has(identity)) continue;
    const detail = match.junior
      ? await loadJuniorMatchDetail(match.id, tenantId)
      : source?.kind === "central"
        ? await loadCentralMatchDetail(source, match.id)
        : await loadMatchDetail(match.id, tenantId);
    if (!detail) {
      warnings.push(`${label}: scorecard is no longer available.`);
      continue;
    }
    const scorecard: ResultSource = match.junior
      ? { junior: true, matchId: match.id, detail: detail as JuniorMatchDetail }
      : { matchId: match.id, detail: detail as MatchDetail };
    const [result] = await build(tenantId, [scorecard], { names, juniorNames });
    if (type === "matchSummary" && !abandoned && !result!.hasPerformers) {
      warnings.push(
        `${label}: no detailed innings or player performances recorded. Try Results instead.`,
      );
      continue;
    }
    // A source namespace avoids fixture/import/junior ID collisions. We offer
    // only the canonical scorecard, not additional copies from linked fixtures.
    const id = -(match.id + (match.junior ? 1_000_000_000 : 0));
    const fixture = {
      id,
      tenantId,
      grade: match.grade,
      opponentName: match.opponent || "Opponent unknown",
      startAt: clubTimeToUtc(`${day}T00:00`)!,
      venue: match.venue,
      roundLabel: result!.source.roundLabel ?? "",
      isHome: true,
      source: "scorecard",
      createdAt: new Date(0),
      playhqMatchId: null,
      opponentLogoUrl: result!.source.opposition.logoUrl ?? null,
      notes: null,
    } as FixtureRow;
    // The slide (scores only for results; the innings in detail on a match
    // summary that has them) is the content's projection in the carousel.
    content[id] = toContent(result!);
    available.push(fixture);
    seen.add(identity);
  }
  for (const fixture of fixtures) {
    // A grade plays one match a day, so grade + club day finds the fixture's
    // scorecard. The opponent is not compared: the fixture carries the club
    // name ("Warnbro Swans Cricket Club") and the scorecard the team name
    // ("WSCC Senior Men B Grade").
    const day = carouselMatchDay(fixture.startAt.toISOString());
    if (
      !available.some(
        (f) =>
          sameGrade(f.grade, fixture.grade) && carouselMatchDay(f.startAt.toISOString()) === day,
      )
    ) {
      warnings.push(
        `${fixture.grade} v ${fixture.opponentName}: no eligible completed scorecard matched this fixture. Check results or try another date range.`,
      );
    }
  }
  if (undated)
    warnings.push(
      `${undated} undated or unrecognised-date scorecard(s) excluded; add match dates to include them.`,
    );
  if (!available.length)
    warnings.push(
      "No eligible completed matches in this range. Pending results and unavailable scorecards cannot be generated.",
    );
  return {
    fixtures: available.sort((a, b) => +a.startAt - +b.startAt || a.id - b.id),
    content,
    warnings,
  };
}
