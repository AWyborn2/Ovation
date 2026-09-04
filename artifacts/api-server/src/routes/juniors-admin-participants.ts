import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorPremiershipPlayersTable,
  juniorOfficeBearersTable,
  juniorParticipantMergesTable,
} from "@workspace/db";
import {
  UpdateJuniorParticipantParams,
  UpdateJuniorParticipantBody,
  MergeJuniorParticipantParams,
  MergeJuniorParticipantBody,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { juniorEditRateLimiter, juniorMergeRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import { journal, adminName, recomputeParticipantMetadata } from "../lib/junior-admin-helpers";
import { isCentralTenant } from "../lib/tenant";

/**
 * Juniors admin — participant profile corrections and duplicate merges.
 *
 * `PATCH /juniors/participants/:id` (display name / privacy) and
 * `POST /juniors/participants/:id/merge` (absorb a duplicate PlayHQ GUID into
 * its keeper, recorded in junior_participant_merges so the ETL re-applies it).
 * See routes/juniors-admin.ts for the write-through + journal model. Mounted
 * there.
 */
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// PATCH /juniors/participants/:id — display name / privacy corrections
// ---------------------------------------------------------------------------

router.patch(
  "/juniors/participants/:id",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = UpdateJuniorParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorParticipantBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const [participant] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.participantId, params.data.id),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
        ),
      );
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const set: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    if (body.data.displayName !== undefined) {
      set.displayName = body.data.displayName;
      patch.display_name = body.data.displayName;
      prev.display_name = participant.displayName;
    }
    if (body.data.isPrivate !== undefined) {
      set.isPrivate = body.data.isPrivate;
      patch.is_private = body.data.isPrivate;
      prev.is_private = participant.isPrivate;
    }
    if (Object.keys(set).length === 0) {
      res.json({
        participantId: participant.participantId,
        displayName: participant.displayName ?? "",
        isPrivate: participant.isPrivate,
      });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(juniorParticipantsTable)
        .set(set)
        .where(eq(juniorParticipantsTable.participantId, participant.participantId))
        .returning();
      // A display-name change flows onto the participant's stored line names
      // so scorecards/rosters keep matching the directory. Journalled via the
      // participant patch only — the ETL re-apply refreshes line names from
      // the participant row the same way.
      if (body.data.displayName !== undefined) {
        await tx
          .update(juniorMatchBattingTable)
          .set({ playerName: body.data.displayName })
          .where(
            and(
              eq(juniorMatchBattingTable.participantId, participant.participantId),
              eq(juniorMatchBattingTable.isHallsHead, true),
            ),
          );
        await tx
          .update(juniorMatchBowlingTable)
          .set({ playerName: body.data.displayName })
          .where(
            and(
              eq(juniorMatchBowlingTable.participantId, participant.participantId),
              eq(juniorMatchBowlingTable.isHallsHead, true),
            ),
          );
        await tx
          .update(juniorMatchRostersTable)
          .set({ playerName: body.data.displayName })
          .where(
            and(
              eq(juniorMatchRostersTable.participantId, participant.participantId),
              eq(juniorMatchRostersTable.isHallsHead, true),
            ),
          );
      }
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_participants",
        targetId: participant.participantId,
        op: "update",
        patch,
        prevValues: prev,
        participantId: participant.participantId,
        createdBy: adminName(req),
      });
      return row;
    });

    res.json({
      participantId: updated.participantId,
      displayName: updated.displayName ?? "",
      isPrivate: updated.isPrivate,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /juniors/participants/:id/merge — absorb a duplicate junior profile
//
// PlayHQ occasionally minted two participant GUIDs for the same child. This
// PERMANENTLY merges the duplicate (:id) into the keeper: every junior line
// is reassigned, the duplicate profile row is deleted, and the merge is
// recorded in junior_participant_merges so the juniors ETL re-applies it
// after every full-replace reload (step 7) — without that record the dump
// would silently resurrect the duplicate. The map stays FLAT: absorbing a
// GUID that is itself a keeper re-points its merge rows to the new keeper.
// Requesting a keeper that has itself been merged away returns 409 with the
// canonical keeper rather than silently redirecting the merge.
// ---------------------------------------------------------------------------

router.post(
  "/juniors/participants/:id/merge",
  requireAdmin,
  juniorMergeRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = MergeJuniorParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = MergeJuniorParticipantBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const duplicateId = params.data.id;
    const keeperId = body.data.keeperParticipantId;
    if (duplicateId === keeperId) {
      res.status(400).json({ error: "Cannot merge a profile into itself" });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const tenantId = getTenantId(req);

    try {
      const result = await db.transaction(async (tx) => {
        const [dup] = await tx
          .select()
          .from(juniorParticipantsTable)
          .where(
            and(
              eq(juniorParticipantsTable.participantId, duplicateId),
              eq(juniorParticipantsTable.tenantId, tenantId),
            ),
          );
        if (!dup) throw new Error("__DUP_NOT_FOUND__");
        const [keeper] = await tx
          .select()
          .from(juniorParticipantsTable)
          .where(
            and(
              eq(juniorParticipantsTable.participantId, keeperId),
              eq(juniorParticipantsTable.tenantId, tenantId),
            ),
          );
        if (!keeper) {
          // A missing keeper that is a recorded duplicate means the client is
          // stale — refuse with the canonical keeper instead of silently
          // merging into a profile the admin never looked at.
          const [merged] = await tx
            .select({
              keeper: juniorParticipantMergesTable.keeperParticipantId,
            })
            .from(juniorParticipantMergesTable)
            .where(
              and(
                eq(juniorParticipantMergesTable.tenantId, tenantId),
                eq(juniorParticipantMergesTable.duplicateParticipantId, keeperId),
              ),
            );
          if (merged) {
            const err = new Error("__KEEPER_MERGED_AWAY__") as Error & {
              canonicalKeeper?: string;
            };
            err.canonicalKeeper = merged.keeper;
            throw err;
          }
          throw new Error("__KEEPER_NOT_FOUND__");
        }

        // Reassign every junior line from the duplicate to the keeper. The
        // HH flag is untouched — a line carrying this GUID is the same human
        // whichever side of the card it sits on.
        const batting = await tx
          .update(juniorMatchBattingTable)
          .set({ participantId: keeperId })
          .where(eq(juniorMatchBattingTable.participantId, duplicateId))
          .returning({ id: juniorMatchBattingTable.id });
        const bowling = await tx
          .update(juniorMatchBowlingTable)
          .set({ participantId: keeperId })
          .where(eq(juniorMatchBowlingTable.participantId, duplicateId))
          .returning({ id: juniorMatchBowlingTable.id });
        const rosters = await tx
          .update(juniorMatchRostersTable)
          .set({ participantId: keeperId })
          .where(eq(juniorMatchRostersTable.participantId, duplicateId))
          .returning({ id: juniorMatchRostersTable.id });

        // Same-match roster duplicates cannot double-count Games (canonical
        // figure is COUNT(DISTINCT match_id)) but are deduped for tidiness.
        const dedupedRes = await tx.execute(sql`
          DELETE FROM junior_match_rosters a
          USING junior_match_rosters b
          WHERE a.participant_id = ${keeperId}
            AND b.participant_id = ${keeperId}
            AND a.match_id = b.match_id
            AND a.id > b.id
        `);
        const rostersDeduped = Number(
          (dedupedRes as unknown as { rowCount?: number }).rowCount ?? 0,
        );

        const premPlayers = await tx
          .update(juniorPremiershipPlayersTable)
          .set({ participantId: keeperId })
          .where(eq(juniorPremiershipPlayersTable.participantId, duplicateId))
          .returning({ id: juniorPremiershipPlayersTable.id });
        await tx.execute(sql`
          DELETE FROM junior_premiership_players a
          USING junior_premiership_players b
          WHERE a.participant_id = ${keeperId}
            AND b.participant_id = ${keeperId}
            AND a.premiership_id = b.premiership_id
            AND a.id > b.id
        `);
        const officeBearers = await tx
          .update(juniorOfficeBearersTable)
          .set({ participantId: keeperId })
          .where(
            and(
              eq(juniorOfficeBearersTable.participantId, duplicateId),
              eq(juniorOfficeBearersTable.tenantId, tenantId),
            ),
          )
          .returning({ id: juniorOfficeBearersTable.id });

        // Keeper's directory name flows onto its (now combined) HH lines so
        // scorecards keep matching the directory — mirrors the rename
        // propagation in PATCH /juniors/participants/:id.
        if (keeper.displayName) {
          await tx
            .update(juniorMatchBattingTable)
            .set({ playerName: keeper.displayName })
            .where(
              and(
                eq(juniorMatchBattingTable.participantId, keeperId),
                eq(juniorMatchBattingTable.isHallsHead, true),
              ),
            );
          await tx
            .update(juniorMatchBowlingTable)
            .set({ playerName: keeper.displayName })
            .where(
              and(
                eq(juniorMatchBowlingTable.participantId, keeperId),
                eq(juniorMatchBowlingTable.isHallsHead, true),
              ),
            );
          await tx
            .update(juniorMatchRostersTable)
            .set({ playerName: keeper.displayName })
            .where(
              and(
                eq(juniorMatchRostersTable.participantId, keeperId),
                eq(juniorMatchRostersTable.isHallsHead, true),
              ),
            );
        }

        // Carry the senior cross-link (keeper's own wins) and privacy
        // (sticky: private if either side was private).
        const [updatedKeeper] = await tx
          .update(juniorParticipantsTable)
          .set({
            seniorPlayerId: keeper.seniorPlayerId ?? dup.seniorPlayerId,
            isPrivate: keeper.isPrivate || dup.isPrivate,
          })
          .where(eq(juniorParticipantsTable.participantId, keeperId))
          .returning();

        await recomputeParticipantMetadata(tx, keeperId);

        // Snapshot then delete the absorbed profile row.
        await tx
          .delete(juniorParticipantsTable)
          .where(eq(juniorParticipantsTable.participantId, duplicateId));

        // Keep the map flat: earlier merges that pointed at the duplicate now
        // point at the new keeper.
        await tx
          .update(juniorParticipantMergesTable)
          .set({ keeperParticipantId: keeperId })
          .where(
            and(
              eq(juniorParticipantMergesTable.tenantId, tenantId),
              eq(juniorParticipantMergesTable.keeperParticipantId, duplicateId),
            ),
          );

        await tx.insert(juniorParticipantMergesTable).values({
          tenantId,
          duplicateParticipantId: duplicateId,
          keeperParticipantId: keeperId,
          duplicateRow: {
            participant_id: dup.participantId,
            display_name: dup.displayName,
            is_private: dup.isPrivate,
            scorecard_lines: dup.scorecardLines,
            roster_appearances: dup.rosterAppearances,
            first_season: dup.firstSeason,
            last_season: dup.lastSeason,
            teams: dup.teams,
            senior_player_id: dup.seniorPlayerId,
          },
          createdBy: adminName(req),
        });

        return {
          keeper: updatedKeeper,
          counts: {
            batting: batting.length,
            bowling: bowling.length,
            rosters: rosters.length,
            rostersDeduped,
            premiershipPlayers: premPlayers.length,
            officeBearers: officeBearers.length,
          },
        };
      });

      res.json({
        keeperParticipantId: result.keeper.participantId,
        duplicateParticipantId: duplicateId,
        displayName: result.keeper.displayName ?? "",
        isPrivate: result.keeper.isPrivate,
        seniorPlayerId: result.keeper.seniorPlayerId,
        reassigned: result.counts,
      });
    } catch (err) {
      const e = err as Error & { canonicalKeeper?: string };
      if (e.message === "__DUP_NOT_FOUND__") {
        res.status(404).json({ error: "Duplicate participant not found" });
        return;
      }
      if (e.message === "__KEEPER_NOT_FOUND__") {
        res.status(404).json({ error: "Keeper participant not found" });
        return;
      }
      if (e.message === "__KEEPER_MERGED_AWAY__") {
        res.status(409).json({
          error:
            "The requested keeper has itself been merged away — retry with the canonical keeper",
          canonicalKeeperParticipantId: e.canonicalKeeper,
        });
        return;
      }
      throw err;
    }
  },
);

export default router;
