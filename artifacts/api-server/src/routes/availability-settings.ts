import { Router, type IRouter } from "express";
import { availabilitySettingsTable, db, type AvailabilitySettingsRow } from "@workspace/db";
import { RunAvailabilityStepParams, UpdateAvailabilitySettingsBody } from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import {
  DEFAULT_SCHEDULE,
  ensureRound,
  findRound,
  loadAvailabilitySettings,
  roundCounts,
  roundSlots,
  roundWeekendFor,
  runReminder,
  runStep,
  validateSchedule,
  type ScheduleStep,
} from "../lib/availability-schedule";
import { smsProvider } from "../lib/integrations/sms";

/**
 * The club's weekly availability round: the schedule, the current round's
 * progress and counts, and admin
 * "Run now" steps that go through the scheduler's own claim. Admin only.
 * Logs carry ids and counts only — never a contact.
 */
const router: IRouter = Router();

/** The settings a club gets before it saves any (the schema defaults). */
const DEFAULTS = {
  enabled: false,
  smsEnabled: true,
  ...DEFAULT_SCHEDULE,
  selectionRule: "captains_own_grade",
} as const;

/** The club's settings plus the platform's SMS provider (null = email only). */
function serialize(row: AvailabilitySettingsRow | null) {
  if (!row) return { ...DEFAULTS, updatedAt: null, smsProvider: smsProvider() };
  return {
    enabled: row.enabled,
    smsEnabled: row.smsEnabled,
    sendDow: row.sendDow,
    sendTime: row.sendTime,
    reminderDow: row.reminderDow,
    reminderTime: row.reminderTime,
    cutoffDow: row.cutoffDow,
    cutoffTime: row.cutoffTime,
    finaliseDow: row.finaliseDow,
    finaliseTime: row.finaliseTime,
    selectionRule: row.selectionRule,
    updatedAt: row.updatedAt,
    smsProvider: smsProvider(),
  };
}

router.get("/availability/settings", requireAdmin, async (req, res): Promise<void> => {
  res.json(serialize(await loadAvailabilitySettings(getTenantId(req))));
});

router.put("/availability/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAvailabilitySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings", issues: parsed.error.issues });
    return;
  }
  const problem = validateSchedule(parsed.data);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const tenantId = getTenantId(req);
  const values = { ...parsed.data, updatedAt: new Date() };
  const [row] = await db
    .insert(availabilitySettingsTable)
    .values({ tenantId, ...values })
    .onConflictDoUpdate({ target: availabilitySettingsTable.tenantId, set: values })
    .returning();
  req.log?.info({ tenantId, enabled: row.enabled }, "availability settings saved");
  res.json(serialize(row));
});

router.get("/availability/rounds/current", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const settings = (await loadAvailabilitySettings(tenantId)) ?? DEFAULTS;
  const now = new Date();
  const weekendDate = roundWeekendFor(settings, now);
  const slots = roundSlots(settings, weekendDate);
  const round = await findRound(tenantId, weekendDate);
  const counts = round
    ? await roundCounts(tenantId, round.id)
    : { yes: 0, maybe: 0, no: 0, none: 0, late: 0, total: 0 };
  res.json({
    enabled: settings.enabled,
    roundId: round?.id ?? null,
    weekendDate,
    sendAt: slots.send,
    reminderAt: slots.reminder,
    cutoffAt: slots.cutoff,
    finaliseAt: slots.finalise,
    sendStartedAt: round?.sendStartedAt ?? null,
    sendCompletedAt: round?.sendCompletedAt ?? null,
    reminderStartedAt: round?.reminderStartedAt ?? null,
    reminderCompletedAt: round?.reminderCompletedAt ?? null,
    cutoffStartedAt: round?.cutoffStartedAt ?? null,
    cutoffCompletedAt: round?.cutoffCompletedAt ?? null,
    counts,
  });
});

const STEP: Record<"send" | "remind" | "cutoff", ScheduleStep> = {
  send: "send",
  remind: "reminder",
  cutoff: "cutoff",
};

router.post(
  "/availability/rounds/current/:step",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = RunAvailabilityStepParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Step must be send, remind or cutoff" });
      return;
    }
    const tenantId = getTenantId(req);
    const settings = await loadAvailabilitySettings(tenantId);
    if (!settings?.enabled) {
      res.status(400).json({ error: "Turn availability on for the club before running a step." });
      return;
    }
    const step = STEP[params.data.step];
    const now = new Date();
    const round = await ensureRound(tenantId, roundWeekendFor(settings, now));
    if (step === "reminder" && round.sendStartedAt == null) {
      res.status(409).json({ error: "The requests haven't gone out yet. Send them first." });
      return;
    }
    const opts = { manual: true, logger: req.log };
    // A reminder that already ran may go again by hand, throttled per recipient.
    const result =
      (await runStep(tenantId, round, step, settings, now, opts)) ??
      (step === "reminder"
        ? await runReminder(tenantId, round, settings.smsEnabled, now, opts)
        : null);
    if (!result) {
      res.status(409).json({ error: `The ${params.data.step} step has already run this round.` });
      return;
    }
    req.log?.info(
      {
        tenantId,
        roundId: round.id,
        step,
        adminId: (req as RequestWithAdmin).admin?.id,
        messaged: result.messaged,
        throttled: result.throttled,
        drafts: result.drafts,
      },
      "availability step run by admin",
    );
    res.json({ ...result, step: params.data.step, roundId: round.id });
  },
);

export default router;
