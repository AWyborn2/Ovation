import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  capRegisterTable,
  matchesTable,
  matchPlayerLinesTable,
  playerGradeStatsTable,
  playersTable,
  tenantsTable,
} from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { CAP_CATEGORY_TO_GRADE } from "./cap-sync";
import { loadClubIdentity } from "./club-overlay";

/** Halls Head: the one tenant with native stats tables (tenant.ts NATIVE_STATS_TENANT_ID). */
const NATIVE_TENANT_ID = 1;

/**
 * A Grade debut caps for EVERY way a match reaches a club (Ash, 5 Oct 2026):
 * once a club has a cap register — bulk-imported or entered by hand — each new
 * A Grade (or Female A Grade) debutant gets the next cap number, whether the
 * match came through an import, the bulk match load or the PlayHQ sync. Imports
 * already mint through cap-sync.ts; this covers the rest, from whichever stats
 * the club reads (central for a PlayHQ club, the native tables for Halls Head
 * until its cut-over).
 *
 * Who is minted (planDebutCaps, pure):
 *   - The club must have a register in the category, linked to players (at
 *     least one cap with a player). Otherwise nothing: a club that never kept
 *     caps doesn't get invented ones.
 *   - Only debuts on or after the newest debut among capped players (the
 *     "frontier") are new. An older uncapped player predates the register's
 *     reach (a fill-in, a duplicate identity, a pre-register game) and is
 *     reported for the club to cap by hand, never numbered automatically.
 *   - The scheduled run only mints debuts from the last few weeks; older ones
 *     wait for the catch-up script, which previews first.
 *   - Numbers follow debut order: debut date, match, batting position.
 *   - More than a team's worth at once is held for review (like cap-sync's
 *     circuit breaker): that shape is a register not yet linked, not debuts.
 */

export type CapCategory = "male" | "female";

/** A player's first match in the cap grade, from whichever stats the club reads. */
export interface DebutCandidate {
  playerId: number;
  name: string;
  /** YYYY-MM-DD; null when the source has no date. */
  debutDate: string | null;
  /** Match id in the source (orders debuts on the same date). */
  matchId: number;
  batOrder: number | null;
  games: number;
}

export interface PlannedCap {
  capNumber: number;
  playerId: number;
  name: string;
  debutDate: string | null;
  games: number;
}

export interface DebutCapPlan {
  category: CapCategory;
  grade: string;
  /** Why nothing is minted (no register, unlinked, too many) — null when minting is allowed. */
  held: string | null;
  /** Newest debut among capped players. */
  frontier: string | null;
  toMint: PlannedCap[];
  /** New debutants older than the scheduled window: the catch-up script's job. */
  awaitingCatchUp: DebutCandidate[];
  /** Uncapped players whose debut predates the frontier: for the club to cap by hand. */
  olderUncapped: DebutCandidate[];
}

/** Most caps one run mints; more is a register that isn't linked yet. */
export const MAX_DEBUT_CAPS_PER_RUN = 11;

const byDebut = (a: DebutCandidate, b: DebutCandidate): number =>
  (a.debutDate ?? "￿").localeCompare(b.debutDate ?? "￿") ||
  a.matchId - b.matchId ||
  (a.batOrder ?? 99) - (b.batOrder ?? 99) ||
  a.playerId - b.playerId;

export function planDebutCaps(input: {
  category: CapCategory;
  caps: ReadonlyArray<{ playerId: number | null; capNumber: number }>;
  debuts: readonly DebutCandidate[];
  /** Scheduled runs: only debuts on/after this date (YYYY-MM-DD) mint; null = catch-up. */
  since: string | null;
}): DebutCapPlan {
  const grade = CAP_CATEGORY_TO_GRADE[input.category];
  const plan: DebutCapPlan = {
    category: input.category,
    grade,
    held: null,
    frontier: null,
    toMint: [],
    awaitingCatchUp: [],
    olderUncapped: [],
  };
  if (input.caps.length === 0) {
    plan.held = "the club has no cap register for this grade";
    return plan;
  }
  const capped = new Set(input.caps.flatMap((c) => (c.playerId == null ? [] : [c.playerId])));
  if (capped.size === 0) {
    plan.held = "the cap register isn't linked to players yet";
    return plan;
  }
  for (const d of input.debuts) {
    if (capped.has(d.playerId) && d.debutDate && (!plan.frontier || d.debutDate > plan.frontier)) {
      plan.frontier = d.debutDate;
    }
  }
  if (!plan.frontier) {
    plan.held = "no capped player has a recorded debut in this grade";
    return plan;
  }
  const uncapped = input.debuts
    .filter((d) => !capped.has(d.playerId) && d.playerId > 0 && d.playerId < FILL_IN_THRESHOLD)
    .sort(byDebut);
  const due: DebutCandidate[] = [];
  for (const d of uncapped) {
    if (!d.debutDate || d.debutDate < plan.frontier) plan.olderUncapped.push(d);
    else if (input.since && d.debutDate < input.since) plan.awaitingCatchUp.push(d);
    else due.push(d);
  }
  if (due.length > MAX_DEBUT_CAPS_PER_RUN) {
    plan.held =
      `${due.length} debutants at once is more than a team's worth — ` +
      "check the register is linked, then run the catch-up";
    plan.awaitingCatchUp.push(...due);
    plan.awaitingCatchUp.sort(byDebut);
    return plan;
  }
  let next = Math.max(...input.caps.map((c) => c.capNumber)) + 1;
  plan.toMint = due.map((d) => ({
    capNumber: next++,
    playerId: d.playerId,
    name: d.name,
    debutDate: d.debutDate,
    games: d.games,
  }));
  return plan;
}

// ── Sources ──────────────────────────────────────────────────────────────────

/** A stored match date as YYYY-MM-DD ("2025-10-04…" or "4/10/2025"); null when unreadable. */
export function isoDate(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return null;
}

type Reader = Pick<typeof db, "select">;

/** Halls Head's own tables (native, until its cut-over): first A Grade match per player. */
async function nativeDebuts(reader: Reader, grade: string): Promise<DebutCandidate[]> {
  const rows = await reader
    .select({
      playerId: matchPlayerLinesTable.playerId,
      matchId: matchesTable.id,
      matchDate: matchesTable.matchDate,
      season: matchesTable.season,
      batOrder: matchPlayerLinesTable.battingPos,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
    .where(
      and(
        eq(matchesTable.grade, grade),
        eq(matchesTable.abandoned, false),
        lt(matchPlayerLinesTable.playerId, FILL_IN_THRESHOLD),
      ),
    )
    .orderBy(asc(matchesTable.id));
  type Row = (typeof rows)[number] & { date: string | null };
  const first = new Map<number, Row>();
  for (const raw of rows) {
    if (raw.playerId == null) continue;
    const r: Row = { ...raw, date: isoDate(raw.matchDate) };
    const prev = first.get(raw.playerId);
    if (!prev || (r.date ?? "\uffff").localeCompare(prev.date ?? "\uffff") < 0) {
      first.set(raw.playerId, r);
    }
  }
  if (first.size === 0) return [];
  const ids = [...first.keys()];
  const [players, games] = await Promise.all([
    reader
      .select({ id: playersTable.id, given: playersTable.givenName, surname: playersTable.surname })
      .from(playersTable)
      .where(inArray(playersTable.id, ids)),
    reader
      .select({ playerId: playerGradeStatsTable.playerId, games: playerGradeStatsTable.games })
      .from(playerGradeStatsTable)
      .where(
        and(eq(playerGradeStatsTable.grade, grade), inArray(playerGradeStatsTable.playerId, ids)),
      ),
  ]);
  const nameOf = new Map(
    players.map((p) => [p.id, `${p.given ?? ""} ${p.surname ?? ""}`.replace(/\s+/g, " ").trim()]),
  );
  const gamesOf = new Map(games.map((g) => [g.playerId, g.games ?? 0]));
  return [...first.entries()].map(([playerId, r]) => ({
    playerId,
    name: nameOf.get(playerId) || `Player #${playerId}`,
    debutDate: r.date,
    matchId: r.matchId,
    batOrder: r.batOrder ?? null,
    games: gamesOf.get(playerId) ?? 0,
  }));
}

/** A PlayHQ (central) club: first match in the grade per player, through the crosswalk. */
async function centralDebuts(
  tenantId: number,
  clubId: number,
  grade: string,
): Promise<DebutCandidate[]> {
  const { centralGradeDebuts } = await import("@workspace/db/central-queries");
  const identity = await loadClubIdentity(tenantId);
  const rows = await centralGradeDebuts(clubId, [grade], identity.merges);
  const byPlayer = new Map<number, DebutCandidate>();
  for (const r of rows) {
    // Private players stay off the public register; the club can cap them by hand.
    if (r.isPrivate) continue;
    const playerId = identity.intByGuid.get(r.participantId);
    if (playerId == null || playerId <= 0 || playerId >= FILL_IN_THRESHOLD) continue;
    const c: DebutCandidate = {
      playerId,
      name: identity.nameFor(r.participantId, r.displayName) ?? `Player #${playerId}`,
      debutDate: isoDate(r.matchDate),
      matchId: r.matchId,
      batOrder: r.batOrder,
      games: r.games,
    };
    const prev = byPlayer.get(playerId);
    if (!prev) byPlayer.set(playerId, c);
    else {
      const keep = byDebut(c, prev) < 0 ? c : prev;
      byPlayer.set(playerId, { ...keep, games: prev.games + c.games });
    }
  }
  return [...byPlayer.values()];
}

/** The club's debuts in the grade from the stats it reads, or null when it has none to read. */
export async function loadDebutCandidates(
  tenantId: number,
  grade: string,
  reader: Reader = db,
): Promise<DebutCandidate[] | null> {
  // Read straight from the tenant row (not tenant.ts's request-side cache), so
  // a script can call this too.
  const [t] = await reader
    .select({
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!t) return null;
  if (t.readsFromCentral) {
    return t.centralClubId == null ? null : centralDebuts(tenantId, t.centralClubId, grade);
  }
  return tenantId === NATIVE_TENANT_ID ? nativeDebuts(reader, grade) : null;
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/** Per-tenant lock key for cap minting (pg_advisory_xact_lock(key, tenantId)). */
const DEBUT_CAP_LOCK_KEY = 7_311_902;

export interface DebutCapSyncResult {
  plans: DebutCapPlan[];
  minted: number;
}

/**
 * Plan (and with `commit`, write) debut caps for both categories. Writes run in
 * one transaction under a per-tenant lock and are re-planned inside it, so two
 * runs can never hand out the same number twice.
 */
export async function syncDebutCaps(
  tenantId: number,
  opts: { since: string | null; commit: boolean },
): Promise<DebutCapSyncResult> {
  const plans: DebutCapPlan[] = [];
  let minted = 0;
  for (const category of ["male", "female"] as const) {
    const grade = CAP_CATEGORY_TO_GRADE[category];
    const planWith = async (reader: Reader): Promise<DebutCapPlan | null> => {
      const caps = await reader
        .select({ playerId: capRegisterTable.playerId, capNumber: capRegisterTable.capNumber })
        .from(capRegisterTable)
        .where(
          and(eq(capRegisterTable.tenantId, tenantId), eq(capRegisterTable.category, category)),
        );
      if (caps.length === 0)
        return planDebutCaps({ category, caps, debuts: [], since: opts.since });
      const debuts = await loadDebutCandidates(tenantId, grade, reader);
      if (debuts == null) return null;
      return planDebutCaps({ category, caps, debuts, since: opts.since });
    };
    const plan = await planWith(db);
    if (!plan) continue;
    if (!opts.commit || plan.toMint.length === 0) {
      plans.push(plan);
      continue;
    }
    const written = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${DEBUT_CAP_LOCK_KEY}, ${tenantId})`);
      const fresh = (await planWith(tx))!;
      for (const c of fresh.toMint) {
        await tx.insert(capRegisterTable).values({
          tenantId,
          capNumber: c.capNumber,
          category,
          name: c.name,
          inStats: true,
          gamesAGrade: c.games,
          autoCreated: true,
          playerId: c.playerId,
        });
      }
      return fresh;
    });
    plans.push(written);
    minted += written.toMint.length;
  }
  return { plans, minted };
}
