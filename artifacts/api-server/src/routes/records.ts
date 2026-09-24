import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  awardsTable,
  awardWinnersTable,
  clubRolesTable,
  playerIdMapTable,
} from "@workspace/db";
import { GetRecordLeadersQueryParams, GetRecordProgressionQueryParams } from "@workspace/api-zod";
import { dataSource, shouldReadCentral } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";
import {
  formatRecordValue,
  rankLeaders,
  recordsFilterFrom,
  splitDisplayName,
  walkProgression,
} from "../lib/records-analytics";
import {
  nativeLastSeasons,
  nativePlayerNames,
  nativeProgressionCandidates,
  nativeRecordLeaders,
} from "../lib/records-native";

const router: IRouter = Router();

// Response shapes (mirror the RecordLeaderboard schema in openapi.yaml).
type RecordLeaderboardEntry = {
  rank: number;
  name: string;
  playerId: number | null;
  count: number;
};
type RecordLeaderboard = {
  key: string;
  title: string;
  unit: string;
  entries: RecordLeaderboardEntry[];
};

// Canonical display order for the office-bearer role leaderboards. Anything not
// listed still surfaces, but after these and alphabetically.
const ROLE_ORDER = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Director of Cricket",
  "Club Captain",
  "Coach",
];

function roleRank(role: string): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

// Group people by a normalized name so the tally is name-based (matching the
// hand-kept "Records & Stats" sheet) while still linking to a player when the
// records agree on a single player id.
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

type Tally = {
  name: string;
  playerId: number | null;
  playerIdConflict: boolean;
  seasons: Set<number>;
};

// Build one leaderboard from (name, playerId, season) records. Counts DISTINCT
// seasons per person, ranks by count desc then name asc, sequential ranks.
function buildLeaderboard(
  key: string,
  title: string,
  unit: string,
  records: { name: string; playerId: number | null; season: number }[],
  limit = 10,
): RecordLeaderboard {
  const byPerson = new Map<string, Tally>();
  for (const r of records) {
    const name = r.name.trim();
    if (!name) continue;
    const personKey = normalizeName(name);
    let t = byPerson.get(personKey);
    if (!t) {
      t = { name, playerId: null, playerIdConflict: false, seasons: new Set() };
      byPerson.set(personKey, t);
    }
    t.seasons.add(r.season);
    if (r.playerId != null) {
      if (t.playerId == null) {
        t.playerId = r.playerId;
      } else if (t.playerId !== r.playerId) {
        t.playerIdConflict = true;
      }
    }
  }

  const entries: RecordLeaderboardEntry[] = [...byPerson.values()]
    .map((t) => ({
      name: t.name,
      playerId: t.playerIdConflict ? null : t.playerId,
      count: t.seasons.size,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return { key, title, unit, entries };
}

// Public: derived "Notable Honour Board Records". Role tenures come from
// published office-bearer roles; award counts from published winners of
// published awards. Nothing unpublished is ever counted.
router.get("/records-leaderboards", async (req, res): Promise<void> => {
  // These are derived from curated, tenant-side content (office-bearer roles and
  // award winners) — there is no central source. A central tenant gets its own
  // (empty) leaderboards rather than Halls Head's until it adds roles/awards.
  if (await shouldReadCentral(req)) {
    res.json({ roleRecords: [], awardRecords: [] });
    return;
  }

  const tenantId = getTenantId(req);

  // --- Role tenure leaderboards (office bearers only: grade is null) ---
  const roleRows = await db
    .select({
      role: clubRolesTable.role,
      season: clubRolesTable.season,
      name: clubRolesTable.name,
      playerId: clubRolesTable.playerId,
      grade: clubRolesTable.grade,
    })
    .from(clubRolesTable)
    .where(and(eq(clubRolesTable.published, true), eq(clubRolesTable.tenantId, tenantId)));

  const byRole = new Map<string, { name: string; playerId: number | null; season: number }[]>();
  for (const r of roleRows) {
    if (r.grade != null) continue; // grade captains are surfaced per grade
    if (!byRole.has(r.role)) byRole.set(r.role, []);
    byRole.get(r.role)!.push({ name: r.name, playerId: r.playerId, season: r.season });
  }

  const roleRecords: RecordLeaderboard[] = [...byRole.entries()]
    .map(([role, recs]) => buildLeaderboard(role, `Most Seasons as ${role}`, "seasons", recs))
    .filter((lb) => (lb.entries[0]?.count ?? 0) >= 2)
    .sort((a, b) => roleRank(a.key) - roleRank(b.key) || a.key.localeCompare(b.key));

  // --- Award win-count leaderboards (published winners of published awards) ---
  const awards = await db
    .select()
    .from(awardsTable)
    .where(and(eq(awardsTable.published, true), eq(awardsTable.tenantId, tenantId)))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));

  const awardIds = awards.map((a) => a.id);
  const winners = awardIds.length
    ? await db
        .select({
          awardId: awardWinnersTable.awardId,
          season: awardWinnersTable.season,
          name: awardWinnersTable.name,
          playerId: awardWinnersTable.playerId,
        })
        .from(awardWinnersTable)
        .where(
          and(
            inArray(awardWinnersTable.awardId, awardIds),
            eq(awardWinnersTable.published, true),
            eq(awardWinnersTable.tenantId, tenantId),
          ),
        )
    : [];

  const byAward = new Map<number, { name: string; playerId: number | null; season: number }[]>();
  for (const w of winners) {
    if (!byAward.has(w.awardId)) byAward.set(w.awardId, []);
    byAward.get(w.awardId)!.push({ name: w.name, playerId: w.playerId, season: w.season });
  }

  const awardRecords: RecordLeaderboard[] = awards
    .map((a) => buildLeaderboard(a.key, `Most ${a.title} Wins`, "awards", byAward.get(a.id) ?? []))
    .filter((lb) => (lb.entries[0]?.count ?? 0) >= 2);

  res.json({ roleRecords, awardRecords });
});

// ---------------------------------------------------------------------------
// Records analytics (stats plan U9 / KTD5). `/records` itself is served from
// routes/grades.ts; these sub-paths don't collide with it (Express matches
// `/records` exactly) and nothing registers a `/records/:param` route.
// ---------------------------------------------------------------------------

/** GUID → tenant int, from the tenant's player_id_map crosswalk. */
async function crosswalk(tenantId: number): Promise<Map<string, number>> {
  const rows = await db
    .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  return new Map(rows.map((m) => [m.participantId, m.playerId]));
}

router.get("/records/leaders", async (req, res): Promise<void> => {
  const query = GetRecordLeadersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { metric, limit = 10 } = query.data;
  const filter = recordsFilterFrom(query.data) ?? {};
  const source = await dataSource(req);

  if (source.kind === "central") {
    const { centralRecordLeaders } = await import("@workspace/db/central-queries");
    const [rows, intByGuid] = await Promise.all([
      centralRecordLeaders(source.clubId, metric, filter),
      crosswalk(source.tenantId),
    ]);
    const entries = rankLeaders(rows, limit).map((r) => ({
      rank: r.rank,
      playerId: intByGuid.get(r.participantId) ?? 0,
      ...splitDisplayName(r.displayName),
      value: r.value,
      lastSeason: r.lastSeason,
    }));
    res.json({ metric, entries });
    return;
  }

  const ranked = rankLeaders(await nativeRecordLeaders(metric, filter), limit);
  const last = await nativeLastSeasons(ranked.map((r) => r.playerId));
  res.json({
    metric,
    entries: ranked.map((r) => ({
      rank: r.rank,
      playerId: r.playerId,
      givenName: r.givenName,
      surname: r.surname,
      value: r.value,
      lastSeason: last.get(r.playerId) ?? null,
    })),
  });
});

router.get("/records/progression", async (req, res): Promise<void> => {
  const query = GetRecordProgressionQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { kind } = query.data;
  const grade = recordsFilterFrom(query.data)?.grade;
  const source = await dataSource(req);

  if (source.kind === "central") {
    const { centralRecordProgressionRows } = await import("@workspace/db/central-queries");
    const [rows, intByGuid] = await Promise.all([
      centralRecordProgressionRows(source.clubId, kind, grade),
      crosswalk(source.tenantId),
    ]);
    const points = walkProgression(
      kind,
      rows.map((r) => ({
        player: r,
        grade: r.grade,
        season: r.season,
        matchId: r.matchId,
        matchDate: r.matchDate,
        value: { primary: r.primary, secondary: r.secondary },
      })),
    );
    res.json({
      kind,
      points: points.map((p) => ({
        playerId: intByGuid.get(p.player.participantId) ?? 0,
        ...splitDisplayName(p.player.displayName),
        grade: p.grade,
        season: p.season,
        matchId: p.matchId,
        matchDate: p.matchDate,
        value: formatRecordValue(kind, p.value),
        dated: p.dated,
      })),
    });
    return;
  }

  const { dated, undated } = await nativeProgressionCandidates(kind, grade);
  const points = walkProgression(kind, dated, undated);
  const names = await nativePlayerNames([...new Set(points.map((p) => p.player.playerId))]);
  res.json({
    kind,
    points: points.map((p) => ({
      playerId: p.player.playerId,
      givenName: names.get(p.player.playerId)?.givenName ?? "",
      surname: names.get(p.player.playerId)?.surname ?? "",
      grade: p.grade,
      season: p.season,
      matchId: p.matchId,
      matchDate: p.matchDate,
      value: formatRecordValue(kind, p.value),
      dated: p.dated,
    })),
  });
});

export default router;
