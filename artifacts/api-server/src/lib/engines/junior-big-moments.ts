import { createHash } from "node:crypto";
import { and, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
} from "@workspace/db";
import { draftKeys, findDraftByKey, upsertDraftByKey, withdrawDraft } from "../draft-upsert";
import { loadJuniorNaming, loadJuniorTeamPublishing } from "../junior-helpers";
import { juniorTeamPublishMode } from "../junior-publishing";
import { loadDraftingGates } from "../posting-plan";

/**
 * Junior Big Moments (plan 2026-10-15-001 U4, KTD6): a junior innings of at least
 * the club's junior runs bar (a century, or a half-century when the club lowered
 * it, R11) or five wickets, for the age groups the Big Moment row lists. Junior
 * scorecards carry no fielders or balls, so there are no junior hat-tricks or
 * catching feats.
 *
 * Every card is junior content: named in the club's junior style (a private
 * player is never drafted), no photo, marked `junior` with the team it covers,
 * and only an explicitly auto team gets an auto-ready time (the per-team mode,
 * ADR-006).
 */
export type JuniorBigMomentsResult = { drafted: number; refreshed: number; skipped: number };

/** A source-key token for a junior participant (never the GUID itself). */
export function juniorPlayerKey(participantId: string): string {
  return `j${createHash("sha1").update(participantId.toLowerCase()).digest("hex").slice(0, 16)}`;
}

/** "Round 4" → 4; anything else null (junior rounds are free text). */
function roundNumber(round: string | null): number | null {
  const m = /(\d+)/.exec(round ?? "");
  return m ? Number(m[1]) : null;
}

export async function generateJuniorBigMomentDrafts(
  tenantId: number,
  matchIds: readonly number[],
  now: Date = new Date(),
): Promise<JuniorBigMomentsResult> {
  const result: JuniorBigMomentsResult = { drafted: 0, refreshed: 0, skipped: 0 };
  if (matchIds.length === 0) return result;
  const gates = await loadDraftingGates(tenantId);
  const bar = gates.juniorRunsBar();

  const matches = await db
    .select({
      id: juniorMatchesTable.id,
      ageGroup: juniorMatchesTable.ageGroup,
      grade: juniorMatchesTable.grade,
      teamName: juniorMatchesTable.teamName,
      opponentName: juniorMatchesTable.opponentName,
      round: juniorMatchesTable.round,
      seasonStartYear: juniorMatchesTable.seasonStartYear,
      matchDate: juniorMatchesTable.matchDate,
    })
    .from(juniorMatchesTable)
    .where(
      and(eq(juniorMatchesTable.tenantId, tenantId), inArray(juniorMatchesTable.id, [...matchIds])),
    );
  const allowed = new Map<number, (typeof matches)[number]>();
  for (const m of matches) {
    const grade = m.ageGroup ?? m.grade ?? "";
    if (gates.achievement("century", grade, true) || gates.achievement("fiveFor", grade, true)) {
      allowed.set(m.id, m);
    }
  }
  if (allowed.size === 0) {
    result.skipped = matchIds.length;
    return result;
  }
  const ids = [...allowed.keys()];
  const [batting, bowling] = await Promise.all([
    db
      .select()
      .from(juniorMatchBattingTable)
      .where(
        and(
          inArray(juniorMatchBattingTable.matchId, ids),
          eq(juniorMatchBattingTable.isHallsHead, true),
          gte(juniorMatchBattingTable.runs, bar),
        ),
      ),
    db
      .select()
      .from(juniorMatchBowlingTable)
      .where(
        and(
          inArray(juniorMatchBowlingTable.matchId, ids),
          eq(juniorMatchBowlingTable.isHallsHead, true),
          gte(juniorMatchBowlingTable.wickets, 5),
        ),
      ),
  ]);
  if (batting.length === 0 && bowling.length === 0) return result;

  const [naming, publishing] = await Promise.all([
    loadJuniorNaming(tenantId, [
      ...batting.map((b) => b.participantId),
      ...bowling.map((b) => b.participantId),
    ]),
    loadJuniorTeamPublishing(tenantId),
  ]);

  type Line = { matchId: number; participantId: string | null; playerName: string | null };
  const draftFor = async (
    line: Line,
    kind: "century" | "fiveFor",
    body: Record<string, unknown>,
  ) => {
    const m = allowed.get(line.matchId)!;
    const grade = m.ageGroup ?? m.grade ?? "";
    if (!gates.achievement(kind, grade, true) || !line.participantId) {
      result.skipped++;
      return;
    }
    const named = naming.line({
      participantId: line.participantId,
      playerName: line.playerName,
      isHallsHead: true,
    });
    const season = m.seasonStartYear ?? new Date(m.matchDate ?? now).getFullYear();
    const sourceKey = draftKeys.matchFeat(
      kind,
      juniorPlayerKey(line.participantId),
      grade,
      season,
      roundNumber(m.round),
    );
    // A withheld (private) child is never a Big Moment card; one drafted before the
    // child was marked private is withdrawn on this sweep (KTD8), so it never publishes.
    if (named.isPrivate || !named.playerName) {
      const existing = await findDraftByKey(tenantId, sourceKey);
      if (existing && existing.status !== "dismissed") await withdrawDraft(existing);
      result.skipped++;
      return;
    }
    const mode = juniorTeamPublishMode(publishing, m.ageGroup, m.teamName);
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "milestone",
      family: "achievements",
      sourceKey,
      cardInput: {
        kind,
        playerName: named.playerName,
        grade,
        opponent: m.opponentName,
        round: roundNumber(m.round),
        photoUrl: null,
        ...body,
        // Junior markers (KTD6): junior rules, and the team the publishing gate checks.
        junior: true,
        juniorTeams: [{ ageGroup: m.ageGroup ?? null, teamName: m.teamName ?? null }],
      },
      appPath: `/juniors/matches/${m.id}`,
      sourceMatchIsJunior: true,
      // No photo: no player, grade or featured player for any photo pick.
      playerId: null,
      grade: null,
      featuredPlayerId: null,
      sourceImportedAt: now,
      // Only an explicitly auto team follows the club's auto-post window.
      autoReady: mode === "auto",
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  };

  for (const b of batting) {
    await draftFor(b, "century", {
      runs: b.runs,
      balls: b.balls,
      notOut: /not out/i.test(b.dismissal ?? ""),
    });
  }
  for (const w of bowling) {
    await draftFor(w, "fiveFor", {
      wickets: w.wickets,
      runsConceded: w.runs,
      overs: w.overs != null ? String(w.overs) : null,
      figures: `${w.wickets}/${w.runs ?? "-"}`,
    });
  }
  return result;
}
