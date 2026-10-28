/**
 * AI designer jobs (ADR-011 §8, T7.8; club Generate, ADR-012 R2-D): one
 * `template_generations` row per design, worked in-process and polled.
 *
 * - Jobs run `TEMPLATE_AI_CONCURRENCY` at a time, at most one per tenant (the
 *   console counts as one), taken round robin so one club can't hold up the
 *   others (a design takes minutes).
 * - Its result is saved when any reply validated: for the console as an
 *   unlisted console template in the library, with its fit report (T7.7); for
 *   a club as a private club template, never in the library.
 * - A club has `CLUB_GENERATE_LIMIT` designs a Perth calendar month; designs
 *   that fail at the provider or are refused don't count.
 * - A job that was queued or running when the server stopped is marked failed
 *   at the next start (`failInterruptedGenerations`).
 * - Tokens, cost, attempts, `first_try_fit`, the outcome and the errors are
 *   recorded on the row; the console's quality figure reads them (T7.13).
 */
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import {
  cardTemplatesTable,
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  platformSettingsTable,
  templateGenerationsTable,
  type TemplateGenerationRow,
} from "@workspace/db";
import type { TemplateDocumentV2, TemplateFitReport } from "@workspace/scorecard/kind-templates";
import { renderFitCheck } from "../card-video-renderer";
import { canRenderHeadless, serialisedFitCheck } from "../draft-render";
import { KIND_SOURCE } from "../kind-templates";
import { logger } from "../logger";
import { MAX_TEMPLATE_NAME } from "../template-library/copies";
import { documentCoverage } from "../template-library/coverage";
import { initialFit, requestFit } from "../template-library/fit";
import { designTemplate, type DesignResult, type FitCheckFn } from "./generate";
import type { DesignInput } from "./prompt";
import { TEMPLATE_AI_MODEL, templateAiProvider, type TemplateAiProvider } from "./provider";

/** The outcomes a finished job records. */
export type GenerationOutcome = DesignResult["outcome"] | "provider_error";

/** Designs a club may start in a calendar month (ADR-012). */
export const CLUB_GENERATE_LIMIT = 20;
/** The time zone a club's month is counted in. */
export const GENERATE_TIME_ZONE = "Australia/Perth";
/** Outcomes that don't use up one of the month's designs. */
const UNCOUNTED_OUTCOMES = ["provider_error", "refused"];
/** Jobs running at once, over every tenant. */
export const TEMPLATE_AI_CONCURRENCY = 1;
/** The quality bar for club Generate: first-try fits over the first 50 console designs. */
export const GENERATE_QUALITY_RUNS = 50;
export const GENERATE_QUALITY_TARGET = 0.7;

const MAX_STORED_ERRORS = 20;

/** Errors as the row stores them: one per line, or null for none. */
export function storedErrors(errors: string[]): string | null {
  const lines = errors
    .slice(0, MAX_STORED_ERRORS)
    .map((e) => e.replace(/\s+/g, " ").trim().slice(0, 500))
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

/** A row's errors, as `storedErrors` wrote them. */
export function generationErrors(row: Pick<TemplateGenerationRow, "error">): string[] {
  return row.error ? row.error.split("\n") : [];
}

let fitOverride: FitCheckFn | null | undefined;
/** Test seam: the fit check jobs use (`null` for none; `undefined` puts the real one back). */
export function setGenerationFitCheck(fn: FitCheckFn | null | undefined): void {
  fitOverride = fn;
}

function fitCheck(): FitCheckFn | null {
  if (fitOverride !== undefined) return fitOverride;
  return canRenderHeadless()
    ? (document, kind) => serialisedFitCheck(() => renderFitCheck(document, kind, null))
    : null;
}

type Job = {
  id: number;
  tenantId: number | null;
  input: DesignInput;
  provider: TemplateAiProvider;
  adminId: number | null;
};

/** A tenant's place in the queue; the console is one tenant. */
const queueKey = (tenantId: number | null) => (tenantId === null ? "console" : `t${tenantId}`);
/** Waiting jobs per tenant, oldest first. */
const waiting = new Map<string, Job[]>();
/** Tenants with a job running. */
const runningKeys = new Set<string>();
/** When each tenant last had a job started (a counter): the least recent goes next. */
const lastServed = new Map<string, number>();
let served = 0;
let settledWaiters: Array<() => void> = [];

/** The next tenant to run: waiting, not running, and served least recently (first queued on a tie). */
function nextKey(): string | undefined {
  let best: string | undefined;
  for (const key of waiting.keys()) {
    if (runningKeys.has(key)) continue;
    if (best === undefined || (lastServed.get(key) ?? 0) < (lastServed.get(best) ?? 0)) best = key;
  }
  return best;
}

function pump(): void {
  while (runningKeys.size < TEMPLATE_AI_CONCURRENCY) {
    const key = nextKey();
    if (key === undefined) break;
    const jobs = waiting.get(key)!;
    const job = jobs.shift()!;
    if (jobs.length === 0) waiting.delete(key);
    runningKeys.add(key);
    lastServed.set(key, ++served);
    void run(job)
      .catch((err: unknown) => logger.error({ err, generation: job.id }, "AI designer: job failed"))
      .finally(() => {
        runningKeys.delete(key);
        pump();
        if (waiting.size === 0 && runningKeys.size === 0) {
          const waiters = settledWaiters;
          settledWaiters = [];
          for (const resolve of waiters) resolve();
        }
      });
  }
}

function enqueue(job: Job): void {
  const key = queueKey(job.tenantId);
  const jobs = waiting.get(key);
  if (jobs) jobs.push(job);
  else waiting.set(key, [job]);
  pump();
}

/** Wait for every queued job (tests). */
export async function generationsSettled(): Promise<void> {
  if (waiting.size === 0 && runningKeys.size === 0) return;
  await new Promise<void>((resolve) => settledWaiters.push(resolve));
}

/** A short name for a design: its kind and the start of its brief. */
export function designName(kind: string, brief: string): string {
  const words = brief.trim().replace(/\s+/g, " ").slice(0, 48);
  return `AI ${kind}${words ? `: ${words}${brief.trim().length > 48 ? "…" : ""}` : ""}`.slice(
    0,
    80,
  );
}

/** Save a design as an unlisted console template of the library (version 1). */
export async function saveConsoleDesign(opts: {
  kind: string;
  name: string;
  document: TemplateDocumentV2;
  fitReport: TemplateFitReport | null;
  adminId: number | null;
}): Promise<{ libraryTemplateId: number; version: number }> {
  const coverage = documentCoverage(opts.document, opts.kind);
  // The designer ran the fit check itself; without a harness the store's own
  // rule applies (checked later, or skipped where no harness ever runs).
  const fit = opts.fitReport
    ? {
        fitStatus: opts.fitReport.status,
        fitReport: opts.fitReport as unknown as Record<string, unknown>,
      }
    : initialFit();
  const saved = await db.transaction(async (tx) => {
    const [template] = await tx
      .insert(libraryTemplatesTable)
      .values({
        kind: opts.kind,
        name: opts.name,
        origin: "console",
        listed: false,
        currentVersion: 1,
      })
      .returning({ id: libraryTemplatesTable.id });
    await tx.insert(libraryTemplateVersionsTable).values({
      templateId: template!.id,
      version: 1,
      document: opts.document,
      coverage,
      fitStatus: fit.fitStatus,
      fitReport: fit.fitReport,
      createdByAdminId: opts.adminId,
    });
    return { libraryTemplateId: template!.id, version: 1 };
  });
  if (!opts.fitReport && fit.fitStatus === "pending")
    requestFit(
      { kind: "libraryVersion", templateId: saved.libraryTemplateId, version: 1 },
      opts.document,
      opts.kind,
    );
  return saved;
}

/**
 * Save a club's design as one of its private templates (`source = 'kind'`,
 * no origin, not the kind's default). It never goes into the library.
 */
export async function saveClubDesign(opts: {
  tenantId: number;
  kind: string;
  name: string;
  document: TemplateDocumentV2;
  fitReport: TemplateFitReport | null;
  adminId: number | null;
}): Promise<{ copyId: number }> {
  const fit = opts.fitReport
    ? {
        fitStatus: opts.fitReport.status,
        fitReport: opts.fitReport as unknown as Record<string, unknown>,
      }
    : initialFit();
  const [row] = await db
    .insert(cardTemplatesTable)
    .values({
      tenantId: opts.tenantId,
      name: opts.name.slice(0, MAX_TEMPLATE_NAME),
      source: KIND_SOURCE,
      baseKind: opts.kind,
      cardKinds: [opts.kind],
      adjustments: opts.document,
      version: 1,
      updatedAt: new Date(),
      updatedByAdminId: opts.adminId,
      isKindDefault: false,
      originTemplateId: null,
      originVersion: null,
      fitStatus: fit.fitStatus,
      fitReport: fit.fitReport as typeof cardTemplatesTable.$inferInsert.fitReport,
    })
    .returning({ id: cardTemplatesTable.id });
  if (!opts.fitReport && fit.fitStatus === "pending")
    requestFit(
      { kind: "copy", tenantId: opts.tenantId, copyId: row!.id, version: 1 },
      opts.document,
      opts.kind,
    );
  return { copyId: row!.id };
}

async function run({ id, tenantId, input, provider, adminId }: Job) {
  await db
    .update(templateGenerationsTable)
    .set({ status: "running" })
    .where(eq(templateGenerationsTable.id, id));
  let result: DesignResult;
  try {
    result = await designTemplate(input, { provider, fit: fitCheck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, generation: id }, "AI designer: provider error");
    await db
      .update(templateGenerationsTable)
      .set({
        status: "failed",
        outcome: "provider_error",
        error: storedErrors([`The designer couldn't reach the model: ${message.slice(0, 200)}`]),
        finishedAt: new Date(),
      })
      .where(eq(templateGenerationsTable.id, id));
    return;
  }
  let resultRef: Record<string, number> | null = null;
  if (result.document) {
    const design = {
      kind: input.kind,
      name: designName(input.kind, input.brief),
      document: result.document,
      fitReport: result.fitReport,
      adminId,
    };
    resultRef =
      tenantId === null
        ? await saveConsoleDesign(design)
        : await saveClubDesign({ ...design, tenantId });
  }
  await db
    .update(templateGenerationsTable)
    .set({
      status: "done",
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      costMicros: result.usage.costMicros,
      attempts: result.attempts,
      firstTryFit: result.firstTryFit,
      outcome: result.outcome,
      resultRef,
      error: storedErrors(result.errors),
      finishedAt: new Date(),
    })
    .where(eq(templateGenerationsTable.id, id));
  logger.info(
    {
      generation: id,
      tenant: tenantId,
      kind: input.kind,
      outcome: result.outcome,
      attempts: result.attempts,
      costMicros: result.usage.costMicros,
    },
    "AI designer: design finished",
  );
}

/** Thrown when a club has used this month's designs. */
export class GenerateLimitError extends Error {
  constructor(readonly limit: number) {
    super("This month's designs are used up.");
  }
}

type Reader = Pick<typeof db, "select">;

/**
 * How many of this Perth calendar month's designs a club has used at `now`.
 * Designs that failed at the provider or were refused don't count; queued
 * and running ones do.
 */
export async function generationsUsed(
  tenantId: number,
  now: Date = new Date(),
  tx: Reader = db,
): Promise<number> {
  const local = sql`date_trunc('month', (${now.toISOString()}::timestamptz) AT TIME ZONE ${GENERATE_TIME_ZONE})`;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(templateGenerationsTable)
    .where(
      and(
        eq(templateGenerationsTable.tenantId, tenantId),
        sql`${templateGenerationsTable.createdAt} >= (${local} AT TIME ZONE ${GENERATE_TIME_ZONE})`,
        sql`${templateGenerationsTable.createdAt} < ((${local} + interval '1 month') AT TIME ZONE ${GENERATE_TIME_ZONE})`,
        or(
          isNull(templateGenerationsTable.outcome),
          notInArray(templateGenerationsTable.outcome, UNCOUNTED_OUTCOMES),
        ),
      ),
    );
  return row?.n ?? 0;
}

/** Designs a club has left this month. */
export async function generationsRemaining(tenantId: number, now?: Date): Promise<number> {
  return Math.max(0, CLUB_GENERATE_LIMIT - (await generationsUsed(tenantId, now)));
}

/**
 * Start a design, for the platform console (`tenantId` null) or a club.
 * Returns the queued row; the design runs when its turn comes. Throws when
 * the designer isn't configured, and `GenerateLimitError` when the club has
 * used this month's designs.
 */
export async function startGeneration(opts: {
  input: DesignInput;
  tenantId?: number | null;
  adminId: number | null;
  imageSha256?: string | null;
}): Promise<TemplateGenerationRow> {
  const provider = templateAiProvider();
  if (!provider) throw new Error("The AI designer isn't configured (no ANTHROPIC_API_KEY).");
  const tenantId = opts.tenantId ?? null;
  const values = {
    tenantId,
    adminId: opts.adminId,
    kind: opts.input.kind,
    model: TEMPLATE_AI_MODEL,
    status: "queued" as const,
  };
  const row =
    tenantId === null
      ? (await db.insert(templateGenerationsTable).values(values).returning())[0]!
      : await db.transaction(async (tx) => {
          // One start at a time per club, so two at once can't both take the last design.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext('template_generations'), ${tenantId})`,
          );
          if ((await generationsUsed(tenantId, new Date(), tx)) >= CLUB_GENERATE_LIMIT)
            throw new GenerateLimitError(CLUB_GENERATE_LIMIT);
          return (await tx.insert(templateGenerationsTable).values(values).returning())[0]!;
        });
  // Only the image's hash is kept, here in the logs.
  logger.info(
    {
      generation: row.id,
      tenant: tenantId,
      kind: opts.input.kind,
      image: opts.imageSha256 ?? null,
    },
    "AI designer: design queued",
  );
  enqueue({ id: row.id, tenantId, input: opts.input, provider, adminId: opts.adminId });
  return row;
}

/** Boot hook: a job queued or running when the server stopped won't finish, so mark it failed. */
export async function failInterruptedGenerations(): Promise<number> {
  const rows = await db
    .update(templateGenerationsTable)
    .set({
      status: "failed",
      outcome: "provider_error",
      error: "The server restarted before the design finished.",
      finishedAt: new Date(),
    })
    .where(inArray(templateGenerationsTable.status, ["queued", "running"]))
    .returning({ id: templateGenerationsTable.id });
  if (rows.length)
    logger.warn({ count: rows.length }, "AI designer: jobs interrupted by a restart marked failed");
  return rows.length;
}

/** One of the console's jobs (tenant null). */
export async function getGeneration(id: number): Promise<TemplateGenerationRow | null> {
  const [row] = await db
    .select()
    .from(templateGenerationsTable)
    .where(and(eq(templateGenerationsTable.id, id), isNull(templateGenerationsTable.tenantId)));
  return row ?? null;
}

/** The console's latest jobs, newest first. */
export async function listGenerations(limit = 50): Promise<TemplateGenerationRow[]> {
  return db
    .select()
    .from(templateGenerationsTable)
    .where(isNull(templateGenerationsTable.tenantId))
    .orderBy(desc(templateGenerationsTable.createdAt), desc(templateGenerationsTable.id))
    .limit(limit);
}

/** One of a club's jobs; another club's reads as null. */
export async function getClubGeneration(
  tenantId: number,
  id: number,
): Promise<TemplateGenerationRow | null> {
  const [row] = await db
    .select()
    .from(templateGenerationsTable)
    .where(
      and(eq(templateGenerationsTable.id, id), eq(templateGenerationsTable.tenantId, tenantId)),
    );
  return row ?? null;
}

/** A club's latest jobs, newest first. */
export async function listClubGenerations(
  tenantId: number,
  limit = 20,
): Promise<TemplateGenerationRow[]> {
  return db
    .select()
    .from(templateGenerationsTable)
    .where(eq(templateGenerationsTable.tenantId, tenantId))
    .orderBy(desc(templateGenerationsTable.createdAt), desc(templateGenerationsTable.id))
    .limit(limit);
}

/**
 * The quality bar (ADR-011 §8, T7.13): the share of `first_try_fit` over the
 * first 50 finished console designs, and their mean cost.
 */
export async function generationQuality(): Promise<{
  counted: number;
  firstTryFit: number;
  meanCostMicros: number | null;
}> {
  const rows = await db
    .select({
      firstTryFit: templateGenerationsTable.firstTryFit,
      costMicros: templateGenerationsTable.costMicros,
    })
    .from(templateGenerationsTable)
    .where(
      and(isNull(templateGenerationsTable.tenantId), eq(templateGenerationsTable.status, "done")),
    )
    .orderBy(templateGenerationsTable.createdAt, templateGenerationsTable.id)
    .limit(GENERATE_QUALITY_RUNS);
  const counted = rows.filter((r) => r.firstTryFit !== null);
  const costs = rows.map((r) => r.costMicros).filter((c): c is number => c !== null);
  return {
    counted: counted.length,
    firstTryFit: counted.filter((r) => r.firstTryFit).length,
    meanCostMicros: costs.length
      ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length)
      : null,
  };
}

/** The platform switch and the quality bar that decide whether clubs see Generate. */
export type ClubGenerateStatus = {
  enabled: boolean;
  configured: boolean;
  quality: Awaited<ReturnType<typeof generationQuality>>;
  barMet: boolean;
  available: boolean;
};

export async function clubGenerateStatus(): Promise<ClubGenerateStatus> {
  const [[settings], quality] = await Promise.all([
    db
      .select({ enabled: platformSettingsTable.clubGenerateEnabled })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.id, 1)),
    generationQuality(),
  ]);
  const enabled = settings?.enabled ?? false;
  const configured = templateAiProvider() !== null;
  const barMet =
    quality.counted >= GENERATE_QUALITY_RUNS &&
    quality.firstTryFit >= GENERATE_QUALITY_TARGET * quality.counted;
  return { enabled, configured, quality, barMet, available: enabled && configured && barMet };
}

/** Turn club Generate on or off (the platform switch). */
export async function setClubGenerateEnabled(enabled: boolean): Promise<void> {
  await db
    .insert(platformSettingsTable)
    .values({ id: 1, clubGenerateEnabled: enabled })
    .onConflictDoUpdate({
      target: platformSettingsTable.id,
      set: { clubGenerateEnabled: enabled },
    });
}
