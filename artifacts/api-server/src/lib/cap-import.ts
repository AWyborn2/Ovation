import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, capRegisterTable, tenantsTable } from "@workspace/db";
import { isUndefinedTable, loadCentralCandidates, loadHistoryCandidates } from "./history-import";
import {
  CAP_BATCH_TOKEN_RE,
  CAP_CATEGORY_LABEL,
  capBatchNote,
  capBatchToken,
  capUndoBlockers,
  groupCapBatches,
  parseCapCsv,
  planCapSeed,
  type CapBatchSummary,
  type CapCandidate,
  type CapCategory,
  type CapSeedPlan,
  type PlannedCapSeed,
} from "./cap-import-core";

/**
 * Cap register CSV import (the console version of scripts/seed-cap-register):
 * a platform admin previews, commits and undoes a club's A Grade (male) and
 * Female A Grade cap numbering. The rules (exact-name linking, refuse a list
 * that already has caps, one number and one name per list) are cap-import-core.
 *
 * No new table: a batch is marked in each cap's `cap_note` ("CSV import
 * [<token>] <label>"), so the batch list is a grouping of those notes and undo
 * deletes exactly the caps carrying the marker, refusing when a later cap has
 * been issued after them (the numbering would break). A cap whose note an admin
 * has edited is no longer part of the batch and is never deleted by undo.
 *
 * Nothing here runs the Social Studio sweep or writes drafts or milestone events.
 */

export interface CapImportPreviewResult {
  rowCount: number;
  errors: string[];
  refusedCategories: CapSeedPlan["refusedCategories"];
  caps: PlannedCapSeed[];
  centralUnavailable: string | null;
}

export interface CapImportCommitResult {
  batchId: string;
  label: string;
  written: number;
  linked: number;
  unlinked: number;
}

export interface CapImportUndoResult {
  batchId: string;
  capsRemoved: number;
}

/** An import request the route answers with `status` (and the preview, when there is one). */
export class CapImportError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly preview?: CapImportPreviewResult,
  ) {
    super(message);
    this.name = "CapImportError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/** The tenant's players a cap can link to: its central players and any pre-digital ones. */
export async function loadCapCandidates(
  tenantId: number,
): Promise<{ candidates: CapCandidate[]; centralUnavailable: string | null }> {
  const [tenant] = await db
    .select({ centralClubId: tenantsTable.centralClubId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) throw new CapImportError(404, "No such tenant");

  const candidates: CapCandidate[] = [];
  let centralUnavailable: string | null = null;
  try {
    candidates.push(...(await loadCentralCandidates(tenantId, tenant.centralClubId)));
  } catch (err) {
    centralUnavailable = err instanceof Error ? err.message : String(err);
  }
  try {
    candidates.push(...(await loadHistoryCandidates(tenantId)));
  } catch (err) {
    // A database without the club-history tables simply has no pre-digital players.
    if (!isUndefinedTable(err)) throw err;
  }
  return { candidates, centralUnavailable };
}

/** How many caps the tenant's register already holds, per list. */
export async function existingCapCounts(
  reader: Reader,
  tenantId: number,
): Promise<Record<CapCategory, number>> {
  const rows = await reader
    .select({ category: capRegisterTable.category, n: sql<number>`count(*)::int` })
    .from(capRegisterTable)
    .where(eq(capRegisterTable.tenantId, tenantId))
    .groupBy(capRegisterTable.category);
  const out: Record<CapCategory, number> = { male: 0, female: 0 };
  for (const r of rows) if (r.category === "male" || r.category === "female") out[r.category] = r.n;
  return out;
}

/** Write planned caps (confirmed, linked where matched) inside the caller's transaction. */
export async function writeCaps(
  tx: Tx,
  tenantId: number,
  caps: readonly PlannedCapSeed[],
  note: string,
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < caps.length; i += 500) {
    const rows = await tx
      .insert(capRegisterTable)
      .values(
        caps.slice(i, i + 500).map((c) => ({
          tenantId,
          capNumber: c.capNumber,
          category: c.category,
          name: c.name,
          deceased: false,
          inStats: c.playerId !== null,
          gamesAGrade: c.games,
          playerId: c.playerId,
          capNote: note,
          autoCreated: false,
          status: "confirmed",
        })),
      )
      .returning({ id: capRegisterTable.id });
    ids.push(...rows.map((r) => r.id));
  }
  return ids;
}

function buildPreview(
  plan: CapSeedPlan,
  parseErrors: string[],
  centralUnavailable: string | null,
): CapImportPreviewResult {
  const errors = [...parseErrors, ...plan.errors];
  for (const r of plan.refusedCategories) {
    errors.push(
      `The ${CAP_CATEGORY_LABEL[r.category]} list already has ${r.existing} cap(s), so it can't be ` +
        "seeded again. Remove those rows from the file, or clear the existing caps first.",
    );
  }
  return {
    rowCount: plan.caps.length,
    errors,
    refusedCategories: plan.refusedCategories,
    caps: plan.caps,
    centralUnavailable,
  };
}

/** Parse, validate and preview a cap CSV for a tenant. Writes nothing. */
export async function previewCapImport(
  tenantId: number,
  csv: string,
): Promise<CapImportPreviewResult> {
  const parsed = parseCapCsv(csv);
  const { candidates, centralUnavailable } = await loadCapCandidates(tenantId);
  if (parsed.errors.length > 0) {
    return buildPreview(
      { errors: [], refusedCategories: [], caps: [] },
      parsed.errors,
      centralUnavailable,
    );
  }
  const plan = planCapSeed({
    rows: parsed.rows,
    candidates,
    existing: await existingCapCounts(db, tenantId),
  });
  return buildPreview(plan, [], centralUnavailable);
}

export interface CommitCapImportInput {
  tenantId: number;
  csv: string;
  label: string;
  /** Test seam: the batch's timestamp (default: now). */
  now?: Date;
}

/**
 * Validate the file again (never trust a stale preview) and write it as one
 * batch. Throws {@link CapImportError}: 400 for a missing label, 422 with the
 * preview when the file has errors, 409 when a list was filled meanwhile.
 */
export async function commitCapImport(input: CommitCapImportInput): Promise<CapImportCommitResult> {
  const label = input.label.replace(/\s+/g, " ").trim();
  if (!label) throw new CapImportError(400, "A label is required.");
  const preview = await previewCapImport(input.tenantId, input.csv);
  if (preview.errors.length > 0) {
    throw new CapImportError(422, "The file has errors; fix them and upload it again.", preview);
  }
  if (preview.caps.length === 0) {
    throw new CapImportError(422, "There is nothing to import.", preview);
  }
  const token = capBatchToken(input.now ?? new Date());
  const note = capBatchNote(token, label);
  const lists = [...new Set(preview.caps.map((c) => c.category))];

  const ids = await db.transaction(async (tx) => {
    // Re-check inside the transaction: a list may have been filled since the preview.
    const taken = await existingCapCounts(tx, input.tenantId);
    const clash = lists.find((c) => taken[c] > 0);
    if (clash) {
      throw new CapImportError(
        409,
        `The ${CAP_CATEGORY_LABEL[clash]} list changed since the preview; nothing was written. Preview again.`,
      );
    }
    return writeCaps(tx, input.tenantId, preview.caps, note);
  });

  const linked = preview.caps.filter((c) => c.playerId !== null).length;
  return { batchId: token, label, written: ids.length, linked, unlinked: ids.length - linked };
}

/** A tenant's cap import batches, newest first. */
export async function listCapBatches(tenantId: number): Promise<CapBatchSummary[]> {
  const rows = await db
    .select({
      category: capRegisterTable.category,
      capNumber: capRegisterTable.capNumber,
      playerId: capRegisterTable.playerId,
      capNote: capRegisterTable.capNote,
    })
    .from(capRegisterTable)
    .where(
      and(eq(capRegisterTable.tenantId, tenantId), like(capRegisterTable.capNote, "CSV import [%")),
    );
  return groupCapBatches(rows);
}

/**
 * Undo one batch: delete the caps carrying its marker. Refused (409) when a
 * later cap exists in the same list: undoing would leave a gap in the numbering
 * and the caps issued since would no longer follow on.
 */
export async function undoCapBatch(
  tenantId: number,
  batchId: string,
): Promise<CapImportUndoResult> {
  if (!CAP_BATCH_TOKEN_RE.test(batchId)) throw new CapImportError(400, "Invalid batch id");
  return db.transaction(async (tx) => {
    const batch = await tx
      .select({
        id: capRegisterTable.id,
        category: capRegisterTable.category,
        capNumber: capRegisterTable.capNumber,
      })
      .from(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, tenantId),
          like(capRegisterTable.capNote, `CSV import [${batchId}] %`),
        ),
      );
    if (batch.length === 0)
      throw new CapImportError(404, "No such cap import batch for this club.");

    const lists = [...new Set(batch.map((c) => c.category))];
    const inBatch = new Set(batch.map((c) => c.id));
    const others = (
      await tx
        .select({
          id: capRegisterTable.id,
          category: capRegisterTable.category,
          capNumber: capRegisterTable.capNumber,
        })
        .from(capRegisterTable)
        .where(
          and(eq(capRegisterTable.tenantId, tenantId), inArray(capRegisterTable.category, lists)),
        )
    ).filter((c) => !inBatch.has(c.id));

    const blockers = capUndoBlockers(batch, others);
    if (blockers.length > 0) {
      throw new CapImportError(
        409,
        `This batch can't be undone: ${blockers.join(" ")} Delete those caps first, or fix the numbering by hand.`,
      );
    }
    const removed = await tx
      .delete(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, tenantId),
          inArray(
            capRegisterTable.id,
            batch.map((c) => c.id),
          ),
        ),
      )
      .returning({ id: capRegisterTable.id });
    return { batchId, capsRemoved: removed.length };
  });
}
