import { Router, type IRouter } from "express";
import { eq, and, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorParticipantMergesTable,
  playersTable,
} from "@workspace/db";
import { isNotOut } from "../lib/junior-helpers";
import {
  ListJuniorPlayersQueryParams,
  GetJuniorPlayerParams,
  ListJuniorPlayersBySeniorParams,
  SetJuniorSeniorLinkParams,
  SetJuniorSeniorLinkBody,
  ClearJuniorSeniorLinkParams,
} from "@workspace/api-zod";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { isCentralTenant } from "../lib/tenant";
import {
  BALLS_PER_OVER,
  oversToBalls,
  ballsToOvers,
} from "../lib/junior-cricket";
import { rosterGamesByParticipant } from "../lib/junior-leaderboards";

/**
 * Junior players directory, player profile, and the senior-link
 * cross-reference (junior_participants.senior_player_id).
 *
 * JUNIORS read API — see routes/juniors.ts for the isolation and privacy
 * rules every handler here follows. Mounted by routes/juniors.ts.
 */
const router: IRouter = Router();

type MatchRow = typeof juniorMatchesTable.$inferSelect;

// Ball-notation helpers live in ../lib/junior-cricket (shared with the
// juniors admin routes): overs are cricket ball notation, never decimal.

// ---------------------------------------------------------------------------
// GET /juniors/players
// ---------------------------------------------------------------------------
router.get("/juniors/players", async (req, res): Promise<void> => {
  const query = ListJuniorPlayersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { search, season, ageGroup, includePrivate } = query.data;

  // Central tenants have no native junior participants — empty list, no leak.
  if (await isCentralTenant(req)) {
    res.json([]);
    return;
  }

  // includePrivate is honoured ONLY for a signed-in admin (the junior players
  // admin needs private rows so the privacy flag can be turned back off);
  // for everyone else the flag is silently ignored and privacy holds.
  const withPrivate = includePrivate === true && !!(await resolveAdmin(req));

  const conds = [eq(juniorParticipantsTable.tenantId, getTenantId(req))];
  if (!withPrivate) conds.push(eq(juniorParticipantsTable.isPrivate, false));
  if (search) conds.push(ilike(juniorParticipantsTable.displayName, `%${search}%`));

  // Season / age-group filters restrict to participants who actually appeared in
  // a matching match. Appearance = ANY HH line (batting OR bowling OR roster);
  // restricting to rosters alone would drop players who batted/bowled but have no
  // roster row, so we union all three line types before joining the match filter.
  if (season || ageGroup) {
    const seasonCond = season ? sql`m.season = ${season}` : sql`TRUE`;
    const ageCond = ageGroup ? sql`m.age_group = ${ageGroup}` : sql`TRUE`;
    const appearanceRes = await db.execute(sql`
      SELECT DISTINCT t.participant_id AS pid
      FROM (
        SELECT participant_id, match_id FROM junior_match_batting WHERE is_halls_head AND participant_id IS NOT NULL
        UNION
        SELECT participant_id, match_id FROM junior_match_bowling WHERE is_halls_head AND participant_id IS NOT NULL
        UNION
        SELECT participant_id, match_id FROM junior_match_rosters WHERE is_halls_head AND participant_id IS NOT NULL
      ) t
      JOIN junior_matches m ON m.id = t.match_id
      WHERE ${seasonCond} AND ${ageCond}
    `);
    const ids = (appearanceRes.rows as { pid: string | null }[])
      .map((r) => r.pid)
      .filter((x): x is string => !!x);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    conds.push(inArray(juniorParticipantsTable.participantId, ids));
  }

  const participants = await db
    .select()
    .from(juniorParticipantsTable)
    .where(and(...conds))
    .orderBy(juniorParticipantsTable.displayName);

  // Aggregate runs / wickets / games across HH appearances, keyed by pid. The
  // "matches" column uses the canonical roster-appearances count
  // (rosterGamesByParticipant) so the directory + Most Games board show the SAME
  // games figure as every other leaderboard tab, rather than a union of
  // batting/bowling/roster match ids. All three figures honour the season/age
  // filter when present (so a filtered row stays internally consistent — games,
  // runs and wickets all describe the same scope); unfiltered they are all-time,
  // which is what the always-unfiltered Most Games board reads.
  const battingAggConds = [
    eq(juniorMatchBattingTable.isHallsHead, true),
    isNotNull(juniorMatchBattingTable.participantId),
  ];
  const bowlingAggConds = [
    eq(juniorMatchBowlingTable.isHallsHead, true),
    isNotNull(juniorMatchBowlingTable.participantId),
  ];
  if (season) {
    battingAggConds.push(eq(juniorMatchesTable.season, season));
    bowlingAggConds.push(eq(juniorMatchesTable.season, season));
  }
  if (ageGroup) {
    battingAggConds.push(eq(juniorMatchesTable.ageGroup, ageGroup));
    bowlingAggConds.push(eq(juniorMatchesTable.ageGroup, ageGroup));
  }
  const [runsRows, wktsRows, matchesBy] = await Promise.all([
    db
      .select({
        pid: juniorMatchBattingTable.participantId,
        runs: sql<number>`coalesce(sum(${juniorMatchBattingTable.runs}),0)::int`,
      })
      .from(juniorMatchBattingTable)
      .innerJoin(
        juniorMatchesTable,
        eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId),
      )
      .where(and(...battingAggConds))
      .groupBy(juniorMatchBattingTable.participantId),
    db
      .select({
        pid: juniorMatchBowlingTable.participantId,
        wickets: sql<number>`coalesce(sum(${juniorMatchBowlingTable.wickets}),0)::int`,
      })
      .from(juniorMatchBowlingTable)
      .innerJoin(
        juniorMatchesTable,
        eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId),
      )
      .where(and(...bowlingAggConds))
      .groupBy(juniorMatchBowlingTable.participantId),
    rosterGamesByParticipant({ season, ageGroup }),
  ]);

  const runsBy = new Map(runsRows.map((r) => [r.pid, r.runs]));
  const wktsBy = new Map(wktsRows.map((r) => [r.pid, r.wickets]));

  res.json(
    participants.map((p) => ({
      participantId: p.participantId,
      displayName: p.displayName ?? "",
      firstSeason: p.firstSeason,
      lastSeason: p.lastSeason,
      teams: p.teams,
      matches: matchesBy.get(p.participantId) ?? 0,
      runs: runsBy.get(p.participantId) ?? 0,
      wickets: wktsBy.get(p.participantId) ?? 0,
      seniorPlayerId: p.seniorPlayerId,
      ...(withPrivate ? { isPrivate: p.isPrivate } : {}),
    })),
  );
});

// ---------------------------------------------------------------------------
// GET /juniors/players/by-senior/{playerId}
//
// Junior participants cross-linked to a senior player. Registered BEFORE
// /juniors/players/:id so "by-senior" is not swallowed by the :id param. The
// link is junior_participants.senior_player_id — a profile cross-reference
// only; this endpoint returns identities, never any figure, so junior and
// senior stats stay completely separate.
// ---------------------------------------------------------------------------
router.get(
  "/juniors/players/by-senior/:playerId",
  async (req, res): Promise<void> => {
    const params = ListJuniorPlayersBySeniorParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Central tenants have no native junior participants — empty list, no leak.
    if (await isCentralTenant(req)) {
      res.json([]);
      return;
    }

    const rows = await db
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        firstSeason: juniorParticipantsTable.firstSeason,
        lastSeason: juniorParticipantsTable.lastSeason,
      })
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.seniorPlayerId, params.data.playerId),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
          eq(juniorParticipantsTable.isPrivate, false),
        ),
      )
      .orderBy(juniorParticipantsTable.displayName);

    res.json(
      rows.map((r) => ({
        participantId: r.participantId,
        displayName: r.displayName ?? "",
        firstSeason: r.firstSeason,
        lastSeason: r.lastSeason,
      })),
    );
  },
);

// ---------------------------------------------------------------------------
// PUT /juniors/participants/{id}/senior-link (admin)
// DELETE /juniors/participants/{id}/senior-link (admin)
//
// Set / clear the junior→senior profile cross-reference at admin discretion.
// The write touches ONLY junior_participants. The lone read of the senior
// players table is a referential existence check (the same EXISTS check the
// juniors ETL performs when re-applying links) — it returns a boolean, never a
// figure, so the juniors-isolation rule (junior and senior STATS never
// combine) is untouched. Multiple junior participants may link to one senior
// player: PlayHQ occasionally minted duplicate GUIDs for the same child.
// ---------------------------------------------------------------------------
router.put(
  "/juniors/participants/:id/senior-link",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SetJuniorSeniorLinkParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SetJuniorSeniorLinkBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const [senior] = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.id, body.data.seniorPlayerId));
    if (!senior) {
      res.status(404).json({ error: "Senior player not found" });
      return;
    }

    const [updated] = await db
      .update(juniorParticipantsTable)
      .set({ seniorPlayerId: body.data.seniorPlayerId })
      .where(
        and(
          eq(juniorParticipantsTable.participantId, params.data.id),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    res.json({
      participantId: updated.participantId,
      displayName: updated.displayName ?? "",
      seniorPlayerId: updated.seniorPlayerId,
    });
  },
);

router.delete(
  "/juniors/participants/:id/senior-link",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ClearJuniorSeniorLinkParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const [updated] = await db
      .update(juniorParticipantsTable)
      .set({ seniorPlayerId: null })
      .where(
        and(
          eq(juniorParticipantsTable.participantId, params.data.id),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// GET /juniors/players/{id}
// ---------------------------------------------------------------------------
router.get("/juniors/players/:id", async (req, res): Promise<void> => {
  const params = GetJuniorPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  let pid = params.data.id;

  // Central tenants have no native junior participants — 404, never the demo club's.
  if (await isCentralTenant(req)) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const tenantId = getTenantId(req);
  const loadParticipant = async (id: string) => {
    const [row] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.participantId, id),
          eq(juniorParticipantsTable.tenantId, tenantId),
        ),
      );
    return row;
  };

  let participant = await loadParticipant(pid);

  // Absorbed duplicate GUIDs alias to their keeper so old bookmarks and
  // shared links keep working after an admin merge. The map is flat by
  // construction; the hop loop is defensive only (cycle/cap ⇒ treat as miss).
  if (!participant) {
    let cur = pid;
    for (let hop = 0; hop < 16; hop++) {
      const [merge] = await db
        .select({
          keeper: juniorParticipantMergesTable.keeperParticipantId,
        })
        .from(juniorParticipantMergesTable)
        .where(
          and(
            eq(juniorParticipantMergesTable.tenantId, tenantId),
            eq(juniorParticipantMergesTable.duplicateParticipantId, cur),
          ),
        );
      if (!merge) break;
      cur = merge.keeper;
      const resolved = await loadParticipant(cur);
      if (resolved) {
        participant = resolved;
        // The rest of the handler (and the response's participantId) uses the
        // keeper GUID, so client URLs self-heal on the next navigation.
        pid = cur;
        break;
      }
    }
  }

  if (!participant || participant.isPrivate) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  // All HH batting/bowling lines for this player, joined to their match context.
  const battingRows = await db
    .select({
      line: juniorMatchBattingTable,
      match: juniorMatchesTable,
    })
    .from(juniorMatchBattingTable)
    .innerJoin(
      juniorMatchesTable,
      eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId),
    )
    .where(
      and(
        eq(juniorMatchBattingTable.participantId, pid),
        eq(juniorMatchBattingTable.isHallsHead, true),
      ),
    );
  const bowlingRows = await db
    .select({
      line: juniorMatchBowlingTable,
      match: juniorMatchesTable,
    })
    .from(juniorMatchBowlingTable)
    .innerJoin(
      juniorMatchesTable,
      eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId),
    )
    .where(
      and(
        eq(juniorMatchBowlingTable.participantId, pid),
        eq(juniorMatchBowlingTable.isHallsHead, true),
      ),
    );
  const rosterRows = await db
    .select({ match: juniorMatchesTable })
    .from(juniorMatchRostersTable)
    .innerJoin(
      juniorMatchesTable,
      eq(juniorMatchesTable.id, juniorMatchRostersTable.matchId),
    )
    .where(
      and(
        eq(juniorMatchRostersTable.participantId, pid),
        eq(juniorMatchRostersTable.isHallsHead, true),
      ),
    );

  // Batting totals.
  let runs = 0,
    ballsFaced = 0,
    notOuts = 0,
    fours = 0,
    sixes = 0,
    highScore: number | null = null;
  for (const { line } of battingRows) {
    runs += line.runs ?? 0;
    ballsFaced += line.balls ?? 0;
    fours += line.fours ?? 0;
    sixes += line.sixes ?? 0;
    if (isNotOut(line.dismissal)) notOuts += 1;
    if (line.runs != null && (highScore == null || line.runs > highScore))
      highScore = line.runs;
  }
  const battingInnings = battingRows.length;
  const outs = battingInnings - notOuts;
  const battingTotals = {
    matches: new Set(battingRows.map((r) => r.match.id)).size,
    innings: battingInnings,
    runs,
    ballsFaced,
    notOuts,
    fours,
    sixes,
    highScore,
    average: outs > 0 ? Math.round((runs / outs) * 100) / 100 : null,
  };

  // Bowling totals. Overs accumulate in BALLS (ball notation is not decimal).
  let bBalls = 0,
    bMaidens = 0,
    bRuns = 0,
    bWickets = 0,
    bestWickets: number | null = null,
    bestRuns: number | null = null;
  for (const { line } of bowlingRows) {
    bBalls += oversToBalls(line.overs);
    bMaidens += line.maidens ?? 0;
    bRuns += line.runs ?? 0;
    bWickets += line.wickets ?? 0;
    const w = line.wickets ?? 0;
    const r = line.runs ?? 0;
    if (
      bestWickets == null ||
      w > bestWickets ||
      (w === bestWickets && bestRuns != null && r < bestRuns)
    ) {
      bestWickets = w;
      bestRuns = r;
    }
  }
  const bowlingTotals = {
    matches: new Set(bowlingRows.map((r) => r.match.id)).size,
    overs: ballsToOvers(bBalls),
    maidens: bMaidens,
    runs: bRuns,
    wickets: bWickets,
    bestWickets,
    bestRuns,
    economy:
      bBalls > 0
        ? Math.round((bRuns / (bBalls / BALLS_PER_OVER)) * 100) / 100
        : null,
  };

  // Per-match lines (batting + bowling merged by match), newest season first.
  const battingByMatch = new Map(battingRows.map((r) => [r.match.id, r]));
  const bowlingByMatch = new Map(bowlingRows.map((r) => [r.match.id, r]));
  const matchMeta = new Map<number, MatchRow>();
  for (const r of battingRows) matchMeta.set(r.match.id, r.match);
  for (const r of bowlingRows) matchMeta.set(r.match.id, r.match);
  for (const r of rosterRows) matchMeta.set(r.match.id, r.match);

  const sortedMatches = Array.from(matchMeta.values()).sort((a, b) => {
    const ya = Number(a.season?.slice(0, 4) ?? 0);
    const yb = Number(b.season?.slice(0, 4) ?? 0);
    if (yb !== ya) return yb - ya;
    return b.id - a.id;
  });

  const matches = sortedMatches.map((m) => {
    const b = battingByMatch.get(m.id);
    const bw = bowlingByMatch.get(m.id);
    return {
      matchId: m.id,
      season: m.season,
      ageGroup: m.ageGroup,
      round: m.round,
      matchDate: m.matchDate,
      opponentName: m.opponentName,
      hhResult: m.hhResult,
      batting: b
        ? {
            id: b.line.id,
            participantId: pid,
            playerName: participant.displayName ?? "",
            isHallsHead: true,
            isPrivate: false,
            batOrder: b.line.batOrder,
            runs: b.line.runs,
            balls: b.line.balls,
            fours: b.line.fours,
            sixes: b.line.sixes,
            strikeRate: b.line.strikeRate,
            dismissal: b.line.dismissal,
          }
        : null,
      bowling: bw
        ? {
            id: bw.line.id,
            participantId: pid,
            playerName: participant.displayName ?? "",
            isHallsHead: true,
            isPrivate: false,
            overs: bw.line.overs,
            maidens: bw.line.maidens,
            runs: bw.line.runs,
            wickets: bw.line.wickets,
            economy: bw.line.economy,
            wides: bw.line.wides,
            noBalls: bw.line.noBalls,
          }
        : null,
    };
  });

  // Per-season breakdown derived from the merged match list.
  const seasonMap = new Map<
    string,
    { season: string; teams: Set<string>; matches: Set<number>; runs: number; wickets: number }
  >();
  for (const m of sortedMatches) {
    const key = m.season ?? "—";
    let s = seasonMap.get(key);
    if (!s) {
      s = { season: key, teams: new Set(), matches: new Set(), runs: 0, wickets: 0 };
      seasonMap.set(key, s);
    }
    s.matches.add(m.id);
    if (m.ageGroup) s.teams.add(m.ageGroup);
    const b = battingByMatch.get(m.id);
    const bw = bowlingByMatch.get(m.id);
    s.runs += b?.line.runs ?? 0;
    s.wickets += bw?.line.wickets ?? 0;
  }
  const seasons = Array.from(seasonMap.values())
    .sort((a, b) => Number(b.season.slice(0, 4) || 0) - Number(a.season.slice(0, 4) || 0))
    .map((s) => ({
      season: s.season,
      teams: Array.from(s.teams).join(", ") || null,
      matches: s.matches.size,
      runs: s.runs,
      wickets: s.wickets,
    }));

  res.json({
    participantId: participant.participantId,
    displayName: participant.displayName ?? "",
    firstSeason: participant.firstSeason,
    lastSeason: participant.lastSeason,
    teams: participant.teams,
    seniorPlayerId: participant.seniorPlayerId,
    batting: battingTotals,
    bowling: bowlingTotals,
    seasons,
    matches,
  });
});

export default router;
