import { and, asc, count, eq, inArray, isNull, min, or, sql } from "drizzle-orm";
import {
  db,
  awardBallotsTable,
  awardVotingConfigTable,
  awardWinnersTable,
  awardsTable,
  capRegisterTable,
  centuriesTable,
  clubCorrectionsTable,
  clubHistoryRowsTable,
  clubPhotoPlayersTable,
  clubRolesTable,
  fiveWicketHaulsTable,
  honourBoardOverridesTable,
  isSyntheticParticipantKey,
  lifeMembersTable,
  playerCurationTable,
  playerIdMapTable,
  playerImagesTable,
  premiershipPlayersTable,
  shirtNumbersTable,
  teamOfDecadeMembersTable,
  type MergeStatus,
} from "@workspace/db";

/**
 * Identity drift (hybrid stats plan U17; R9, R10, R16; KTD2, KTD7).
 *
 * A club's layer names central players by PlayHQ participant GUID: the
 * crosswalk (`player_id_map`) maps each GUID to the club's player id, and
 * `player_curation` renames GUIDs and merges duplicates into a keeper. Central
 * usually keeps GUIDs stable across reloads; when it doesn't, a stored GUID
 * points at nobody — the player's awards, caps, photos and corrections still
 * hang off the old link, and their central career shows under a new id (or
 * not at all).
 *
 * This is the ONE implementation of the check, used by the read-only script
 * (scripts/src/check-identity-drift.ts, run after each central reload) and by
 * the admin endpoint (GET /club-identity-drift, shown as "Broken links" on the
 * corrections screen), so the two can't disagree. It never writes — not to the
 * tenant database and never to central.
 *
 * A GUID has drifted when it no longer has ANY line for the tenant's central
 * club (roster, batting, bowling or fielding). Synthetic `club:<uuid>` keys
 * (pre-digital players, never in central) and rejected merges are ignored.
 */

export interface DriftCrosswalkRow {
  participantId: string;
  playerId: number;
}

export interface DriftCurationRow {
  participantId: string;
  overrideDisplayName: string | null;
  mergedIntoParticipantId: string | null;
  mergeStatus: MergeStatus | null;
}

/** A curated row that links a player, by tenant-space id and/or by GUID. */
export interface DriftCuratedRef {
  table: string;
  rowId: number;
  label: string;
  playerId: number | null;
  participantId?: string | null;
  /** The person's name as the curated row itself records it, when it has one. */
  personName?: string | null;
}

export interface DriftCorrectionRef {
  id: number;
  participantId: string;
  playhqMatchId: string;
  field: string;
}

export interface IdentityDriftInput {
  crosswalk: readonly DriftCrosswalkRow[];
  curation: readonly DriftCurationRow[];
  /** GUIDs with a line for the tenant's central club right now. */
  present: ReadonlySet<string>;
  /** `central.players` rows that still exist for the GUIDs involved. */
  centralNames: ReadonlyMap<string, { displayName: string | null; isPrivate: boolean }>;
  curated: readonly DriftCuratedRef[];
  /** The tenant's corrections in force. */
  corrections: readonly DriftCorrectionRef[];
}

/**
 * keeper — a GUID the club shows as a player in its own right (a crosswalk
 * row, a merge target or a rename); merged_away — a duplicate GUID merged
 * (confirmed or suggested) into another.
 */
export type IdentityDriftKind = "keeper" | "merged_away";

export interface IdentityDriftItem {
  participantId: string;
  kind: IdentityDriftKind;
  /** The club's player id for this GUID (null without a crosswalk row). */
  playerId: number | null;
  /** The club's rename, else central's name, else a dependent row's own name. */
  displayName: string | null;
  /** Still a row in `central.players`, just with no line for this club. */
  stillInCentral: boolean;
  mergedIntoParticipantId: string | null;
  mergedIntoDisplayName: string | null;
  mergeStatus: MergeStatus | null;
  /** GUIDs merged into this one. */
  mergedFrom: string[];
  curatedRows: { table: string; rowId: number; label: string }[];
  corrections: { id: number; playhqMatchId: string; field: string }[];
}

const isCentralGuid = (id: string | null | undefined): id is string =>
  !!id && !isSyntheticParticipantKey(id);

/** A curation row that still means something (a rejected merge never folds). */
const inForce = (c: DriftCurationRow): boolean => c.mergeStatus !== "rejected";

/** The stored GUIDs that no longer appear for the club, in first-seen order. */
export function driftCandidates(
  crosswalk: readonly DriftCrosswalkRow[],
  curation: readonly DriftCurationRow[],
  present: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  const check = (id: string | null) => {
    if (isCentralGuid(id) && !present.has(id)) out.add(id);
  };
  for (const r of crosswalk) check(r.participantId);
  for (const c of curation) {
    if (!inForce(c)) continue;
    check(c.participantId);
    check(c.mergedIntoParticipantId);
  }
  return [...out];
}

/** Pure: the drift items for one tenant, most-depended-on first. */
export function computeIdentityDrift(input: IdentityDriftInput): IdentityDriftItem[] {
  const { crosswalk, curation, present, centralNames, curated, corrections } = input;
  const missing = driftCandidates(crosswalk, curation, present);
  if (missing.length === 0) return [];

  const playerIdByGuid = new Map(crosswalk.map((r) => [r.participantId, r.playerId]));
  const curationByGuid = new Map(curation.filter(inForce).map((c) => [c.participantId, c]));
  const mergedFrom = new Map<string, string[]>();
  for (const c of curation) {
    if (!inForce(c) || !c.mergedIntoParticipantId) continue;
    const arr = mergedFrom.get(c.mergedIntoParticipantId) ?? [];
    arr.push(c.participantId);
    mergedFrom.set(c.mergedIntoParticipantId, arr);
  }
  const nameOf = (guid: string): string | null =>
    curationByGuid.get(guid)?.overrideDisplayName ?? centralNames.get(guid)?.displayName ?? null;

  const items = missing.map((guid): IdentityDriftItem => {
    const playerId = playerIdByGuid.get(guid) ?? null;
    const cur = curationByGuid.get(guid);
    const mergedInto = cur?.mergedIntoParticipantId ?? null;
    const refs = curated.filter(
      (r) => (playerId !== null && r.playerId === playerId) || r.participantId === guid,
    );
    return {
      participantId: guid,
      kind: mergedInto ? "merged_away" : "keeper",
      playerId,
      displayName: nameOf(guid) ?? refs.find((r) => r.personName)?.personName ?? null,
      stillInCentral: centralNames.has(guid),
      mergedIntoParticipantId: mergedInto,
      mergedIntoDisplayName: mergedInto ? nameOf(mergedInto) : null,
      mergeStatus: mergedInto ? (cur?.mergeStatus ?? null) : null,
      mergedFrom: [...(mergedFrom.get(guid) ?? [])].sort(),
      curatedRows: refs.map((r) => ({ table: r.table, rowId: r.rowId, label: r.label })),
      corrections: corrections
        .filter((c) => c.participantId === guid)
        .map((c) => ({ id: c.id, playhqMatchId: c.playhqMatchId, field: c.field })),
    };
  });

  const weight = (i: IdentityDriftItem) => i.curatedRows.length + i.corrections.length;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => weight(b.item) - weight(a.item) || a.index - b.index)
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------
// Loading (tenant DB: SELECT only; central: the read-only barrel)
// ---------------------------------------------------------------------------

/**
 * Anything that can run the tenant-DB selects: the app pool (`db`, the API's
 * default) or the script's READ ONLY transaction.
 */
export type DriftReader = Pick<typeof db, "select">;

export interface IdentityDriftResult {
  items: IdentityDriftItem[];
  checked: {
    /** Crosswalk rows keyed by a central GUID. */
    crosswalkGuids: number;
    /** Crosswalk rows keyed by a synthetic `club:<uuid>` (never checked). */
    syntheticKeys: number;
    /** Curation rows in force (renames, suggested and confirmed merges). */
    curationRows: number;
    /** Participants with a line for the club in central right now. */
    centralParticipants: number;
  };
  /**
   * Central has NO participant at all for the club while the club has stored
   * GUIDs: central is empty or mid-reload, not drifted. Nothing is reported.
   */
  centralEmpty: boolean;
}

/**
 * Every curated row that hangs off one of `playerIds` (or, for premiership
 * team lists and season shirt numbers, one of `guids`). Sequential on purpose: the script's reader is a
 * single transaction client.
 */
async function loadCuratedRefs(
  reader: DriftReader,
  tenantId: number,
  playerIds: readonly number[],
  guids: readonly string[],
): Promise<DriftCuratedRef[]> {
  const refs: DriftCuratedRef[] = [];
  const ids = [...playerIds];
  const take = (
    table: string,
    rows: Array<{
      rowId: number;
      playerId: number | null;
      label: string | null;
      personName?: string | null;
      participantId?: string | null;
    }>,
  ) => {
    for (const r of rows) refs.push({ ...r, table, label: r.label ?? "" });
  };

  // Premiership team lists link by player id OR straight by GUID.
  take(
    "premiership_players",
    await reader
      .select({
        rowId: premiershipPlayersTable.id,
        playerId: premiershipPlayersTable.playerId,
        participantId: premiershipPlayersTable.participantId,
        label: premiershipPlayersTable.name,
        personName: premiershipPlayersTable.name,
      })
      .from(premiershipPlayersTable)
      .where(
        and(
          eq(premiershipPlayersTable.tenantId, tenantId),
          or(
            ids.length ? inArray(premiershipPlayersTable.playerId, ids) : undefined,
            inArray(premiershipPlayersTable.participantId, [...guids]),
          ),
        ),
      ),
  );
  // Season shirt numbers likewise: a held entry carries only the GUID.
  take(
    "shirt_numbers",
    await reader
      .select({
        rowId: shirtNumbersTable.id,
        playerId: shirtNumbersTable.playerId,
        participantId: shirtNumbersTable.participantId,
        label: sql<string>`'shirt ' || coalesce('#' || ${shirtNumbersTable.number}, '(unnumbered)') || ' ' || ${shirtNumbersTable.season}`,
        personName: shirtNumbersTable.name,
      })
      .from(shirtNumbersTable)
      .where(
        and(
          eq(shirtNumbersTable.tenantId, tenantId),
          or(
            ids.length ? inArray(shirtNumbersTable.playerId, ids) : undefined,
            inArray(shirtNumbersTable.participantId, [...guids]),
          ),
        ),
      ),
  );
  if (ids.length === 0) return refs;

  take(
    "award_winners",
    await reader
      .select({
        rowId: awardWinnersTable.id,
        playerId: awardWinnersTable.playerId,
        label: sql<string>`${awardsTable.title} || ' (' || ${awardWinnersTable.season} || ')'`,
        personName: awardWinnersTable.name,
      })
      .from(awardWinnersTable)
      .innerJoin(awardsTable, eq(awardsTable.id, awardWinnersTable.awardId))
      .where(
        and(eq(awardWinnersTable.tenantId, tenantId), inArray(awardWinnersTable.playerId, ids)),
      ),
  );
  // Ballots are tenant-scoped through their award.
  const ballots = await reader
    .select({
      rowId: awardBallotsTable.id,
      pick1: awardBallotsTable.pick1PlayerId,
      pick2: awardBallotsTable.pick2PlayerId,
      pick3: awardBallotsTable.pick3PlayerId,
      label: sql<string>`${awardsTable.title} || ' ' || ${awardVotingConfigTable.season} || ' ' || ${awardBallotsTable.grade} || ' round ' || ${awardBallotsTable.round}`,
    })
    .from(awardBallotsTable)
    .innerJoin(awardVotingConfigTable, eq(awardVotingConfigTable.id, awardBallotsTable.configId))
    .innerJoin(awardsTable, eq(awardsTable.id, awardVotingConfigTable.awardId))
    .where(
      and(
        eq(awardsTable.tenantId, tenantId),
        or(
          inArray(awardBallotsTable.pick1PlayerId, ids),
          inArray(awardBallotsTable.pick2PlayerId, ids),
          inArray(awardBallotsTable.pick3PlayerId, ids),
        ),
      ),
    );
  const wanted = new Set(ids);
  for (const b of ballots) {
    for (const playerId of new Set([b.pick1, b.pick2, b.pick3])) {
      if (wanted.has(playerId)) take("award_ballots", [{ ...b, playerId }]);
    }
  }
  take(
    "cap_register",
    await reader
      .select({
        rowId: capRegisterTable.id,
        playerId: capRegisterTable.playerId,
        label: sql<string>`${capRegisterTable.category} || ' cap #' || ${capRegisterTable.capNumber}`,
        personName: capRegisterTable.name,
      })
      .from(capRegisterTable)
      .where(and(eq(capRegisterTable.tenantId, tenantId), inArray(capRegisterTable.playerId, ids))),
  );
  take(
    "player_images",
    await reader
      .select({
        rowId: playerImagesTable.id,
        playerId: playerImagesTable.playerId,
        label: sql<string>`'profile photo'`,
      })
      .from(playerImagesTable)
      .where(
        and(eq(playerImagesTable.tenantId, tenantId), inArray(playerImagesTable.playerId, ids)),
      ),
  );
  take(
    "club_photo_players",
    await reader
      .select({
        rowId: clubPhotoPlayersTable.id,
        playerId: clubPhotoPlayersTable.playerId,
        label: sql<string>`'photo ' || ${clubPhotoPlayersTable.photoId}`,
      })
      .from(clubPhotoPlayersTable)
      .where(
        and(
          eq(clubPhotoPlayersTable.tenantId, tenantId),
          inArray(clubPhotoPlayersTable.playerId, ids),
        ),
      ),
  );
  take(
    "team_of_decade_members",
    await reader
      .select({
        rowId: teamOfDecadeMembersTable.id,
        playerId: teamOfDecadeMembersTable.playerId,
        label: teamOfDecadeMembersTable.name,
        personName: teamOfDecadeMembersTable.name,
      })
      .from(teamOfDecadeMembersTable)
      .where(
        and(
          eq(teamOfDecadeMembersTable.tenantId, tenantId),
          inArray(teamOfDecadeMembersTable.playerId, ids),
        ),
      ),
  );
  take(
    "life_members",
    await reader
      .select({
        rowId: lifeMembersTable.id,
        playerId: lifeMembersTable.playerId,
        label: sql<string>`${lifeMembersTable.name} || ' (' || ${lifeMembersTable.inductionYear} || ')'`,
        personName: lifeMembersTable.name,
      })
      .from(lifeMembersTable)
      .where(and(eq(lifeMembersTable.tenantId, tenantId), inArray(lifeMembersTable.playerId, ids))),
  );
  take(
    "club_roles",
    await reader
      .select({
        rowId: clubRolesTable.id,
        playerId: clubRolesTable.playerId,
        label: sql<string>`${clubRolesTable.role} || ' ' || ${clubRolesTable.season}`,
        personName: clubRolesTable.name,
      })
      .from(clubRolesTable)
      .where(and(eq(clubRolesTable.tenantId, tenantId), inArray(clubRolesTable.playerId, ids))),
  );
  take(
    "honour_board_overrides",
    await reader
      .select({
        rowId: honourBoardOverridesTable.id,
        playerId: honourBoardOverridesTable.playerId,
        label: honourBoardOverridesTable.boardKey,
      })
      .from(honourBoardOverridesTable)
      .where(
        and(
          eq(honourBoardOverridesTable.tenantId, tenantId),
          inArray(honourBoardOverridesTable.playerId, ids),
        ),
      ),
  );
  take(
    "centuries",
    await reader
      .select({
        rowId: centuriesTable.id,
        playerId: centuriesTable.playerId,
        label: sql<string>`${centuriesTable.grade} || coalesce(' ' || ${centuriesTable.season}, '') || coalesce(' — ' || ${centuriesTable.score}, '')`,
        personName: centuriesTable.batsman,
      })
      .from(centuriesTable)
      .where(and(eq(centuriesTable.tenantId, tenantId), inArray(centuriesTable.playerId, ids))),
  );
  take(
    "five_wicket_hauls",
    await reader
      .select({
        rowId: fiveWicketHaulsTable.id,
        playerId: fiveWicketHaulsTable.playerId,
        label: sql<string>`${fiveWicketHaulsTable.grade} || coalesce(' ' || ${fiveWicketHaulsTable.season}, '')`,
        personName: fiveWicketHaulsTable.bowler,
      })
      .from(fiveWicketHaulsTable)
      .where(
        and(
          eq(fiveWicketHaulsTable.tenantId, tenantId),
          inArray(fiveWicketHaulsTable.playerId, ids),
        ),
      ),
  );
  // Club history is many rows per player: one line per player, with the count.
  const history = await reader
    .select({
      rowId: min(clubHistoryRowsTable.id),
      playerId: clubHistoryRowsTable.playerId,
      rows: count(),
    })
    .from(clubHistoryRowsTable)
    .where(
      and(eq(clubHistoryRowsTable.tenantId, tenantId), inArray(clubHistoryRowsTable.playerId, ids)),
    )
    .groupBy(clubHistoryRowsTable.playerId);
  take(
    "club_history_rows",
    history.map((h) => ({
      rowId: Number(h.rowId),
      playerId: h.playerId,
      label: `${Number(h.rows)} club history ${Number(h.rows) === 1 ? "row" : "rows"}`,
    })),
  );
  return refs;
}

/**
 * Load and compute one tenant's identity drift against its central club.
 * Tenant-scoped throughout: every tenant-DB read filters on `tenantId`, and
 * central is read for `clubId` only. Reads only; the dependent rows are only
 * fetched when something has actually drifted (the usual answer is nothing).
 */
export async function loadIdentityDrift(
  tenantId: number,
  clubId: number,
  reader: DriftReader = db,
): Promise<IdentityDriftResult> {
  const central = await import("@workspace/db/central-queries");
  const crosswalk = await reader
    .select({
      participantId: playerIdMapTable.participantId,
      playerId: playerIdMapTable.playerId,
    })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId))
    .orderBy(asc(playerIdMapTable.playerId));
  const curationAll = await reader
    .select({
      participantId: playerCurationTable.participantId,
      overrideDisplayName: playerCurationTable.overrideDisplayName,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
      mergeStatus: playerCurationTable.mergeStatus,
    })
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId))
    .orderBy(asc(playerCurationTable.participantId));
  const curation = curationAll.filter(inForce);
  const present = await central.centralClubParticipantIdsNow(clubId);

  const syntheticKeys = crosswalk.filter((r) => !isCentralGuid(r.participantId)).length;
  const checked = {
    crosswalkGuids: crosswalk.length - syntheticKeys,
    syntheticKeys,
    curationRows: curation.length,
    centralParticipants: present.size,
  };
  const missing = driftCandidates(crosswalk, curation, present);
  if (missing.length === 0) return { items: [], checked, centralEmpty: false };
  if (present.size === 0) return { items: [], checked, centralEmpty: true };

  const missingSet = new Set(missing);
  const playerIds = crosswalk.filter((r) => missingSet.has(r.participantId)).map((r) => r.playerId);
  const mergeTargets = curation
    .filter((c) => missingSet.has(c.participantId) && isCentralGuid(c.mergedIntoParticipantId))
    .map((c) => c.mergedIntoParticipantId!);
  const curated = await loadCuratedRefs(reader, tenantId, playerIds, missing);
  const corrections = await reader
    .select({
      id: clubCorrectionsTable.id,
      participantId: clubCorrectionsTable.participantId,
      playhqMatchId: clubCorrectionsTable.playhqMatchId,
      field: clubCorrectionsTable.field,
    })
    .from(clubCorrectionsTable)
    .where(
      and(
        eq(clubCorrectionsTable.tenantId, tenantId),
        isNull(clubCorrectionsTable.removedAt),
        inArray(clubCorrectionsTable.participantId, missing),
      ),
    );
  const centralNames = await central.centralPlayerNames([
    ...new Set([...missing, ...mergeTargets]),
  ]);

  return {
    items: computeIdentityDrift({
      crosswalk,
      curation,
      present,
      centralNames,
      curated,
      corrections,
    }),
    checked,
    centralEmpty: false,
  };
}
