import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  availabilitySettingsTable,
  db,
  fixturesTable,
  squadMembersTable,
  teamListsTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { env } from "../config";
import { fixtureSection, normaliseName, perthDayStart } from "./availability-grades";
import { loadClubIdentity } from "./club-overlay";
import { logger as defaultLogger } from "./logger";
import { initialSurnameKey, isInitialOnly, isLinkablePlayerId } from "./squad-link";
import { tenantCentralClubIdOrNull } from "./tenant";

/**
 * The squad register from this season's games: everyone who has played (or
 * been named) for the club in a SENIOR fixture or match of the current
 * cricket season becomes an active member, so a club can run availability
 * without first uploading the PlayHQ participant export. Members created here
 * have no contacts and no PlayHQ profile id; a later participant import adopts
 * them (`squad-import.ts`) instead of adding them twice.
 *
 * Sources, best name first:
 *   1. the club's published team lists on this season's senior fixtures
 *      (PlayHQ lineups carry the full name, e.g. "Jack Wyllie"; admin and
 *      Selection Hub lists carry what was typed or picked);
 *   2. central's senior matches for the club this season: the curated name,
 *      else `central.players.display_name` ("Wyllie, Jack" for PlayHQ-loaded
 *      players, filled from `playhq.players`), else the scorecard line name
 *      ("J Wyllie").
 * The fullest name wins. A player central only knows by initial is still
 * added under that name ("J" / "Wyllie"): a Hub member with an initial beats
 * no member, and the participant import renames them when it adopts them.
 *
 * Juniors isolation: only senior grades are read (`fixtureSection` /
 * `appGradeFromCentral`), never a `junior_*` table. Fill-ins (>= 90000) are
 * never added or linked. Existing members are never modified.
 */

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/** The current cricket season (1 July to 30 June, Perth) as dates and instants. */
export function seasonWindow(now: Date): {
  startYear: number;
  /** `YYYY-07-01`, inclusive. */
  from: string;
  /** The next `YYYY-07-01`, exclusive. */
  to: string;
  fromAt: Date;
  toAt: Date;
} {
  const startYear = seasonStartYearFor(now);
  const from = `${startYear}-07-01`;
  const to = `${startYear + 1}-07-01`;
  return { startYear, from, to, fromAt: perthDayStart(from), toAt: perthDayStart(to) };
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s'-])(\p{Ll})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/**
 * A person's name as first + last: "Surname, Firstname" (central's display
 * name), else "First [Middle] Last" (first token, then the rest). An
 * all-lower-case name ("a geeraets") is title-cased. Null for one word.
 */
export function splitPersonName(
  raw: string | null | undefined,
): { firstName: string; lastName: string } | null {
  let s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s === s.toLowerCase()) s = titleCase(s);
  const comma = s.indexOf(",");
  if (comma >= 0) {
    const lastName = s.slice(0, comma).trim();
    const firstName = s.slice(comma + 1).trim();
    return firstName && lastName ? { firstName, lastName } : null;
  }
  const tokens = s.split(" ");
  if (tokens.length < 2) return null;
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(" ") };
}

/** Where a name came from; lower is preferred among names of the same fullness. */
export const NAME_RANK = {
  teamList: 0,
  curated: 1,
  centralDisplay: 2,
  centralLine: 3,
} as const;

/** One sighting of a player in a season source. */
export interface SeasonAppearance {
  /** The tenant's app player id, when known. */
  playerId: number | null;
  /** PlayHQ participant GUID, when known. */
  participantId: string | null;
  names: Array<{ name: string; rank: number }>;
  grade: string | null;
  /** When they played, for "most recent grade": an ISO date or instant. */
  at: string;
  isPrivate: boolean;
}

/** A person to add, merged across sources. */
export interface SeasonPlayer {
  firstName: string;
  lastName: string;
  playerId: number | null;
  gradeHint: string | null;
  isPrivate: boolean;
}

const fullKey = (first: string, last: string) => `${normaliseName(first)}|${normaliseName(last)}`;

/** The fullest name: a whole given name beats an initial, then the source rank. */
export function pickName(
  names: ReadonlyArray<{ name: string; rank: number }>,
): { firstName: string; lastName: string } | null {
  let best: { firstName: string; lastName: string; score: number } | null = null;
  for (const n of names) {
    const split = splitPersonName(n.name);
    if (!split) continue;
    const score = (isInitialOnly(split.firstName) ? 100 : 0) + n.rank;
    if (!best || score < best.score) best = { ...split, score };
  }
  return best ? { firstName: best.firstName, lastName: best.lastName } : null;
}

/**
 * Merge appearances into distinct people: one person per app player id or
 * participant GUID (an appearance carrying both joins them), and a name-only
 * appearance (an admin's typed name) folds into the one person with that full
 * name. A person seen as a fill-in, or with no usable name, is skipped.
 * Grade is the most recent appearance's.
 */
export function collectSeasonPlayers(appearances: readonly SeasonAppearance[]): {
  players: SeasonPlayer[];
  skipped: number;
} {
  type Acc = {
    playerId: number | null;
    names: Array<{ name: string; rank: number }>;
    grade: string | null;
    at: string;
    isPrivate: boolean;
    fillIn: boolean;
  };
  const byKey = new Map<string, Acc>();
  const nameOnly: Acc[] = [];
  const newestFirst = [...appearances].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  for (const a of newestFirst) {
    const fillIn = a.playerId != null && a.playerId >= FILL_IN_THRESHOLD;
    const playerId = isLinkablePlayerId(a.playerId) ? a.playerId : null;
    const keys = [
      ...(playerId != null ? [`p:${playerId}`] : []),
      ...(a.participantId ? [`g:${a.participantId.toLowerCase()}`] : []),
    ];
    const found = [...new Set(keys.map((k) => byKey.get(k)).filter((x): x is Acc => !!x))];
    let acc: Acc;
    if (found.length === 0) {
      acc = { playerId, names: [], grade: a.grade, at: a.at, isPrivate: false, fillIn: false };
      if (keys.length === 0) nameOnly.push(acc);
    } else {
      acc = found[0]!;
      // One appearance tied two people together (an id and a GUID): merge them.
      for (const other of found.slice(1)) {
        acc.names.push(...other.names);
        acc.isPrivate ||= other.isPrivate;
        acc.fillIn ||= other.fillIn;
        acc.playerId ??= other.playerId;
        if (other.at > acc.at) [acc.at, acc.grade] = [other.at, other.grade];
        for (const [k, v] of byKey) if (v === other) byKey.set(k, acc);
      }
    }
    acc.playerId ??= playerId;
    acc.names.push(...a.names);
    acc.isPrivate ||= a.isPrivate;
    acc.fillIn ||= fillIn;
    for (const k of keys) byKey.set(k, acc);
  }

  const identified = [...new Set(byKey.values())];
  // Full name → the identified people going by it.
  const byFullName = new Map<string, Acc[]>();
  for (const acc of identified) {
    const n = pickName(acc.names);
    if (!n) continue;
    const k = fullKey(n.firstName, n.lastName);
    byFullName.set(k, [...(byFullName.get(k) ?? []), acc]);
  }
  const people = [...identified];
  const nameOnlyByKey = new Map<string, Acc>();
  for (const acc of nameOnly) {
    const n = pickName(acc.names);
    const k = n ? fullKey(n.firstName, n.lastName) : null;
    const match = k ? byFullName.get(k) : undefined;
    if (k && match?.length === 1) {
      match[0]!.names.push(...acc.names);
      match[0]!.fillIn ||= acc.fillIn;
      continue;
    }
    if (k && nameOnlyByKey.has(k)) {
      nameOnlyByKey.get(k)!.fillIn ||= acc.fillIn;
      continue;
    }
    if (k) nameOnlyByKey.set(k, acc);
    people.push(acc);
  }

  const players: SeasonPlayer[] = [];
  let skipped = 0;
  for (const acc of people) {
    const n = pickName(acc.names);
    if (acc.fillIn || !n) {
      skipped++;
      continue;
    }
    players.push({
      firstName: n.firstName,
      lastName: n.lastName,
      playerId: acc.playerId,
      gradeHint: acc.grade,
      isPrivate: acc.isPrivate,
    });
  }
  return { players, skipped };
}

/** The register fields the duplicate check reads. */
export type ExistingMember = {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  linkedPlayerId: number | null;
};

/**
 * Who is new. A season player is already in the register when a member is
 * linked to their app player, else when a member has their full name (first
 * or preferred name + last name), else when exactly one member shares their
 * first initial + surname and one of the two names is only an initial (so
 * "J Wyllie" finds Jack Wyllie, but Jack Smith never swallows James Smith).
 */
export function planSeasonSeed(
  players: readonly SeasonPlayer[],
  existing: readonly ExistingMember[],
): { toAdd: SeasonPlayer[]; alreadyPresent: number } {
  const linked = new Set(existing.map((m) => m.linkedPlayerId).filter(isLinkablePlayerId));
  const names = new Set<string>();
  const byInitial = new Map<string, ExistingMember[]>();
  for (const m of existing) {
    for (const given of [m.firstName, m.preferredName]) {
      if (!given?.trim()) continue;
      names.add(fullKey(given, m.lastName));
      const k = initialSurnameKey(given, m.lastName);
      if (k) {
        const list = byInitial.get(k) ?? [];
        if (!list.includes(m)) list.push(m);
        byInitial.set(k, list);
      }
    }
  }

  const toAdd: SeasonPlayer[] = [];
  let alreadyPresent = 0;
  for (const p of players) {
    if (p.playerId != null && linked.has(p.playerId)) {
      alreadyPresent++;
      continue;
    }
    if (names.has(fullKey(p.firstName, p.lastName))) {
      alreadyPresent++;
      continue;
    }
    const k = initialSurnameKey(p.firstName, p.lastName);
    const same = k ? (byInitial.get(k) ?? []) : [];
    if (
      same.length === 1 &&
      (isInitialOnly(p.firstName) ||
        [same[0]!.firstName, same[0]!.preferredName].some((g) => !!g && isInitialOnly(g)))
    ) {
      alreadyPresent++;
      continue;
    }
    toAdd.push(p);
  }
  return { toAdd, alreadyPresent };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** The club's published team lists on this season's senior fixtures. */
async function teamListAppearances(
  tenantId: number,
  window: ReturnType<typeof seasonWindow>,
): Promise<SeasonAppearance[]> {
  const rows = await db
    .select({
      grade: fixturesTable.grade,
      startAt: fixturesTable.startAt,
      players: teamListsTable.players,
    })
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
        eq(teamListsTable.tenantId, tenantId),
        eq(teamListsTable.isPublished, true),
        gte(fixturesTable.startAt, window.fromAt),
        lt(fixturesTable.startAt, window.toAt),
      ),
    );
  const out: SeasonAppearance[] = [];
  for (const r of rows) {
    if (fixtureSection(r.grade) !== "senior") continue;
    for (const p of r.players ?? []) {
      const name = p.displayName?.trim();
      out.push({
        playerId: p.playerId ?? null,
        participantId: p.participantId ?? null,
        names: name ? [{ name, rank: NAME_RANK.teamList }] : [],
        grade: r.grade,
        at: r.startAt.toISOString(),
        isPrivate: false,
      });
    }
  }
  return out;
}

/** Central's senior matches for the club this season. Empty when central is off or unlinked. */
async function centralAppearances(
  tenantId: number,
  window: ReturnType<typeof seasonWindow>,
): Promise<SeasonAppearance[]> {
  if (env.centralReadsDisabled()) return [];
  const clubId = await tenantCentralClubIdOrNull(tenantId);
  if (clubId === null) return [];
  const { centralClubSeasonPlayers, isSeniorAppGrade } =
    await import("@workspace/db/central-queries");
  const [rows, identity] = await Promise.all([
    centralClubSeasonPlayers(clubId, window.from, window.to),
    loadClubIdentity(tenantId),
  ]);
  const out: SeasonAppearance[] = [];
  for (const r of rows) {
    if (!isSeniorAppGrade(r.lastGrade)) continue;
    const curated = identity.nameFor(r.participantId, null);
    out.push({
      playerId: identity.intByGuid.get(r.participantId) ?? null,
      participantId: r.participantId,
      names: [
        ...(curated ? [{ name: curated, rank: NAME_RANK.curated }] : []),
        ...(r.displayName ? [{ name: r.displayName, rank: NAME_RANK.centralDisplay }] : []),
        ...r.lineNames.map((name) => ({ name, rank: NAME_RANK.centralLine })),
      ],
      grade: r.lastGrade,
      at: r.lastMatchDate ?? window.from,
      isPrivate: r.isPrivate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export type SeasonSeedResult = {
  /** Members added. */
  added: number;
  /** People left out: fill-ins, or no usable name. */
  skipped: number;
  /** People already in the register. */
  alreadyPresent: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialise seeds for one tenant (the admin button and the hourly sweep) with
 * the participant import and manual additions, which take the same lock.
 */
async function lockTenantSeed(tx: Tx, tenantId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(72401, ${tenantId})`);
}

async function stampSeeded(tx: Tx, tenantId: number, now: Date): Promise<void> {
  await tx
    .insert(availabilitySettingsTable)
    .values({ tenantId, seasonSeededAt: now })
    .onConflictDoUpdate({
      target: availabilitySettingsTable.tenantId,
      set: { seasonSeededAt: now },
    });
}

async function collectForTenant(tenantId: number, now: Date) {
  const window = seasonWindow(now);
  const [lists, central] = await Promise.all([
    teamListAppearances(tenantId, window),
    centralAppearances(tenantId, window),
  ]);
  return collectSeasonPlayers([...lists, ...central]);
}

async function insertNew(
  tx: Tx,
  tenantId: number,
  collected: { players: SeasonPlayer[]; skipped: number },
): Promise<SeasonSeedResult> {
  const existing = await tx
    .select({
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
      linkedPlayerId: squadMembersTable.linkedPlayerId,
    })
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId));
  const { toAdd, alreadyPresent } = planSeasonSeed(collected.players, existing);
  if (toAdd.length > 0) {
    await tx.insert(squadMembersTable).values(
      toAdd.map((p) => ({
        tenantId,
        firstName: p.firstName,
        lastName: p.lastName,
        section: "senior" as const,
        active: true,
        gradeHint: p.gradeHint,
        isPrivate: p.isPrivate,
        linkedPlayerId: p.playerId,
      })),
    );
  }
  return { added: toAdd.length, skipped: collected.skipped, alreadyPresent };
}

/**
 * Add everyone who has played for the club this season and isn't in the
 * register yet. Idempotent: a re-run adds no one twice. Existing members are
 * never touched.
 */
export async function seedSquadFromSeason(
  tenantId: number,
  now: Date = new Date(),
): Promise<SeasonSeedResult> {
  const collected = await collectForTenant(tenantId, now);
  return db.transaction(async (tx: Tx) => {
    await lockTenantSeed(tx, tenantId);
    const result = await insertNew(tx, tenantId, collected);
    if (result.added > 0) await stampSeeded(tx, tenantId, now);
    return result;
  });
}

/**
 * The automatic seed: once per club, only while its register is empty and it
 * has never been seeded (`availability_settings.season_seeded_at`). The
 * marker is set only when someone was added, so a club with no games yet is
 * tried again next hour, and a club that later empties its register is not
 * re-filled. Best effort: never throws. Null when it did not run.
 */
export async function autoSeedSquadIfEmpty(
  tenantId: number,
  now: Date = new Date(),
  logger: Pick<typeof defaultLogger, "info" | "warn"> = defaultLogger,
): Promise<SeasonSeedResult | null> {
  try {
    const due = async (reader: Pick<typeof db, "select">) => {
      const [settings] = await reader
        .select({ seededAt: availabilitySettingsTable.seasonSeededAt })
        .from(availabilitySettingsTable)
        .where(eq(availabilitySettingsTable.tenantId, tenantId));
      if (settings?.seededAt) return false;
      const [member] = await reader
        .select({ id: squadMembersTable.id })
        .from(squadMembersTable)
        .where(eq(squadMembersTable.tenantId, tenantId))
        .limit(1);
      return !member;
    };
    if (!(await due(db))) return null;
    const collected = await collectForTenant(tenantId, now);
    if (collected.players.length === 0) return null;
    const result = await db.transaction(async (tx: Tx) => {
      await lockTenantSeed(tx, tenantId);
      if (!(await due(tx))) return null;
      const r = await insertNew(tx, tenantId, collected);
      if (r.added > 0) await stampSeeded(tx, tenantId, now);
      return r;
    });
    if (result?.added) logger.info({ tenantId, ...result }, "squad seeded from this season");
    return result;
  } catch (err) {
    logger.warn({ err, tenantId }, "squad season seed failed");
    return null;
  }
}
