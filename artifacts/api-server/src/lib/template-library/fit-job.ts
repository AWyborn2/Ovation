/**
 * The server fit job (ADR-011 §4, L2-B, T2.6–T2.7). A library version or a
 * club copy written `pending` (`initialFit()`) is checked on the shared
 * headless browser, behind every waiting card render, and its result written
 * with `writeFitResult`. Every variant draws in one harness page.
 *
 * A check that can't run (no harness, a harness error, a restart mid-check)
 * leaves the target `pending`, so automation stays blocked (ADR-003), and the
 * next scheduled sweep asks again (`retryPendingFits`).
 *
 * Registered at boot only where headless renders can run; elsewhere the
 * store records `pass` with a "skipped" report (`fit.ts`), as before L2-B.
 */
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
} from "@workspace/db";
import type { TemplateFitReport } from "@workspace/scorecard/kind-templates";
import { renderFitCheck } from "../card-video-renderer";
import { canRenderHeadless, serialisedFitCheck } from "../draft-render";
import { logger as appLogger } from "../logger";
import {
  registerFitRunner,
  requestFit,
  writeFitResult,
  type FitRunner,
  type FitTarget,
} from "./fit";

type Logger = Pick<typeof appLogger, "info" | "warn" | "error">;
type FitCheck = (document: unknown, kind: string) => Promise<TemplateFitReport>;

let check: FitCheck = (document, kind) => renderFitCheck(document, kind, null);

/** Test seam: CI has no Chromium, so tests swap the check. */
export function setFitCheck(fn: FitCheck | null): void {
  check = fn ?? ((document, kind) => renderFitCheck(document, kind, null));
}

/** Checks queued or running, so a retry never queues the same target twice. */
const inFlight = new Set<string>();

const targetKey = (t: FitTarget) =>
  t.kind === "libraryVersion"
    ? `v:${t.templateId}:${t.version}`
    : `c:${t.tenantId}:${t.copyId}:${t.version}`;

/** The runner the store calls: queue the check, write the result, or leave it pending. */
export function fitRunner(log: Logger = appLogger): FitRunner {
  return (target, document, kind) => {
    const key = targetKey(target);
    if (inFlight.has(key)) return;
    inFlight.add(key);
    void serialisedFitCheck(() => check(document, kind))
      .then(async (report) => {
        await writeFitResult(target, { status: report.status, report });
        log.info(
          {
            target,
            status: report.status,
            variants: report.variants,
            issues: report.issues.length,
          },
          "template fit check",
        );
      })
      .catch((err) =>
        log.warn(
          { err, target },
          "template fit check didn't run; it stays pending for the next sweep",
        ),
      )
      .finally(() => inFlight.delete(key));
  };
}

/** Wait for every queued check (tests). */
export async function fitChecksSettled(): Promise<void> {
  while (inFlight.size > 0) await new Promise((resolve) => setTimeout(resolve, 10));
}

/** Boot hook: install the fit job where headless renders can run. Returns whether it did. */
export function startFitJob(log: Logger = appLogger): boolean {
  if (!canRenderHeadless()) {
    log.info("template fit checks: no render harness here, so versions and copies are not checked");
    return false;
  }
  registerFitRunner(fitRunner(log));
  return true;
}

/** How many pending checks one sweep queues again. */
export const FIT_RETRIES_PER_SWEEP = 20;

/**
 * Queue again the checks still pending (T2.7): library versions first (they
 * gate listing), then club copies, oldest first. Returns how many were queued.
 */
export async function retryPendingFits(
  limit = FIT_RETRIES_PER_SWEEP,
  log: Logger = appLogger,
): Promise<number> {
  const versions = await db
    .select({
      templateId: libraryTemplateVersionsTable.templateId,
      version: libraryTemplateVersionsTable.version,
      document: libraryTemplateVersionsTable.document,
      kind: libraryTemplatesTable.kind,
    })
    .from(libraryTemplateVersionsTable)
    .innerJoin(
      libraryTemplatesTable,
      eq(libraryTemplatesTable.id, libraryTemplateVersionsTable.templateId),
    )
    .where(eq(libraryTemplateVersionsTable.fitStatus, "pending"))
    .orderBy(asc(libraryTemplateVersionsTable.createdAt))
    .limit(limit);
  let queued = 0;
  for (const v of versions) {
    requestFit(
      { kind: "libraryVersion", templateId: v.templateId, version: v.version },
      v.document,
      v.kind,
    );
    queued += 1;
  }
  if (queued >= limit) return queued;
  const copies = await db
    .select({
      id: cardTemplatesTable.id,
      tenantId: cardTemplatesTable.tenantId,
      version: cardTemplatesTable.version,
      document: cardTemplatesTable.adjustments,
      kind: cardTemplatesTable.baseKind,
    })
    .from(cardTemplatesTable)
    .where(and(eq(cardTemplatesTable.source, "kind"), eq(cardTemplatesTable.fitStatus, "pending")))
    .orderBy(asc(cardTemplatesTable.updatedAt))
    .limit(limit - queued);
  for (const c of copies) {
    if (c.tenantId == null || !c.kind) continue;
    requestFit(
      { kind: "copy", tenantId: c.tenantId, copyId: c.id, version: c.version },
      c.document,
      c.kind,
    );
    queued += 1;
  }
  if (queued > 0) log.info({ queued }, "template fit checks queued again");
  return queued;
}
