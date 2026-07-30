import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  capRegisterTable,
  playerGradeStatsTable,
  playersTable,
} from "@workspace/db";

/** The transaction handle passed to a `db.transaction` callback. */
export type CapSyncTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Maps a recomputed grade name to its A Grade cap-register category.
 * Only A Grade (male) and Female A Grade (female) have cap lists; all other
 * grades are intentionally absent and are ignored by the sync routine.
 */
export const GRADE_TO_CAP_CATEGORY: Record<string, "male" | "female"> = {
  "A Grade": "male",
  "Female A Grade": "female",
};

/** The cap-bearing grade for each cap-register category (inverse of the above). */
export const CAP_CATEGORY_TO_GRADE: Record<"male" | "female", string> = {
  male: "A Grade",
  female: "Female A Grade",
};

/**
 * Fill-ins are excluded from every stats derivation (match-aggregate.ts,
 * points.ts, roundup.ts, stats.ts), so they never accumulate grade games and
 * would read as permanently uncapped. They are borrowed players, not club
 * members, and must never be issued a cap. Declared locally, as in
 * match-milestone-detector.ts / roundup.ts / fixtures.ts / stats.ts.
 */
const FILL_IN_FLOOR = 90000;

/**
 * Circuit breaker on auto-minting. A single import that would cap more than
 * this many players — AND more than half the squad it fielded — is not a round
 * of debuts; it is a cap register that has not been linked to the roster yet
 * (a club onboarding with a century of history, or a seeded register whose rows
 * still carry `player_id = NULL`). Minting there stamps bogus numbers over a
 * real honour roll, which is unrecoverable without hand-editing.
 *
 * Both conditions are needed. The absolute floor alone would block a small
 * import where every player genuinely is a debutant; the ratio alone would
 * block a single-player import. Together they only trip on the shape that
 * actually signals an unlinked register: a large fraction of a full squad.
 *
 * A club that trips this caps its players by hand (the import preview already
 * flags who is uncapped), after which the register is linked and later imports
 * mint normally.
 */
const MAX_AUTO_DEBUTS = 3;

export type CapRecomputeResult = {
  category: "male" | "female";
  grade: string;
  /** Linked caps in this category whose games/on-record value actually changed. */
  updated: number;
};

/**
 * Refresh `gamesAGrade` + `inStats` for every LINKED cap in the given
 * categories from the current per-grade stats aggregate.
 *
 * Import-independent: unlike `syncCapsFromStats` this needs no import player
 * list and never creates or deletes caps — it only reconciles the cached game
 * counts of caps that are already linked to a player record. This lets a cap
 * that an admin linked by hand pick up that player's real grade games without a
 * re-import.
 *
 * Rules (mirroring how `syncCapsFromStats` matches — by linked `playerId` and
 * the cap's grade):
 *  - A linked player with > 0 games for the cap's grade is "on record":
 *    `inStats = true`, `gamesAGrade` = that per-grade total.
 *  - A linked player with no games on record for the grade is NOT on record:
 *    `inStats = false`, `gamesAGrade = 0`.
 *  - Unlinked caps (no `playerId`) are left untouched — pre-digital caps keep
 *    their hand-entered state.
 *
 * Safe to run inside or outside an import transaction.
 *
 * @param tenantId only this tenant's caps are read and written. `cap_register`
 *        is curated club content; see the module note on `syncCapsFromStats`.
 */
export async function recomputeCapsFromStats(
  tx: CapSyncTx,
  tenantId: number,
  categories: ("male" | "female")[] = ["male", "female"],
): Promise<CapRecomputeResult[]> {
  const results: CapRecomputeResult[] = [];

  for (const category of categories) {
    const grade = CAP_CATEGORY_TO_GRADE[category];

    const statRows = await tx
      .select({
        playerId: playerGradeStatsTable.playerId,
        games: playerGradeStatsTable.games,
      })
      .from(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.grade, grade));
    const gamesByPlayer = new Map<number, number>();
    for (const r of statRows) gamesByPlayer.set(r.playerId, r.games ?? 0);

    const caps = await tx
      .select()
      .from(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, tenantId),
          eq(capRegisterTable.category, category),
        ),
      );

    let updated = 0;
    for (const cap of caps) {
      if (cap.playerId == null) continue;
      const games = gamesByPlayer.get(cap.playerId) ?? 0;
      const inStats = games > 0;
      if (cap.gamesAGrade !== games || cap.inStats !== inStats) {
        await tx
          .update(capRegisterTable)
          .set({ gamesAGrade: games, inStats })
          .where(
            and(
              eq(capRegisterTable.tenantId, tenantId),
              eq(capRegisterTable.id, cap.id),
            ),
          );
        updated++;
      }
    }

    results.push({ category, grade, updated });
  }

  return results;
}

/**
 * Player ids that already hold a cap in the given category, for this tenant.
 * Used by the import preview to flag debuts: a player appearing in a
 * cap-eligible grade who is NOT in this set is a candidate for their first cap
 * on commit. Mirrors the `playerId`-based rule `syncCapsFromStats` uses to
 * decide who needs a new cap — but note the preview cannot know whether the
 * commit's minting guard will actually issue those caps.
 */
export async function getCappedPlayerIds(
  tenantId: number,
  category: "male" | "female",
): Promise<Set<number>> {
  const rows = await db
    .select({ playerId: capRegisterTable.playerId })
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, tenantId),
        eq(capRegisterTable.category, category),
      ),
    );
  const ids = new Set<number>();
  for (const r of rows) if (r.playerId != null) ids.add(r.playerId);
  return ids;
}

export type CapSyncResult = {
  grade: string;
  category: "male" | "female";
  updated: number;
  created: number;
  /**
   * Players this run would have capped but deliberately did not, because the
   * minting guard tripped (see `MAX_AUTO_DEBUTS`). Non-zero means the club
   * should link or seed its cap register and cap these players by hand.
   */
  skipped: number;
  /** Caps freshly issued by this sync run (numbers the per-match debut card). */
  createdCaps: { capNumber: number; playerId: number; name: string }[];
};

/**
 * Refresh and extend an A Grade cap list from freshly-recomputed stats.
 *
 * MUST run inside the import's DB transaction, AFTER `recomputeAggregates`, so
 * `gamesAGrade` reflects the new per-grade totals and readers never observe a
 * half-applied state.
 *
 * Behaviour for the grade's cap category:
 *  - Existing caps linked to a player present in the recomputed stats get their
 *    `inStats` flipped on and `gamesAGrade` refreshed from the per-grade total.
 *    This covers EVERY player on record in the grade, not just this import's.
 *  - Players THIS IMPORT fielded who are not yet capped are issued new caps with
 *    the next available cap numbers in sequence — subject to the minting guard
 *    below.
 *
 * Minting is deliberately narrower than refreshing. A cap marks a debut, and
 * the only evidence of a debut is the player turning up in the import being
 * committed. An uncapped player who merely appears in the grade's aggregate is
 * NOT a debutant — they are someone whose cap is unlinked or missing, which is
 * a curation problem, not an event. (Before this rule the routine minted for
 * every uncapped player in the aggregate, so one per-match import of round 5
 * would cap the club's entire A Grade history.) On top of that, fill-ins can
 * never be capped, and `MAX_AUTO_DEBUTS` refuses to mint at all when the batch
 * looks like an unlinked register rather than a round of debuts.
 *
 * Idempotent: re-importing the same grade+season matches existing caps on
 * `playerId` first, so no duplicate caps are created and numbers are not bumped.
 *
 * @param tenantId the club whose register this is. Cap numbering is a
 *        per-tenant sequence enforced by
 *        `cap_register_tenant_category_cap_number_unique`, so both the reads
 *        (the high-water mark, the existing links) and the write are scoped to
 *        this tenant. Reading unfiltered would carry one club's numbering into
 *        another's — the same leak that put one club's cap numbers on another's
 *        public debut board (see routes/milestones.ts).
 * @param orderedPlayerIds player ids for this grade in the order new caps should
 *        be numbered (batting order, falling back to CSV row order). This is
 *        also the set eligible for a new cap — a player absent from it is
 *        refreshed but never minted.
 */
export async function syncCapsFromStats(
  tx: CapSyncTx,
  tenantId: number,
  grade: string,
  orderedPlayerIds: number[],
): Promise<CapSyncResult | null> {
  const category = GRADE_TO_CAP_CATEGORY[grade];
  if (!category) return null;

  // Per-grade recomputed totals (games) keyed by player.
  const statRows = await tx
    .select({
      playerId: playerGradeStatsTable.playerId,
      games: playerGradeStatsTable.games,
    })
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.grade, grade));

  const gamesByPlayer = new Map<number, number>();
  for (const r of statRows) {
    gamesByPlayer.set(r.playerId, r.games ?? 0);
  }
  if (gamesByPlayer.size === 0) {
    return { grade, category, updated: 0, created: 0, skipped: 0, createdCaps: [] };
  }

  // Existing caps in this category, for this tenant only.
  const existingCaps = await tx
    .select()
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, tenantId),
        eq(capRegisterTable.category, category),
      ),
    );

  const capByPlayer = new Map<number, (typeof existingCaps)[number]>();
  let maxCapNumber = 0;
  for (const c of existingCaps) {
    if (c.capNumber > maxCapNumber) maxCapNumber = c.capNumber;
    if (c.playerId != null) capByPlayer.set(c.playerId, c);
  }

  let updated = 0;
  let created = 0;
  const createdCaps: { capNumber: number; playerId: number; name: string }[] = [];

  // Players THIS import fielded in this grade, in the order new caps should be
  // numbered. Fill-ins are dropped outright; players the import names but who
  // carry no games in the grade's aggregate are not on record at all.
  const fielded: number[] = [];
  const isFielded = new Set<number>();
  for (const id of orderedPlayerIds) {
    if (id >= FILL_IN_FLOOR) continue;
    if (gamesByPlayer.has(id) && !isFielded.has(id)) {
      isFielded.add(id);
      fielded.push(id);
    }
  }

  // Everyone on record in the grade — this import's players first (so cap
  // numbers follow batting order), then the rest by id. Refresh visits all of
  // them; only the `fielded` prefix is eligible for a new cap.
  const refreshOrder = [
    ...fielded,
    ...[...gamesByPlayer.keys()].sort((a, b) => a - b).filter((id) => !isFielded.has(id)),
  ];

  // Would-be debutants, and the guard against minting over an unlinked register.
  const debutants = fielded.filter((id) => !capByPlayer.has(id));
  const mintingBlocked =
    debutants.length > MAX_AUTO_DEBUTS && debutants.length * 2 > fielded.length;
  const toMint = mintingBlocked ? new Set<number>() : new Set(debutants);

  // Names for players that need a brand-new cap entry.
  const nameByPlayer = new Map<number, string>();
  if (toMint.size > 0) {
    const playerRows = await tx
      .select({
        id: playersTable.id,
        surname: playersTable.surname,
        givenName: playersTable.givenName,
      })
      .from(playersTable)
      .where(inArray(playersTable.id, [...toMint]));
    for (const p of playerRows) {
      nameByPlayer.set(
        p.id,
        `${p.givenName ?? ""} ${p.surname ?? ""}`.trim() || `Player #${p.id}`,
      );
    }
  }

  let nextCapNumber = maxCapNumber + 1;
  for (const playerId of refreshOrder) {
    const games = gamesByPlayer.get(playerId) ?? 0;
    const existing = capByPlayer.get(playerId);
    if (existing) {
      await tx
        .update(capRegisterTable)
        .set({ inStats: true, gamesAGrade: games })
        .where(
          and(
            eq(capRegisterTable.tenantId, tenantId),
            eq(capRegisterTable.id, existing.id),
          ),
        );
      updated++;
      continue;
    }
    if (!toMint.has(playerId)) continue;
    const name = nameByPlayer.get(playerId) ?? `Player #${playerId}`;
    await tx.insert(capRegisterTable).values({
      tenantId,
      capNumber: nextCapNumber,
      category,
      name,
      inStats: true,
      gamesAGrade: games,
      autoCreated: true,
      playerId,
    });
    createdCaps.push({ capNumber: nextCapNumber, playerId, name });
    nextCapNumber++;
    created++;
  }

  return {
    grade,
    category,
    updated,
    created,
    skipped: mintingBlocked ? debutants.length : 0,
    createdCaps,
  };
}
