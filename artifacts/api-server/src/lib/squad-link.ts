import { and, eq, gt, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db, playersTable, squadMembersTable } from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { env } from "../config";
import { loadClubIdentity } from "./club-overlay";
import { logger } from "./logger";
import { norm } from "./name-match";
import {
  NATIVE_STATS_TENANT_ID,
  tenantCentralClubIdOrNull,
  tenantReadsFromCentral,
} from "./tenant";

/**
 * Squad player linking: which app player a squad member is.
 *
 * The PlayHQ participant export's `Profile ID` is not the participant GUID
 * central keys players on, and central names players "J Wyllie" (initial +
 * surname, sometimes lower-case). So beyond the exact links in
 * `squad-import.ts`, a member is matched on first initial + surname against
 * everyone who has played senior cricket for the club in central. One
 * candidate links; several (often the same person under two PlayHQ GUIDs in
 * different seasons) link only when one played strictly more recently than
 * every other.
 *
 * The same pool backs the admin's player search for manual linking. Every
 * central read goes through `@workspace/db/central-queries`; this module only
 * reads the tenant DB. Private players are in the pool — linking is
 * admin-only — and their names only ever reach admin responses.
 */

// ---------------------------------------------------------------------------
// Pure matching
// ---------------------------------------------------------------------------

/** `j|wyllie`: first letter of the given name's first token + the letters-only surname. */
export function initialSurnameKey(givenName: string, surname: string): string | null {
  const first = norm(givenName.trim().split(/\s+/)[0] ?? "");
  const sur = norm(surname);
  return first && sur ? `${first[0]}|${sur}` : null;
}

/** A member's initial keys: from the first name and, when given, the preferred name. */
export function memberInitialKeys(m: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string[] {
  const keys = new Set<string>();
  for (const given of [m.firstName, m.preferredName]) {
    const k = given ? initialSurnameKey(given, m.lastName) : null;
    if (k) keys.add(k);
  }
  return [...keys];
}

/** A central line name ("J Wyllie", "a geeraets", "T De Pedro") → its initial key. */
export function lineNameKey(name: string): string | null {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  return initialSurnameKey(tokens[0]!, tokens.slice(1).join(" "));
}

/** One person the import can link to (a crosswalk id, or an unmapped central participant). */
export interface LinkCandidate {
  /** Identity of the candidate: two participants folded into one app player share it. */
  key: string;
  /** The tenant's app player id; null when the participant has no crosswalk row. */
  playerId: number | null;
  lineNames: string[];
  /** Start year of their latest senior season for the club. */
  lastSeasonYear: number | null;
}

export type InitialIndex = Map<string, LinkCandidate[]>;

export function buildInitialIndex(candidates: readonly LinkCandidate[]): InitialIndex {
  const index: InitialIndex = new Map();
  for (const c of candidates) {
    const keys = new Set(c.lineNames.map(lineNameKey).filter((k): k is string => k !== null));
    for (const k of keys) {
      const list = index.get(k);
      if (list) list.push(c);
      else index.set(k, [c]);
    }
  }
  return index;
}

/**
 * The one candidate to link: the only one, or the one whose latest season is
 * strictly more recent than every other's. A tie, or no season to compare, is
 * no link.
 */
export function pickMostRecent(candidates: readonly LinkCandidate[]): LinkCandidate | null {
  const unique = [...new Map(candidates.map((c) => [c.key, c])).values()];
  if (unique.length === 1) return unique[0]!;
  let best: LinkCandidate | null = null;
  let tied = false;
  for (const c of unique) {
    if (c.lastSeasonYear === null) continue;
    if (best === null || c.lastSeasonYear > best.lastSeasonYear!) {
      best = c;
      tied = false;
    } else if (c.lastSeasonYear === best.lastSeasonYear) {
      tied = true;
    }
  }
  return best === null || tied ? null : best;
}

/**
 * The candidate a member's initial keys agree on, or null. A key whose
 * candidates can't be told apart, or two keys pointing at different people,
 * is no link.
 */
export function matchByInitial(
  m: { firstName: string; lastName: string; preferredName: string | null },
  index: InitialIndex,
): LinkCandidate | null {
  const picks = new Set<LinkCandidate>();
  for (const k of memberInitialKeys(m)) {
    const list = index.get(k);
    if (!list) continue;
    const pick = pickMostRecent(list);
    if (!pick) return null;
    picks.add(pick);
  }
  return picks.size === 1 ? [...picks][0]! : null;
}

/** A real club player id: positive and below the fill-in range. */
export function isLinkablePlayerId(id: number | null | undefined): id is number {
  return id != null && id > 0 && id < FILL_IN_THRESHOLD;
}

/** Case-insensitive substring match on any name, also ignoring spaces, hyphens and accents. */
export function namesMatchQuery(names: readonly string[], q: string): boolean {
  const lower = q.trim().toLowerCase();
  const letters = norm(q);
  if (!lower) return false;
  return names.some(
    (n) => n.toLowerCase().includes(lower) || (letters.length >= 2 && norm(n).includes(letters)),
  );
}

/** 2025 → "2025/26". */
export function seasonLabel(startYear: number | null): string | null {
  if (startYear === null) return null;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

/** A club player as the linking surfaces see them. */
export interface ClubPlayerGroup extends LinkCandidate {
  displayName: string | null;
  isPrivate: boolean;
}

/**
 * Everyone who has played senior cricket for the tenant's central club,
 * grouped by the app player they present as (the crosswalk with confirmed
 * merges folded, so a merged pair is one candidate). Participants without a
 * crosswalk row stay in as their own unmapped candidate: they still make a
 * name ambiguous. Empty when the tenant has no central club or central reads
 * are switched off.
 */
export async function loadCentralPlayerGroups(tenantId: number): Promise<ClubPlayerGroup[]> {
  if (env.centralReadsDisabled()) return [];
  const clubId = await tenantCentralClubIdOrNull(tenantId);
  if (clubId === null) return [];
  const { centralClubPlayerNames } = await import("@workspace/db/central-queries");
  const [rows, identity] = await Promise.all([
    centralClubPlayerNames(clubId),
    loadClubIdentity(tenantId),
  ]);

  const groups = new Map<string, ClubPlayerGroup>();
  for (const r of rows) {
    const playerId = identity.intByGuid.get(r.participantId) ?? null;
    const key = playerId !== null ? `p:${playerId}` : `g:${identity.canonicalOf(r.participantId)}`;
    const name = identity.nameFor(r.participantId, r.displayName ?? r.lineNames[0] ?? null);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        playerId,
        lineNames: [...r.lineNames],
        lastSeasonYear: r.lastSeasonYear,
        displayName: name,
        isPrivate: r.isPrivate,
      });
      continue;
    }
    g.lineNames = [...new Set([...g.lineNames, ...r.lineNames])];
    if (r.lastSeasonYear !== null && (g.lastSeasonYear ?? -1) < r.lastSeasonYear) {
      g.lastSeasonYear = r.lastSeasonYear;
    }
    g.displayName = g.displayName ?? name;
    g.isPrivate = g.isPrivate || r.isPrivate;
  }
  return [...groups.values()];
}

/**
 * The import's initial-key index. Best effort: a central outage leaves the
 * import working with its exact links only.
 */
export async function loadInitialIndex(tenantId: number): Promise<InitialIndex> {
  try {
    return buildInitialIndex(await loadCentralPlayerGroups(tenantId));
  } catch (err) {
    logger.warn({ err, tenantId }, "squad import: central name candidates unavailable");
    return new Map();
  }
}

/** Halls Head before cut-over keeps its player names in the native `players` table. */
async function usesNativePlayers(tenantId: number): Promise<boolean> {
  return tenantId === NATIVE_STATS_TENANT_ID && !(await tenantReadsFromCentral(tenantId));
}

const nativeName = (p: { givenName: string; surname: string }) =>
  `${p.givenName} ${p.surname}`.trim().replace(/\s+/g, " ");

export interface SquadPlayerSearchHit {
  playerId: number;
  displayName: string;
  lastSeason: string | null;
  alreadyLinkedTo: { memberId: number; name: string } | null;
}

/**
 * The admin's player search for manual linking: the tenant's club players
 * (never a fill-in) whose name contains `q`, most recently active first, with
 * the squad member each is already linked to.
 */
export async function searchClubPlayers(
  tenantId: number,
  q: string,
  limit = 20,
): Promise<SquadPlayerSearchHit[]> {
  const pool = new Map<number, { displayName: string; names: string[]; last: number | null }>();
  for (const g of await loadCentralPlayerGroups(tenantId)) {
    if (!isLinkablePlayerId(g.playerId)) continue;
    const names = g.displayName ? [g.displayName, ...g.lineNames] : g.lineNames;
    if (!namesMatchQuery(names, q)) continue;
    pool.set(g.playerId, {
      displayName: g.displayName ?? g.lineNames[0] ?? `Player ${g.playerId}`,
      names,
      last: g.lastSeasonYear,
    });
  }

  if (await usesNativePlayers(tenantId)) {
    const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const native = await db
      .select({
        id: playersTable.id,
        givenName: playersTable.givenName,
        surname: playersTable.surname,
      })
      .from(playersTable)
      .where(
        and(
          gt(playersTable.id, 0),
          lt(playersTable.id, FILL_IN_THRESHOLD),
          or(
            ilike(playersTable.surname, like),
            ilike(playersTable.givenName, like),
            ilike(sql`${playersTable.givenName} || ' ' || ${playersTable.surname}`, like),
          ),
        ),
      )
      .limit(200);
    for (const p of native) {
      const prev = pool.get(p.id);
      pool.set(p.id, {
        displayName: nativeName(p),
        names: [nativeName(p), ...(prev?.names ?? [])],
        last: prev?.last ?? null,
      });
    }
  }

  const hits = [...pool]
    .sort(
      ([, a], [, b]) =>
        (b.last ?? -1) - (a.last ?? -1) || a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit);
  if (hits.length === 0) return [];

  const linked = await db
    .select({
      id: squadMembersTable.id,
      linkedPlayerId: squadMembersTable.linkedPlayerId,
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
    })
    .from(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.tenantId, tenantId),
        inArray(
          squadMembersTable.linkedPlayerId,
          hits.map(([id]) => id),
        ),
      ),
    );
  const memberFor = new Map(linked.map((m) => [m.linkedPlayerId!, m]));

  return hits.map(([playerId, p]) => {
    const m = memberFor.get(playerId);
    return {
      playerId,
      displayName: p.displayName,
      lastSeason: seasonLabel(p.last),
      alreadyLinkedTo: m
        ? { memberId: m.id, name: `${m.preferredName || m.firstName} ${m.lastName}` }
        : null,
    };
  });
}

/**
 * Display names for linked player ids (the squad list and drawer). Best
 * effort: ids it can't name, or a central outage, come back without a name.
 */
export async function linkedPlayerNames(
  tenantId: number,
  ids: readonly number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const wanted = new Set(ids.filter(isLinkablePlayerId));
  if (wanted.size === 0) return out;
  try {
    for (const g of await loadCentralPlayerGroups(tenantId)) {
      if (g.playerId !== null && wanted.has(g.playerId) && g.displayName) {
        out.set(g.playerId, g.displayName);
      }
    }
    if (await usesNativePlayers(tenantId)) {
      const native = await db
        .select({
          id: playersTable.id,
          givenName: playersTable.givenName,
          surname: playersTable.surname,
        })
        .from(playersTable)
        .where(inArray(playersTable.id, [...wanted]));
      for (const p of native) out.set(p.id, nativeName(p));
    }
  } catch (err) {
    logger.warn({ err, tenantId }, "squad: linked player names unavailable");
  }
  return out;
}
