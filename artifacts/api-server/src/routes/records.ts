import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  awardsTable,
  awardWinnersTable,
  clubRolesTable,
} from "@workspace/db";

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
router.get("/records-leaderboards", async (_req, res): Promise<void> => {
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
    .where(eq(clubRolesTable.published, true));

  const byRole = new Map<
    string,
    { name: string; playerId: number | null; season: number }[]
  >();
  for (const r of roleRows) {
    if (r.grade != null) continue; // grade captains are surfaced per grade
    if (!byRole.has(r.role)) byRole.set(r.role, []);
    byRole
      .get(r.role)!
      .push({ name: r.name, playerId: r.playerId, season: r.season });
  }

  const roleRecords: RecordLeaderboard[] = [...byRole.entries()]
    .map(([role, recs]) =>
      buildLeaderboard(role, `Most Seasons as ${role}`, "seasons", recs),
    )
    // Only roles where someone has actually served multiple seasons are a
    // "record"; single-season roles aren't notable.
    .filter((lb) => (lb.entries[0]?.count ?? 0) >= 2)
    .sort(
      (a, b) => roleRank(a.key) - roleRank(b.key) || a.key.localeCompare(b.key),
    );

  // --- Award win-count leaderboards (published winners of published awards) ---
  const awards = await db
    .select()
    .from(awardsTable)
    .where(eq(awardsTable.published, true))
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
          ),
        )
    : [];

  const byAward = new Map<
    number,
    { name: string; playerId: number | null; season: number }[]
  >();
  for (const w of winners) {
    if (!byAward.has(w.awardId)) byAward.set(w.awardId, []);
    byAward
      .get(w.awardId)!
      .push({ name: w.name, playerId: w.playerId, season: w.season });
  }

  const awardRecords: RecordLeaderboard[] = awards
    .map((a) =>
      buildLeaderboard(
        a.key,
        `Most ${a.title} Wins`,
        "awards",
        byAward.get(a.id) ?? [],
      ),
    )
    // Only awards someone has won more than once form a genuine record.
    .filter((lb) => (lb.entries[0]?.count ?? 0) >= 2);

  res.json({ roleRecords, awardRecords });
});

export default router;
