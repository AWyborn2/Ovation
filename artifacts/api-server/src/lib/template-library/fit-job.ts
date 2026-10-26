/**
 * The server fit job (ADR-011 §4, L2-B, T2.6–T2.7). A library version or a
 * club copy written `pending` (`initialFit()`) is checked on the shared
 * headless browser, behind every waiting card render, and its result written
 * with `writeFitResult`. Every variant draws in one harness page.
 *
 * A check that can't run (no harness, a harness error, a restart mid-check)
 * is tried again a few times; one that still can't leaves the target
 * `pending`, so automation stays blocked (ADR-003), and the next scheduled
 * sweep asks again (`retryPendingFits`).
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

/**
 * How often a check that couldn't run is tried again before it waits for the
 * sweep, and the first wait (doubled each time). At boot the bundle sync
 * queues checks before the harness may be up (the local dev stack starts the
 * web app after the API), and the scheduled sweep is an hour away, or never
 * comes locally.
 */
export const FIT_RUN_RETRIES = 3;
export const FIT_RETRY_DELAY_MS = 30_000;

export type FitRunnerOptions = { retries?: number; retryDelayMs?: number };

/** The runner the store calls: queue the check, write the result, or leave it pending. */
export function fitRunner(log: Logger = appLogger, opts: FitRunnerOptions = {}): FitRunner {
  const retries = opts.retries ?? FIT_RUN_RETRIES;
  const retryDelayMs = opts.retryDelayMs ?? FIT_RETRY_DELAY_MS;
  return (target, document, kind) => {
    const key = targetKey(target);
    if (inFlight.has(key)) return;
    inFlight.add(key);
    const attempt = (n: number): void => {
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
          inFlight.delete(key);
        })
        .catch((err) => {
          if (n < retries) {
            const wait = retryDelayMs * 2 ** n;
            log.info({ err, target, wait }, "template fit check didn't run; trying again");
            setTimeout(() => attempt(n + 1), wait).unref();
            return;
          }
          log.warn(
            { err, target },
            "template fit check didn't run; it stays pending for the next sweep",
          );
          inFlight.delete(key);
        });
    };
    attempt(0);
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

/**
 * How many pending checks one sweep queues again. A check takes about 3 s, so
 * 100 is about five minutes of harness time an hour, behind card renders.
 */
export const FIT_RETRIES_PER_SWEEP = 100;

/**
 * How many pending checks a restart queues again: all of them, in practice.
 * The bundle sync only asks for versions it has just added, so without this a
 * library left pending (a first publish whose checks outran the harness)
 * waited for the hourly sweep to work through it.
 */
export const FIT_RETRIES_AT_BOOT = 1000;

/** Boot hook, after the bundle sync: queue every check still pending. Logs, never throws. */
export async function retryPendingFitsAtBoot(log: Logger = appLogger): Promise<number> {
  try {
    return await retryPendingFits(FIT_RETRIES_AT_BOOT, log);
  } catch (err) {
    log.error({ err }, "template fit checks: couldn't queue the pending ones at boot");
    return 0;
  }
}

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
