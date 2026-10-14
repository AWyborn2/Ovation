import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, playhqGradeDecisionsTable, type PlayhqGradeDecisionRow } from "@workspace/db";
import { SetPlatformGradeDecisionBody } from "@workspace/api-zod";
import {
  IngestNotConfiguredError,
  MAPPABLE_APP_GRADES,
  assertIngestScope,
  centralProjectorConfigured,
  getPlayhqIngestPool,
  groupPending,
  loadUnclassifiedGrades,
  validateGradeDecision,
  type Queryable,
} from "@workspace/db/playhq-ingest";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import { syncTenants } from "../lib/playhq-health";
import { applyGradeDecision, decidedKeys } from "../lib/playhq-grade-decisions";

/**
 * Platform-admin decisions about PlayHQ competitions Ovation can't place in a grade. A
 * competition the classifier doesn't recognise is skipped by the central projection, so its
 * matches vanish; competitions are shared by every club that plays in them, so what to do is a
 * platform decision — map it to an app grade, or mark it as not tracked.
 *
 * The decision is recorded app-side (`playhq_grade_decisions`) and, when the central projector
 * is configured, the competition's matches are projected straight away through its scoped pool
 * (the app's own central handle stays read-only) — the same shape as the player-privacy
 * overrides. Without the projector, a mapping takes effect on the next sync that touches the
 * competition.
 */
const router: IRouter = Router();

const iso = (d: Date) => d.toISOString();

function decisionOut(r: PlayhqGradeDecisionRow) {
  return {
    gradeKey: r.gradeKey,
    gradeName: r.gradeName,
    action: r.action as "map" | "ignore",
    centralGrade: r.centralGrade,
    reason: r.reason,
    setAt: iso(r.setAt),
  };
}

router.get("/platform/admin/grade-decisions", requirePlatformAdmin, async (req, res) => {
  try {
    const pool = getPlayhqIngestPool();
    await assertIngestScope(pool);
    const tenants = await syncTenants();
    const orgIds = [...new Set(tenants.map((t) => t.orgId))];
    const perOrg = await Promise.all(
      orgIds.map(async (orgId) => ({
        tenants: tenants.filter((t) => t.orgId === orgId).map((t) => ({ id: t.id, name: t.name })),
        grades: await loadUnclassifiedGrades(pool as unknown as Queryable, orgId),
      })),
    );
    const decisions = await db
      .select()
      .from(playhqGradeDecisionsTable)
      .orderBy(desc(playhqGradeDecisionsTable.setAt));
    res.json({
      projectorConfigured: centralProjectorConfigured(),
      mappableGrades: [...MAPPABLE_APP_GRADES],
      pending: groupPending(perOrg, await decidedKeys()),
      decisions: decisions.map(decisionOut),
    });
  } catch (err) {
    if (err instanceof IngestNotConfiguredError) {
      res.status(503).json({ error: "PlayHQ ingest database not configured" });
      return;
    }
    req.log.error({ err }, "grade decisions list failed");
    res.status(500).json({ error: "grade decisions list failed" });
  }
});

router.put("/platform/admin/grade-decisions", requirePlatformAdmin, async (req, res) => {
  const parsed = SetPlatformGradeDecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = validateGradeDecision(parsed.data);
  if (!v.ok) {
    res.status(400).json({ error: v.error });
    return;
  }
  const admin = (req as RequestWithPlatformAdmin).platformAdmin!;
  const values = {
    gradeName: v.gradeName,
    action: parsed.data.action,
    centralGrade: v.centralGrade,
    reason: parsed.data.reason?.trim() || null,
    setByPlatformAdminId: admin.id,
    setAt: new Date(),
  };
  const [row] = await db
    .insert(playhqGradeDecisionsTable)
    .values({ gradeKey: v.gradeKey, ...values })
    .onConflictDoUpdate({ target: playhqGradeDecisionsTable.gradeKey, set: values })
    .returning();
  // An ignore needs no projection: the projector skips the competition on its next run, and
  // there is nothing to un-project. Only a mapping brings matches in.
  const result =
    parsed.data.action === "map"
      ? await applyGradeDecision(v.gradeKey, req.log)
      : { applied: false, created: 0, updated: 0, skipped: 0 };
  req.log?.info(
    {
      event: "playhq_grade_decision_set",
      platformAdminId: admin.id,
      gradeKey: v.gradeKey,
      action: row!.action,
      centralGrade: row!.centralGrade,
      ...result,
    },
    "platform admin decided a PlayHQ competition",
  );
  res.json({ ...decisionOut(row!), ...result });
});

router.delete(
  "/platform/admin/grade-decisions/:gradeKey",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const gradeKey = String(req.params.gradeKey ?? "");
    const [row] = await db
      .delete(playhqGradeDecisionsTable)
      .where(eq(playhqGradeDecisionsTable.gradeKey, gradeKey))
      .returning();
    if (!row) {
      res.status(404).json({ error: "No such decision" });
      return;
    }
    const admin = (req as RequestWithPlatformAdmin).platformAdmin!;
    req.log?.info(
      { event: "playhq_grade_decision_removed", platformAdminId: admin.id, gradeKey },
      "platform admin removed a PlayHQ competition decision",
    );
    res.status(204).end();
  },
);

export default router;
