/**
 * The PlayHQ ingest's writes to the season shirt-number register
 * (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, U5 / KTD9). The only
 * automatic write path into the register, in two steps, both only for tenants with the
 * feature switched on:
 *
 *  1. After team lists are projected: every PlayHQ participant on the tenant's team lists
 *     for recent and upcoming fixtures who is missing from that fixture's season register is
 *     added (source `lineup`), linked to a player when the tenant's crosswalk knows them,
 *     else held. Carry-forward applies; under the `block` duplicate policy a carried number
 *     another entry already wears is left off.
 *  2. After the central projection: a held entry is linked once its participant has a
 *     senior scorecard or roster row for the tenant's club in central, minting the crosswalk
 *     row first (with the shared `mintPlayerIdMap`) when there is none. "Linked" stays equal
 *     to "has played", so no stub profiles appear (R16).
 *
 * Every read and write filters on an explicit tenant id; PlayHQ GUIDs are lowercased before
 * comparison and storage; both steps are idempotent, so the hourly re-run is a no-op.
 * Central is only ever read.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { TeamListPlayer } from "../schema/fixtures";
import type {
  ShirtNumberDuplicatePolicy,
  ShirtNumberRolloverPolicy,
  ShirtNumberSource,
} from "../schema/shirt_numbers";
import { seasonStartYearFor } from "../seasons";
import {
  carriedNumberFor,
  cleanShirtNumberName,
  linkHeldShirtNumberEntry,
  normaliseParticipantId,
  numberAfterDuplicatePolicy,
  shirtNumberNameKey,
  shirtNumberSettingsFromRow,
} from "../shirt-numbers";
import { MINT_LOCK_KEY, NATIVE_STATS_TENANT_ID } from "../player-id-mint";
import { TEAM_LIST_LOOKAHEAD_DAYS } from "./team-lists";

/** Player ids at or above this are fill-ins / cap-only, never on the register. */
const FILL_IN_THRESHOLD = 90000;

// ---------------------------------------------------------------------------
// Pure planning (unit-tested)
// ---------------------------------------------------------------------------

/** One lineup participant to make sure is on a season's register. */
export interface LineupCandidate {
  season: number;
  /** Lowercased PlayHQ GUID. */
  participantId: string;
  name: string;
  /** In the tenant's player space, when its crosswalk knows the participant. */
  playerId: number | null;
}

/** A register entry as the planners see it (one tenant's rows). */
export interface ExistingShirtEntry {
  /** The row id; needed only to attach a lineup participant to a name-only held entry. */
  id?: number;
  season: number;
  /** The register name; needed only for the name-only held-entry match. */
  name?: string;
  participantId: string | null;
  playerId: number | null;
  number: string | null;
}

/**
 * A lineup participant attached to an existing name-only held entry (an upload row for
 * someone who had not played yet): the entry keeps its number and gains the ids.
 */
export interface ShirtEntryAttach {
  entryId: number;
  participantId: string;
  playerId: number | null;
}

export interface LineupPlan {
  inserts: NewShirtNumberEntry[];
  attaches: ShirtEntryAttach[];
}

export interface NewShirtNumberEntry {
  tenantId: number;
  season: number;
  name: string;
  participantId: string;
  playerId: number | null;
  number: string | null;
  source: ShirtNumberSource;
}

/** The key carried numbers are passed under: `${season}:${participantId}`. */
export function carriedKey(season: number, participantId: string): string {
  return `${season}:${participantId}`;
}

/**
 * The participants on a tenant's team lists, one per (season, participant): the season
 * from the fixture's start (KTD7), the player from the tenant's crosswalk (lowercased
 * keys), the name trimmed and capped. Rows without a participant, fill-ins and blank
 * names are skipped.
 */
export function lineupCandidates(
  fixtures: ReadonlyArray<{ startAt: Date; players: readonly TeamListPlayer[] }>,
  playerIdOf: ReadonlyMap<string, number>,
): LineupCandidate[] {
  const out: LineupCandidate[] = [];
  const seen = new Set<string>();
  for (const f of fixtures) {
    const season = seasonStartYearFor(f.startAt);
    for (const p of f.players) {
      const participantId = normaliseParticipantId(p.participantId);
      if (!participantId) continue;
      const key = carriedKey(season, participantId);
      if (seen.has(key)) continue;
      const playerId = playerIdOf.get(participantId) ?? p.playerId ?? null;
      if (playerId !== null && playerId >= FILL_IN_THRESHOLD) continue;
      const name = cleanShirtNumberName(p.displayName);
      if (!name) continue;
      seen.add(key);
      out.push({ season, participantId, name, playerId });
    }
  }
  return out;
}

/** True when the season's register already has this person (by participant or player). */
function onRegister(c: LineupCandidate, existing: readonly ExistingShirtEntry[]): boolean {
  return existing.some(
    (e) =>
      e.season === c.season &&
      (normaliseParticipantId(e.participantId) === c.participantId ||
        (c.playerId !== null && e.playerId === c.playerId)),
  );
}

/** The candidates not yet on their season's register (the ones that need a carried number). */
export function missingLineupCandidates(
  candidates: readonly LineupCandidate[],
  existing: readonly ExistingShirtEntry[],
): LineupCandidate[] {
  return candidates.filter((c) => !onRegister(c, existing));
}

/** `${season}:${name key}`: the scope a name-only identity is unique within. */
const seasonNameKey = (season: number, name: string) => `${season}:${shirtNumberNameKey(name)}`;

/**
 * The register entries to write for a tenant's lineup candidates: only people missing from
 * the season. A missing candidate whose name matches exactly one id-less (name-only) held
 * entry in the season, and no other missing candidate's, is attached to that entry (it keeps
 * its number) — the same name-only identity rule the upload commit uses. Everyone else is
 * inserted, with last season's number when one was carried (`carried`, keyed by
 * {@link carriedKey}), dropped under `block` when it would duplicate a number already worn
 * in the season (including one planned earlier in this run).
 */
export function planLineupInserts(args: {
  tenantId: number;
  candidates: readonly LineupCandidate[];
  existing: readonly ExistingShirtEntry[];
  carried: ReadonlyMap<string, string>;
  duplicatePolicy: ShirtNumberDuplicatePolicy;
}): LineupPlan {
  const taken = new Map<number, Set<string>>();
  const takenIn = (season: number) => {
    let s = taken.get(season);
    if (!s) taken.set(season, (s = new Set()));
    return s;
  };
  for (const e of args.existing) if (e.number !== null) takenIn(e.season).add(e.number);

  const missing = missingLineupCandidates(args.candidates, args.existing);

  // Name-only held entries and missing candidates, per (season, name key): an attach needs
  // exactly one of each, so two same-named people never share an entry.
  const nameOnly = new Map<string, ExistingShirtEntry[]>();
  for (const e of args.existing) {
    if (e.id === undefined || e.name === undefined) continue;
    if (e.playerId !== null || e.participantId !== null) continue;
    const key = seasonNameKey(e.season, e.name);
    nameOnly.set(key, [...(nameOnly.get(key) ?? []), e]);
  }
  const missingByName = new Map<string, number>();
  for (const c of missing) {
    const key = seasonNameKey(c.season, c.name);
    missingByName.set(key, (missingByName.get(key) ?? 0) + 1);
  }

  const planned: ExistingShirtEntry[] = [];
  const inserts: NewShirtNumberEntry[] = [];
  const attaches: ShirtEntryAttach[] = [];
  for (const c of missing) {
    if (onRegister(c, planned)) continue;

    const key = seasonNameKey(c.season, c.name);
    const heldByName = nameOnly.get(key) ?? [];
    if (heldByName.length === 1 && missingByName.get(key) === 1 && shirtNumberNameKey(c.name)) {
      const entry = heldByName[0]!;
      attaches.push({ entryId: entry.id!, participantId: c.participantId, playerId: c.playerId });
      planned.push({
        season: c.season,
        participantId: c.participantId,
        playerId: c.playerId,
        number: entry.number,
      });
      continue;
    }

    const inUse = takenIn(c.season);
    const number = numberAfterDuplicatePolicy(
      args.carried.get(carriedKey(c.season, c.participantId)) ?? null,
      inUse,
      args.duplicatePolicy,
    );
    if (number !== null) inUse.add(number);
    planned.push({
      season: c.season,
      participantId: c.participantId,
      playerId: c.playerId,
      number,
    });
    inserts.push({
      tenantId: args.tenantId,
      season: c.season,
      name: c.name,
      participantId: c.participantId,
      playerId: c.playerId,
      number,
      source: "lineup",
    });
  }
  return { inserts, attaches };
}

/**
 * Whether the held-entry link step may mint crosswalk rows for a tenant. Only when the
 * tenant's curated player ids ARE crosswalk ids — every tenant except Halls Head while it
 * still reads native stats (mirrors `curatedIdsAreNative` in the api-server, on the raw
 * `reads_from_central` flag). A native tenant's ids are native `players.id`s: minting would
 * hand out ids the native importers later reuse for different people, so its held entries
 * link only through crosswalk rows that already exist (seeded to native ids).
 */
export function heldLinkMayMint(tenant: { id: number; readsFromCentral: boolean }): boolean {
  return !(tenant.id === NATIVE_STATS_TENANT_ID && !tenant.readsFromCentral);
}

/** One tenant's sync failure, reported instead of aborting the remaining tenants. */
export interface ShirtNumberSyncError {
  tenantId: number;
  message: string;
}

/** A sync step's outcome: per-tenant summaries plus the tenants that failed. */
export interface ShirtNumberSyncResult<T> {
  tenants: T[];
  errors: ShirtNumberSyncError[];
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface HeldShirtEntry {
  id: number;
  tenantId: number;
  season: number;
  participantId: string;
}

/**
 * Which held entries to link (F2 / AE2): the tenant's own entries whose participant has
 * appeared for the club (`appeared`, lowercased GUIDs), linked through the tenant's
 * crosswalk (`playerIdOf`, lowercased keys). An appeared participant without a crosswalk
 * row comes back in `unmapped` (mint, then plan again). Never links to a fill-in id, nor to
 * a player already linked in the same season (the per-person unique index).
 */
export function planHeldLinks(args: {
  tenantId: number;
  held: readonly HeldShirtEntry[];
  appeared: ReadonlySet<string>;
  playerIdOf: ReadonlyMap<string, number>;
  /** The tenant's linked entries: (season, playerId) pairs already taken. */
  linked: ReadonlyArray<{ season: number; playerId: number }>;
}): { links: { entryId: number; playerId: number }[]; unmapped: string[] } {
  const taken = new Set(args.linked.map((l) => `${l.season}:${l.playerId}`));
  const links: { entryId: number; playerId: number }[] = [];
  const unmapped = new Set<string>();
  for (const h of args.held) {
    if (h.tenantId !== args.tenantId) continue;
    const pid = normaliseParticipantId(h.participantId);
    if (!pid || !args.appeared.has(pid)) continue;
    const playerId = args.playerIdOf.get(pid);
    if (playerId === undefined) {
      unmapped.add(pid);
      continue;
    }
    if (playerId >= FILL_IN_THRESHOLD) continue;
    const key = `${h.season}:${playerId}`;
    if (taken.has(key)) continue;
    taken.add(key);
    links.push({ entryId: h.id, playerId });
  }
  return { links, unmapped: [...unmapped] };
}

// ---------------------------------------------------------------------------
// DB wiring (exercised against Postgres in CI by the api-server suite
// src/lib/shirt-number-sync.db.test.ts, not unit-tested here)
// ---------------------------------------------------------------------------

/** How far back a played fixture's team list still feeds the register. */
export const SHIRT_NUMBER_LINEUP_LOOKBACK_DAYS = 14;

export interface ShirtNumberSyncOpts {
  /** Tenants linked to these PlayHQ organisations (compared case-insensitively). */
  orgIds?: string[];
  tenantId?: number;
  syncEnabledOnly?: boolean;
  now?: Date;
  log?: (line: string) => void;
}

interface SyncTenant {
  id: number;
  centralClubId: number;
  readsFromCentral: boolean;
  duplicatePolicy: ShirtNumberDuplicatePolicy;
  rolloverPolicy: ShirtNumberRolloverPolicy;
}

/** The linked tenants in scope that have shirt numbers switched on. */
async function enabledTenants(opts: ShirtNumberSyncOpts): Promise<SyncTenant[]> {
  const { db, tenantsTable, shirtNumberSettingsTable } = await import("../index");
  const conds = [isNotNull(tenantsTable.playhqOrgId)];
  if (opts.tenantId) conds.push(eq(tenantsTable.id, opts.tenantId));
  if (opts.syncEnabledOnly) conds.push(eq(tenantsTable.playhqSyncEnabled, true));
  if (opts.orgIds) {
    const wanted = [...new Set(opts.orgIds.map((o) => o.toLowerCase()))];
    if (wanted.length === 0) return [];
    conds.push(inArray(sql<string>`lower(${tenantsTable.playhqOrgId})`, wanted));
  }
  const tenants = await db
    .select({
      id: tenantsTable.id,
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
    })
    .from(tenantsTable)
    .where(and(...conds));
  if (tenants.length === 0) return [];
  // One settings read for every candidate tenant; a tenant without a row gets the defaults.
  const rows = await db
    .select()
    .from(shirtNumberSettingsTable)
    .where(
      inArray(
        shirtNumberSettingsTable.tenantId,
        tenants.map((t) => t.id),
      ),
    );
  const rowByTenant = new Map(rows.map((r) => [r.tenantId, r] as const));
  const out: SyncTenant[] = [];
  for (const t of tenants) {
    const settings = shirtNumberSettingsFromRow(rowByTenant.get(t.id));
    if (settings.enabled)
      out.push({
        id: t.id,
        centralClubId: t.centralClubId,
        readsFromCentral: t.readsFromCentral,
        duplicatePolicy: settings.duplicatePolicy,
        rolloverPolicy: settings.rolloverPolicy,
      });
  }
  return out;
}

/**
 * A tenant's crosswalk for these participants, lowercased GUID → player id. A participant
 * folded into a keeper by a confirmed merge resolves to the keeper's id.
 */
async function playerIdsFor(
  tenantId: number,
  guids: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (guids.length === 0) return out;
  const { db, playerIdMapTable, playerCurationTable } = await import("../index");
  const lookup = async (ids: readonly string[]) =>
    db
      .select({ guid: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
      .from(playerIdMapTable)
      .where(
        and(
          eq(playerIdMapTable.tenantId, tenantId),
          inArray(sql<string>`lower(${playerIdMapTable.participantId})`, [...ids]),
        ),
      );
  for (const m of await lookup(guids)) out.set(m.guid.toLowerCase(), m.playerId);

  const missing = guids.filter((g) => !out.has(g));
  if (missing.length === 0) return out;
  const merged = await db
    .select({
      guid: playerCurationTable.participantId,
      keeper: playerCurationTable.mergedIntoParticipantId,
    })
    .from(playerCurationTable)
    .where(
      and(
        eq(playerCurationTable.tenantId, tenantId),
        inArray(sql<string>`lower(${playerCurationTable.participantId})`, missing),
        isNotNull(playerCurationTable.mergedIntoParticipantId),
        eq(playerCurationTable.mergeStatus, "confirmed"),
      ),
    );
  const keeperOf = new Map(
    merged.map((m) => [m.guid.toLowerCase(), (m.keeper ?? "").toLowerCase()] as const),
  );
  if (keeperOf.size === 0) return out;
  const keepers = new Map<string, number>();
  for (const m of await lookup([...new Set(keeperOf.values())]))
    keepers.set(m.guid.toLowerCase(), m.playerId);
  for (const [guid, keeper] of keeperOf) {
    const id = keepers.get(keeper);
    if (id !== undefined) out.set(guid, id);
  }
  return out;
}

export interface LineupShirtSyncSummary {
  tenantId: number;
  inserted: number;
  /** Name-only held entries a lineup participant was attached to (they keep their number). */
  attached: number;
}

type Log = (line: string) => void;

/**
 * Step 1 (after `projectTeamLists`): add the lineup participants of each enabled tenant's
 * recent and upcoming team lists to their fixtures' season registers. One tenant's failure
 * is logged and reported in `errors`; the remaining tenants still sync.
 */
export async function syncLineupShirtNumbers(
  opts: ShirtNumberSyncOpts,
): Promise<ShirtNumberSyncResult<LineupShirtSyncSummary>> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? new Date();
  const result: ShirtNumberSyncResult<LineupShirtSyncSummary> = { tenants: [], errors: [] };
  for (const t of await enabledTenants(opts)) {
    const summary: LineupShirtSyncSummary = { tenantId: t.id, inserted: 0, attached: 0 };
    result.tenants.push(summary);
    try {
      await syncTenantLineup(t, summary, now, log);
    } catch (err) {
      const message = errorMessage(err);
      log(`tenant ${t.id}: shirt-number lineup sync failed: ${message}`);
      result.errors.push({ tenantId: t.id, message });
    }
  }
  return result;
}

async function syncTenantLineup(
  t: SyncTenant,
  summary: LineupShirtSyncSummary,
  now: Date,
  log: Log,
): Promise<void> {
  const { db, fixturesTable, teamListsTable, shirtNumbersTable } = await import("../index");
  const day = 24 * 3600 * 1000;
  const lists = await db
    .select({ startAt: fixturesTable.startAt, players: teamListsTable.players })
    .from(teamListsTable)
    .innerJoin(
      fixturesTable,
      and(
        eq(fixturesTable.id, teamListsTable.fixtureId),
        eq(fixturesTable.tenantId, teamListsTable.tenantId),
      ),
    )
    .where(
      and(
        eq(teamListsTable.tenantId, t.id),
        gte(
          fixturesTable.startAt,
          new Date(now.getTime() - SHIRT_NUMBER_LINEUP_LOOKBACK_DAYS * day),
        ),
        lte(fixturesTable.startAt, new Date(now.getTime() + TEAM_LIST_LOOKAHEAD_DAYS * day)),
      ),
    );
  const guids = [
    ...new Set(
      lists.flatMap((l) =>
        (l.players ?? [])
          .map((p) => normaliseParticipantId(p.participantId))
          .filter((g): g is string => !!g),
      ),
    ),
  ];
  if (guids.length === 0) return;

  const candidates = lineupCandidates(lists, await playerIdsFor(t.id, guids));
  const seasons = [...new Set(candidates.map((c) => c.season))];
  if (seasons.length === 0) return;
  const existing = await db
    .select({
      id: shirtNumbersTable.id,
      season: shirtNumbersTable.season,
      name: shirtNumbersTable.name,
      participantId: shirtNumbersTable.participantId,
      playerId: shirtNumbersTable.playerId,
      number: shirtNumbersTable.number,
    })
    .from(shirtNumbersTable)
    .where(and(eq(shirtNumbersTable.tenantId, t.id), inArray(shirtNumbersTable.season, seasons)));

  const carried = new Map<string, string>();
  for (const c of missingLineupCandidates(candidates, existing)) {
    const n = await carriedNumberFor(db, {
      tenantId: t.id,
      side: "senior",
      season: c.season,
      playerId: c.playerId,
      participantId: c.participantId,
      rolloverPolicy: t.rolloverPolicy,
    });
    if (n !== null) carried.set(carriedKey(c.season, c.participantId), n);
  }

  const plan = planLineupInserts({
    tenantId: t.id,
    candidates,
    existing,
    carried,
    duplicatePolicy: t.duplicatePolicy,
  });
  if (plan.inserts.length === 0 && plan.attaches.length === 0) return;

  for (const a of plan.attaches) {
    try {
      // Still id-less: an admin who linked the entry since the read above wins.
      const rows = await db
        .update(shirtNumbersTable)
        .set({
          participantId: a.participantId,
          ...(a.playerId !== null ? { playerId: a.playerId } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shirtNumbersTable.tenantId, t.id),
            eq(shirtNumbersTable.id, a.entryId),
            isNull(shirtNumbersTable.playerId),
            isNull(shirtNumbersTable.participantId),
          ),
        )
        .returning({ id: shirtNumbersTable.id });
      if (rows.length > 0) summary.attached++;
    } catch (err) {
      // A concurrent write took the participant or player for the season: skip this entry.
      if (!isUniqueViolation(err)) throw err;
    }
  }

  if (plan.inserts.length > 0) {
    // A row an admin or upload added since the read above wins (per-person unique indexes).
    const written = await db
      .insert(shirtNumbersTable)
      .values(plan.inserts)
      .onConflictDoNothing()
      .returning({ id: shirtNumbersTable.id });
    summary.inserted = written.length;
  }
  log(
    `tenant ${t.id}: ${summary.inserted} lineup player(s) added to the shirt-number register` +
      (summary.attached ? `, ${summary.attached} attached to name-only held entries` : ""),
  );
}

export interface HeldShirtLinkSummary {
  tenantId: number;
  linked: number;
  /** Crosswalk rows minted so an appeared participant could be linked. */
  minted: number;
  /** Appeared participants left held because they have no crosswalk row (native tenant). */
  unmapped: number;
}

/** Lowercased GUIDs among `guids` with a senior scorecard or roster row for the club in central. */
async function centralSeniorAppearances(
  clubId: number,
  guids: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (guids.length === 0) return out;
  const {
    centralDb,
    centralMatchBattingTable,
    centralMatchBowlingTable,
    centralMatchRostersTable,
  } = await import("../central");
  const { getClubMatchRows, seniorMatchRows } = await import("../central/club-matches");
  const { inList } = await import("../central/where");
  // Juniors isolation: a junior-only appearance never links a senior entry.
  const matchIds = seniorMatchRows(await getClubMatchRows(clubId)).map((m) => m.matchId);
  if (matchIds.length === 0) return out;
  const tables = [centralMatchBattingTable, centralMatchBowlingTable, centralMatchRostersTable];
  const results = await Promise.all(
    tables.map((tbl) =>
      centralDb
        .selectDistinct({ participantId: tbl.participantId })
        .from(tbl)
        .where(
          and(
            eq(tbl.clubId, clubId),
            inList(tbl.matchId, matchIds),
            inList(sql`lower(${tbl.participantId})`, guids),
          ),
        ),
    ),
  );
  for (const rows of results)
    for (const r of rows) if (r.participantId) out.add(r.participantId.toLowerCase());
  return out;
}

/**
 * The shared crosswalk mint, serialised per tenant with the same transaction-scoped
 * advisory lock as the synthetic pre-digital mint, so the two never pick the same next id.
 */
async function mintCrosswalkLocked(t: SyncTenant): Promise<number> {
  const { db } = await import("../index");
  const { mintPlayerIdMap } = await import("../provision");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MINT_LOCK_KEY}, ${t.id})`);
    return (await mintPlayerIdMap(t.id, t.centralClubId, tx)).minted;
  });
}

/**
 * Step 2 (after the central projection): link each enabled tenant's held entries whose
 * participant has played for the tenant's central club. A crosswalk tenant mints missing
 * crosswalk rows first; a native tenant ({@link heldLinkMayMint}) never mints and leaves
 * unmapped participants held. One tenant's failure is logged and reported in `errors`; the
 * remaining tenants still link.
 */
export async function linkHeldShirtNumbers(
  opts: ShirtNumberSyncOpts,
): Promise<ShirtNumberSyncResult<HeldShirtLinkSummary>> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const result: ShirtNumberSyncResult<HeldShirtLinkSummary> = { tenants: [], errors: [] };
  for (const t of await enabledTenants(opts)) {
    const summary: HeldShirtLinkSummary = { tenantId: t.id, linked: 0, minted: 0, unmapped: 0 };
    result.tenants.push(summary);
    try {
      await linkTenantHeld(t, summary, log);
    } catch (err) {
      const message = errorMessage(err);
      log(`tenant ${t.id}: shirt-number held-entry link failed: ${message}`);
      result.errors.push({ tenantId: t.id, message });
    }
  }
  return result;
}

async function linkTenantHeld(t: SyncTenant, summary: HeldShirtLinkSummary, log: Log) {
  const { db, shirtNumbersTable } = await import("../index");
  const heldRows = await db
    .select({
      id: shirtNumbersTable.id,
      tenantId: shirtNumbersTable.tenantId,
      season: shirtNumbersTable.season,
      participantId: shirtNumbersTable.participantId,
    })
    .from(shirtNumbersTable)
    .where(
      and(
        eq(shirtNumbersTable.tenantId, t.id),
        isNull(shirtNumbersTable.playerId),
        isNotNull(shirtNumbersTable.participantId),
      ),
    );
  const held = heldRows.flatMap((h) =>
    h.participantId ? [{ ...h, participantId: h.participantId }] : [],
  );
  if (held.length === 0) return;

  const guids = [...new Set(held.map((h) => normaliseParticipantId(h.participantId)!))];
  const appeared = await centralSeniorAppearances(t.centralClubId, guids);
  if (appeared.size === 0) return;

  const linkedRows = await db
    .select({ season: shirtNumbersTable.season, playerId: shirtNumbersTable.playerId })
    .from(shirtNumbersTable)
    .where(and(eq(shirtNumbersTable.tenantId, t.id), isNotNull(shirtNumbersTable.playerId)));
  const linked = linkedRows.map((l) => ({ season: l.season, playerId: l.playerId! }));

  const appearedGuids = [...appeared];
  let playerIdOf = await playerIdsFor(t.id, appearedGuids);
  let plan = planHeldLinks({ tenantId: t.id, held, appeared, playerIdOf, linked });
  if (plan.unmapped.length > 0 && heldLinkMayMint(t)) {
    summary.minted = await mintCrosswalkLocked(t);
    playerIdOf = await playerIdsFor(t.id, appearedGuids);
    plan = planHeldLinks({ tenantId: t.id, held, appeared, playerIdOf, linked });
  }
  summary.unmapped = plan.unmapped.length;
  for (const l of plan.links) {
    try {
      if (
        await linkHeldShirtNumberEntry(db, {
          tenantId: t.id,
          entryId: l.entryId,
          playerId: l.playerId,
        })
      )
        summary.linked++;
    } catch (err) {
      // A concurrent admin link took (season, player) first: skip this entry, keep going.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  log(
    `tenant ${t.id}: ${summary.linked} held shirt-number entr${summary.linked === 1 ? "y" : "ies"} linked` +
      (summary.minted ? `, ${summary.minted} crosswalk row(s) minted` : "") +
      (summary.unmapped ? `, ${summary.unmapped} left held (no crosswalk row; never minted)` : ""),
  );
}
