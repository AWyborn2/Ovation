import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./index";
import { premiershipsTable, premiershipPlayersTable } from "./schema/premierships";
import {
  centralClubPremierships,
  shortTeamName,
  type CentralPremiershipSeed,
} from "./central-queries";

/**
 * Premiership honour-board seeding for central-backed tenants.
 *
 * The honour boards read the tenant-side `premierships` / `premiership_players`
 * tables (curated content is the moat). For a central-backed club those start
 * empty, so this seeds them from `central.premiers` plus each decider's
 * scorecard: the result line with scores, the Grand Final scorecard link
 * (`central_match_id`) and the club's team list.
 *
 * Re-running is safe and never overwrites a club's own edits:
 *   - a central premier already seeded (matched on `central_premier_id`) is only
 *     BACKFILLED — empty fields filled, the placeholder result upgraded, a team
 *     list added only when the premiership has none;
 *   - a row from the old seed script (no `central_premier_id`, same grade +
 *     competition + season) is adopted rather than duplicated;
 *   - hand-curated premierships with no central counterpart are untouched.
 * `replace: true` deletes the central-seeded rows first — including any edits
 * a club made to them; only hand-added premierships survive.
 *
 * Importing this module loads ./central (needs CENTRAL_DATABASE_URL), so only
 * provisioning / maintenance paths import it.
 */

/** Name shown for a player who opted out of public stats on PlayHQ. */
export const PRIVATE_PLAYER_NAME = "Private Player";

/** Calendar year of the win (the `premierships.year` convention). */
export function premiershipYear(seed: CentralPremiershipSeed): number | null {
  const m = seed.matchDate ? /^(\d{4})-(\d{2})-\d{2}/.exec(seed.matchDate) : null;
  if (m) return Number(m[1]);
  // No date: a premiership is decided at season's end, i.e. in the calendar
  // year after the season's start (2023/24 → 2024).
  return seed.seasonStartYear != null ? seed.seasonStartYear + 1 : null;
}

/** Plaque result line, e.g. "7/245 def Pinjarra 180". */
export function premiershipResult(seed: CentralPremiershipSeed): string {
  const opp = shortTeamName(seed.opponent);
  if (seed.outcome === "won") {
    if (seed.clubScore && seed.opponentScore && opp) {
      return `${seed.clubScore} def ${opp} ${seed.opponentScore}`;
    }
    return opp ? `def ${opp}` : "Premiers";
  }
  if (seed.outcome === "undecided" || seed.outcome === "lost") {
    // Washout / shared title / premiers on ladder position: central's own
    // result text says what happened.
    return seed.matchResultText ?? (opp ? `vs ${opp}` : "Premiers");
  }
  return opp ? `def ${opp}` : (seed.note ?? "Premiers");
}

function premiershipNotes(seed: CentralPremiershipSeed): string | null {
  return (
    [seed.note, seed.confidence ? `confidence: ${seed.confidence}` : null]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/** Result values the seed itself has ever written (safe to upgrade). */
function isSeedPlaceholder(result: string | null, seed: CentralPremiershipSeed): boolean {
  if (result == null || result.trim() === "") return true;
  const placeholders = new Set(
    [
      "Premiers",
      seed.note,
      seed.opponent ? `def ${seed.opponent}` : null,
      premiershipResult(seed),
    ].filter((s): s is string => !!s),
  );
  return placeholders.has(result);
}

export interface ExistingPremiership {
  id: number;
  year: number;
  grade: string;
  competition: string;
  venue: string | null;
  matchDate: string | null;
  result: string | null;
  notes: string | null;
  centralPremierId: number | null;
  centralMatchId: number | null;
  playerCount: number;
}

export interface SeedPlayerRow {
  name: string;
  participantId: string | null;
  battingOrder: number;
}

type PremiershipFields = {
  year: number;
  grade: string;
  competition: string;
  venue: string | null;
  matchDate: string | null;
  result: string;
  notes: string | null;
  centralPremierId: number;
  centralMatchId: number | null;
};

export interface PremiershipSeedPlan {
  inserts: { row: PremiershipFields; players: SeedPlayerRow[] }[];
  updates: {
    id: number;
    set: Partial<PremiershipFields>;
    players: SeedPlayerRow[];
  }[];
  /** Central premiers that can't be placed (no season / grade). */
  skipped: number;
}

function teamRows(seed: CentralPremiershipSeed): SeedPlayerRow[] {
  return seed.players.map((p) => ({
    name: p.isPrivate ? PRIVATE_PLAYER_NAME : p.name,
    // Never persist a private player's identity on a public board.
    participantId: p.isPrivate ? null : p.participantId,
    battingOrder: p.order,
  }));
}

/**
 * Pure planner: what to insert / backfill for `seeds` given the tenant's
 * existing premierships. Unit-tested without a database.
 */
export function planPremiershipSeed(
  existing: ExistingPremiership[],
  seeds: CentralPremiershipSeed[],
): PremiershipSeedPlan {
  const plan: PremiershipSeedPlan = { inserts: [], updates: [], skipped: 0 };
  const byPremier = new Map<number, ExistingPremiership>();
  for (const e of existing) if (e.centralPremierId != null) byPremier.set(e.centralPremierId, e);
  const adopted = new Set<number>();

  for (const seed of seeds) {
    const year = premiershipYear(seed);
    const grade = seed.appGrade ?? seed.grade;
    if (year == null || !grade) {
      plan.skipped++;
      continue;
    }
    const competition = seed.grade ?? seed.format ?? grade;
    const fields: PremiershipFields = {
      year,
      grade,
      competition,
      venue: seed.venue,
      matchDate: seed.matchDate,
      result: premiershipResult(seed),
      notes: premiershipNotes(seed),
      centralPremierId: seed.premierId,
      centralMatchId: seed.matchId,
    };
    const players = teamRows(seed);

    let row = byPremier.get(seed.premierId);
    if (!row) {
      // A row the pre-central_premier_id seed script wrote (year = season
      // start year then), or a curated row for the same premiership: adopt it.
      const start = seed.seasonStartYear;
      row = existing.find(
        (e) =>
          e.centralPremierId == null &&
          !adopted.has(e.id) &&
          e.grade === grade &&
          e.competition === competition &&
          start != null &&
          (e.year === start || e.year === start + 1),
      );
      if (row) adopted.add(row.id);
    }

    if (!row) {
      plan.inserts.push({ row: fields, players });
      continue;
    }

    const set: Partial<PremiershipFields> = {};
    if (row.centralPremierId == null) set.centralPremierId = seed.premierId;
    if (row.centralMatchId == null && fields.centralMatchId != null) {
      set.centralMatchId = fields.centralMatchId;
    }
    if (row.venue == null && fields.venue != null) set.venue = fields.venue;
    if (row.matchDate == null && fields.matchDate != null) set.matchDate = fields.matchDate;
    if (isSeedPlaceholder(row.result, seed)) {
      // Untouched seed output: upgrade the result line and correct the year
      // (the old script stored the season start year).
      if (row.result !== fields.result) set.result = fields.result;
      if (row.year !== fields.year) set.year = fields.year;
    }
    if (row.notes == null && fields.notes != null) set.notes = fields.notes;
    const addPlayers = row.playerCount === 0 ? players : [];
    if (Object.keys(set).length > 0 || addPlayers.length > 0) {
      plan.updates.push({ id: row.id, set, players: addPlayers });
    }
  }
  return plan;
}

export interface SeedTenantPremiershipsResult {
  centralPremiers: number;
  inserted: number;
  updated: number;
  playersAdded: number;
  skipped: number;
  /** Rows deleted first (replace mode only). */
  replaced: number;
}

/**
 * Seed (or re-seed) a central-backed tenant's premierships from
 * `central.premiers`. One transaction on the tenant DB; the central DB is only
 * read. See the module doc for the never-overwrite rules.
 */
export async function seedTenantPremierships(
  tenantId: number,
  centralClubId: number,
  opts: { replace?: boolean } = {},
): Promise<SeedTenantPremiershipsResult> {
  const seeds = await centralClubPremierships(centralClubId);

  return db.transaction(async (tx) => {
    let replaced = 0;
    if (opts.replace) {
      const gone = await tx
        .delete(premiershipsTable)
        .where(
          and(
            eq(premiershipsTable.tenantId, tenantId),
            isNotNull(premiershipsTable.centralPremierId),
          ),
        )
        .returning({ id: premiershipsTable.id });
      replaced = gone.length;
    }

    const rows = await tx
      .select({
        id: premiershipsTable.id,
        year: premiershipsTable.year,
        grade: premiershipsTable.grade,
        competition: premiershipsTable.competition,
        venue: premiershipsTable.venue,
        matchDate: premiershipsTable.matchDate,
        result: premiershipsTable.result,
        notes: premiershipsTable.notes,
        centralPremierId: premiershipsTable.centralPremierId,
        centralMatchId: premiershipsTable.centralMatchId,
      })
      .from(premiershipsTable)
      .where(eq(premiershipsTable.tenantId, tenantId));
    const counts =
      rows.length > 0
        ? await tx
            .select({
              premiershipId: premiershipPlayersTable.premiershipId,
              n: sql<number>`count(*)::int`,
            })
            .from(premiershipPlayersTable)
            .where(
              inArray(
                premiershipPlayersTable.premiershipId,
                rows.map((r) => r.id),
              ),
            )
            .groupBy(premiershipPlayersTable.premiershipId)
        : [];
    const countOf = new Map(counts.map((c) => [c.premiershipId, Number(c.n)]));
    const existing = rows.map((r) => ({ ...r, playerCount: countOf.get(r.id) ?? 0 }));

    const plan = planPremiershipSeed(existing, seeds);
    let playersAdded = 0;
    const insertPlayers = async (premiershipId: number, players: SeedPlayerRow[]) => {
      if (players.length === 0) return;
      await tx.insert(premiershipPlayersTable).values(
        players.map((p) => ({
          tenantId,
          premiershipId,
          playerId: null,
          name: p.name,
          participantId: p.participantId,
          battingOrder: p.battingOrder,
          isCaptain: false,
        })),
      );
      playersAdded += players.length;
    };

    for (const ins of plan.inserts) {
      const [created] = await tx
        .insert(premiershipsTable)
        .values({ tenantId, ...ins.row })
        .returning({ id: premiershipsTable.id });
      if (!created) throw new Error("premierships-seed: insert returned no row");
      await insertPlayers(created.id, ins.players);
    }
    for (const up of plan.updates) {
      if (Object.keys(up.set).length > 0) {
        await tx
          .update(premiershipsTable)
          .set(up.set)
          .where(and(eq(premiershipsTable.id, up.id), eq(premiershipsTable.tenantId, tenantId)));
      }
      await insertPlayers(up.id, up.players);
    }

    return {
      centralPremiers: seeds.length,
      inserted: plan.inserts.length,
      updated: plan.updates.length,
      playersAdded,
      skipped: plan.skipped,
      replaced,
    };
  });
}
