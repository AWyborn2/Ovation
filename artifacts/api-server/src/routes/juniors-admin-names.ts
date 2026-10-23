import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  juniorParticipantsTable,
  juniorStatCorrectionsTable,
  juniorMatchDisplaySettingsTable,
} from "@workspace/db";
import {
  ListJuniorNameReviewResponse,
  PublishJuniorNamesBody,
  PublishJuniorNamesResponse,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { juniorEditRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import { adminName, journal, renameClubLines } from "../lib/junior-admin-helpers";
import {
  cleanJuniorName,
  isExpandedJuniorName,
  loadJuniorNameReview,
  namePublicationNote,
  isNamePublicationRetry,
} from "../lib/junior-name-review";
import { juniorParticipantKey } from "../lib/junior-participant-scope";
import { parseJuniorNameStyle } from "../lib/junior-names";

const router: IRouter = Router();
router.get("/juniors/name-review", requireAdmin, async (req, res): Promise<void> => {
  res.json(ListJuniorNameReviewResponse.parse(await loadJuniorNameReview(getTenantId(req))));
});

router.post(
  "/juniors/name-review",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const parsed = PublishJuniorNamesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const selections = parsed.data.selections;
    if (
      new Set(selections.map((s) => s.participantId.toLowerCase())).size !== selections.length ||
      selections.some((s) => !isExpandedJuniorName(cleanJuniorName(s.name)))
    ) {
      res.status(400).json({
        error:
          "Select each identity once and enter a full given name and surname (maximum 200 characters).",
      });
      return;
    }
    const tenantId = getTenantId(req);
    try {
      const result = await db.transaction(
        async (tx) => {
          // Lock in GUID order. SERIALIZABLE also rejects a simultaneous import,
          // evidence change, correction revert or privacy/settings change.
          await tx.execute(
            sql`SELECT participant_id FROM junior_participants WHERE tenant_id = ${tenantId} ORDER BY participant_id FOR UPDATE`,
          );
          const [settings] = await tx
            .select()
            .from(juniorMatchDisplaySettingsTable)
            .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId));
          const style = parseJuniorNameStyle(settings?.nameStyle);
          const review = await loadJuniorNameReview(tenantId, tx, style);
          let published = 0,
            skipped = 0;
          for (const selection of selections) {
            const matches = review.filter(
              (r) => r.participantId.toLowerCase() === selection.participantId.toLowerCase(),
            );
            const row = matches[0];
            if (matches.length !== 1 || !row) throw new Error("STALE_NAME_PREVIEW");
            const name = cleanJuniorName(selection.name);
            // A retry is a no-op only when its revision is the exact pre-image of
            // the last publication, not an arbitrary stale change to the same name.
            if (row.currentName === name) {
              if (row.revision === selection.revision) {
                skipped++;
                continue;
              }
              const [last] = await tx
                .select()
                .from(juniorStatCorrectionsTable)
                .where(
                  and(
                    eq(juniorStatCorrectionsTable.tenantId, tenantId),
                    eq(juniorStatCorrectionsTable.targetTable, "junior_participants"),
                    eq(juniorStatCorrectionsTable.targetId, row.participantId),
                    sql`${juniorStatCorrectionsTable.patch} ? 'display_name'`,
                  ),
                )
                .orderBy(desc(juniorStatCorrectionsTable.id))
                .limit(1);
              if (last && isNamePublicationRetry(last.note, selection.mode, selection.revision)) {
                skipped++;
                continue;
              }
              throw new Error("STALE_NAME_PREVIEW");
            }
            if (row.revision !== selection.revision) throw new Error("STALE_NAME_PREVIEW");
            if (
              selection.mode === "suggestion" &&
              (row.status !== "suggested" || row.suggestedName !== name)
            )
              throw new Error("STALE_NAME_PREVIEW");
            await tx
              .update(juniorParticipantsTable)
              .set({ displayName: name })
              .where(juniorParticipantKey(tenantId, row.participantId));
            await renameClubLines(tx, tenantId, row.participantId, name);
            await journal(tx, {
              tenantId,
              targetTable: "junior_participants",
              targetId: row.participantId,
              participantId: row.participantId,
              op: "update",
              createdBy: adminName(req),
              patch: { display_name: name },
              prevValues: { display_name: row.currentName },
              note: namePublicationNote(selection.mode, selection.revision, row.evidence),
            });
            published++;
          }
          return { published, skipped };
        },
        { isolationLevel: "serializable" },
      );
      res.json(PublishJuniorNamesResponse.parse(result));
    } catch (error) {
      const e = error as Error & { code?: string; cause?: { code?: string } };
      if (e.message === "STALE_NAME_PREVIEW" || e.code === "40001" || e.cause?.code === "40001") {
        res.status(409).json({
          error:
            "Names, evidence or settings changed. Reload the review and confirm again; no names were published.",
        });
        return;
      }
      throw error;
    }
  },
);
export default router;
