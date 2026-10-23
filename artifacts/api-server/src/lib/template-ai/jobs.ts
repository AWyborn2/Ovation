/**
 * AI designer jobs (ADR-011 §8, T7.8): one `template_generations` row per
 * design, worked in-process and polled by the console.
 *
 * - A job runs one at a time behind the others (a design takes minutes).
 * - Its result is always saved, as an unlisted console template in the
 *   library, with its fit report (T7.7), when any reply validated.
 * - A job that was queued or running when the server stopped is marked failed
 *   at the next start (`failInterruptedGenerations`).
 * - Tokens, cost, attempts, `first_try_fit` and the outcome are recorded on
 *   the row; the console's quality figure reads them (T7.13).
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateGenerationsTable,
  type TemplateGenerationRow,
} from "@workspace/db";
import type { TemplateDocumentV2, TemplateFitReport } from "@workspace/scorecard/kind-templates";
import { renderFitCheck } from "../card-video-renderer";
import { canRenderHeadless, serialisedFitCheck } from "../draft-render";
import { logger } from "../logger";
import { documentCoverage } from "../template-library/coverage";
import { initialFit, requestFit } from "../template-library/fit";
import { designTemplate, type DesignResult, type FitCheckFn } from "./generate";
import type { DesignInput } from "./prompt";
import { TEMPLATE_AI_MODEL, templateAiProvider, type TemplateAiProvider } from "./provider";

/** The outcomes a finished job records. */
export type GenerationOutcome = DesignResult["outcome"] | "provider_error";

/** The last errors of jobs this server ran (not persisted: a restart forgets them). */
const lastErrors = new Map<number, string[]>();

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

let chain: Promise<void> = Promise.resolve();
let pending = 0;

/** Wait for every queued job (tests). */
export async function generationsSettled(): Promise<void> {
  while (pending > 0) await chain;
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

async function run(
  id: number,
  input: DesignInput,
  provider: TemplateAiProvider,
  adminId: number | null,
) {
  await db
    .update(templateGenerationsTable)
    .set({ status: "running" })
    .where(eq(templateGenerationsTable.id, id));
  let result: DesignResult;
  try {
    result = await designTemplate(input, { provider, fit: fitCheck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastErrors.set(id, [`The designer couldn't reach the model: ${message.slice(0, 200)}`]);
    logger.warn({ err, generation: id }, "AI designer: provider error");
    await db
      .update(templateGenerationsTable)
      .set({ status: "failed", outcome: "provider_error", finishedAt: new Date() })
      .where(eq(templateGenerationsTable.id, id));
    return;
  }
  let resultRef: Record<string, number> | null = null;
  if (result.document) {
    resultRef = await saveConsoleDesign({
      kind: input.kind,
      name: designName(input.kind, input.brief),
      document: result.document,
      fitReport: result.fitReport,
      adminId,
    });
  }
  lastErrors.set(id, result.errors);
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
      finishedAt: new Date(),
    })
    .where(eq(templateGenerationsTable.id, id));
  logger.info(
    {
      generation: id,
      kind: input.kind,
      outcome: result.outcome,
      attempts: result.attempts,
      costMicros: result.usage.costMicros,
    },
    "AI designer: design finished",
  );
}

/**
 * Start a design for the platform console (tenant null). Returns the queued
 * row; the design runs behind any already queued. Throws when the designer
 * isn't configured.
 */
export async function startGeneration(opts: {
  input: DesignInput;
  adminId: number | null;
  imageSha256?: string | null;
}): Promise<TemplateGenerationRow> {
  const provider = templateAiProvider();
  if (!provider) throw new Error("The AI designer isn't configured (no ANTHROPIC_API_KEY).");
  const [row] = await db
    .insert(templateGenerationsTable)
    .values({
      tenantId: null,
      adminId: opts.adminId,
      kind: opts.input.kind,
      model: TEMPLATE_AI_MODEL,
      status: "queued",
    })
    .returning();
  // Only the image's hash is kept, here in the logs.
  logger.info(
    { generation: row!.id, kind: opts.input.kind, image: opts.imageSha256 ?? null },
    "AI designer: design queued",
  );
  pending++;
  chain = chain
    .then(() => run(row!.id, opts.input, provider, opts.adminId))
    .catch((err: unknown) => logger.error({ err, generation: row!.id }, "AI designer: job failed"))
    .finally(() => {
      pending--;
    });
  return row!;
}

/** Boot hook: a job queued or running when the server stopped won't finish, so mark it failed. */
export async function failInterruptedGenerations(): Promise<number> {
  const rows = await db
    .update(templateGenerationsTable)
    .set({ status: "failed", outcome: "provider_error", finishedAt: new Date() })
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

/** The errors a finished job's last reply had, while this server remembers them. */
export function generationErrors(id: number): string[] {
  return lastErrors.get(id) ?? [];
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
    .limit(50);
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
