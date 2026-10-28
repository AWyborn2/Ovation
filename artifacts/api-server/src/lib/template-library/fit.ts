/**
 * The seam between the template store and the fit check (ADR-011 §4, T2.6,
 * T3.13).
 *
 * The store asks for a fit check whenever a library version is created or a
 * club copy is saved, and records the result on the version or copy
 * (`fit_status`, `fit_report`). The server fit job (L2-B) registers itself
 * here with `registerFitRunner`; it sets `pending`, queues the render and
 * writes the result through `FitTarget`.
 *
 * Until a runner is registered, a request records `pass` with a report saying
 * the check was skipped. That keeps the library usable on the dev stack before
 * L2-B lands. Bundles are fit-checked in CI either way, and the release ships
 * with the runner in place.
 */
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  type TemplateFitReportColumn,
  type TemplateFitStatus,
} from "@workspace/db";
import { logger } from "../logger";
import { followLibraryUpdatesQuietly } from "./follow";

/** What a fit check result is written to. */
export type FitTarget =
  | { kind: "libraryVersion"; templateId: number; version: number }
  | { kind: "copy"; tenantId: number; copyId: number; version: number };

export type FitResult = {
  status: Exclude<TemplateFitStatus, "pending">;
  report: TemplateFitReportColumn;
};

/** Records a fit result on its target. */
export async function writeFitResult(target: FitTarget, result: FitResult): Promise<void> {
  const set = { fitStatus: result.status, fitReport: result.report };
  if (target.kind === "libraryVersion") {
    await db
      .update(libraryTemplateVersionsTable)
      .set(set)
      .where(
        and(
          eq(libraryTemplateVersionsTable.templateId, target.templateId),
          eq(libraryTemplateVersionsTable.version, target.version),
        ),
      );
    if (result.status === "pass") {
      await listPassedClubVersion(target.templateId, target.version);
      // Unedited club copies take the version that just passed.
      await followLibraryUpdatesQuietly([target.templateId]);
    }
    return;
  }
  // A copy saved again since the check started keeps its newer status.
  await db
    .update(cardTemplatesTable)
    .set(set)
    .where(
      and(
        eq(cardTemplatesTable.id, target.copyId),
        eq(cardTemplatesTable.tenantId, target.tenantId),
        eq(cardTemplatesTable.version, target.version),
      ),
    );
}

/**
 * A club-published template is listed once its current version passes
 * (ADR-012 decision 3: no approval queue). Unless the author or Ovation
 * unlisted it since, and only for the version that is still current.
 * Ovation's own templates are listed by hand in the console.
 */
export async function listPassedClubVersion(
  templateId: number,
  version: number,
  tx: Pick<typeof db, "update"> = db,
): Promise<void> {
  await tx
    .update(libraryTemplatesTable)
    .set({ listed: true, listedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(libraryTemplatesTable.id, templateId),
        eq(libraryTemplatesTable.origin, "club"),
        eq(libraryTemplatesTable.currentVersion, version),
        eq(libraryTemplatesTable.listed, false),
        isNull(libraryTemplatesTable.unlistedBy),
      ),
    );
}

/**
 * A fit runner queues a check for `target` (whose status the store has just
 * set to `pending`) and writes the result later with `writeFitResult`.
 */
export type FitRunner = (target: FitTarget, document: unknown, kind: string) => void;

let runner: FitRunner | null = null;

/** Installs the server fit job (L2-B). */
export function registerFitRunner(next: FitRunner | null): void {
  runner = next;
}

export function fitRunnerRegistered(): boolean {
  return runner !== null;
}

/** The report recorded while no fit job is registered. */
export const SKIPPED_FIT_REPORT = {
  skipped: true,
  reason: "The fit check isn't wired to the server yet (L2-B).",
} as const;

/**
 * The fit status a newly written version or copy starts with: `pending` when
 * a runner will check it, else `pass` with the skipped report.
 */
export function initialFit(): {
  fitStatus: TemplateFitStatus;
  fitReport: TemplateFitReportColumn | null;
} {
  return runner
    ? { fitStatus: "pending", fitReport: null }
    : { fitStatus: "pass", fitReport: { ...SKIPPED_FIT_REPORT } };
}

/** Asks for a fit check of `target`, after the store wrote it with `initialFit()`. */
export function requestFit(target: FitTarget, document: unknown, kind: string): void {
  if (!runner) return;
  try {
    runner(target, document, kind);
  } catch (err) {
    // The target stays pending, so automation stays blocked (ADR-003) until a
    // later sweep retries it.
    logger.error({ err, target }, "fit check could not be queued");
  }
}
