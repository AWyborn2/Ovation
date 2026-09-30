import {
  CORRECTABLE_FIELDS,
  isCorrectableField,
  type ClubCorrection as ClubCorrectionRow,
  type CorrectableField,
} from "@workspace/db";
import type {
  CentralCorrectionMatch,
  CentralParticipantMatchLine,
} from "@workspace/db/central-queries";
import {
  beforeBoundary,
  lineFieldValue,
  resolveCorrections,
  type OverlayBoundary,
  type StaleCorrectionReason,
} from "./club-overlay";

/**
 * Club corrections admin (hybrid stats plan U16; R15, KTD7, KTD8).
 *
 * A club admin corrects one central figure on one player's match line. Central
 * is never written: the correction is a row in the tenant's `club_corrections`
 * journal that the club overlay (U10) applies on read. The rules here are the
 * write-side twin of `resolveCorrections`, so a correction can't be BORN
 * stale — everything the overlay would skip is refused up front:
 *
 *   - the match is one of the club's matches (either side), and senior
 *     (juniors isolation — a junior line is never correctable);
 *   - the participant has a line for the club in that match (the overlay's
 *     `not_found`);
 *   - the match isn't before the club's history boundary (`before_boundary`);
 *   - `previousValue` is the central figure now (`mismatch`).
 *
 * Corrections never draft social cards (KTD8): nothing here or in the route
 * touches the draft sweep, its watermark or the drafts tables. The sweep only
 * drafts matches past its match-id watermark, and a correction adds no match.
 */

/** A request the route answers with `status`. */
export interface CorrectionRefusal {
  ok: false;
  status: 400 | 409 | 422;
  error: string;
  /** The central figure now, when the refusal is a mismatch. */
  centralValue?: number;
}

export interface NewCorrectionInput {
  /** The club's match with the requested PlayHQ id (null = not the club's). */
  match: CentralCorrectionMatch | null;
  /** The participant's own line for the club in that match (null = none). */
  line: CentralParticipantMatchLine | null;
  boundaries: readonly OverlayBoundary[];
  field: string;
  previousValue: number;
  newValue: number;
}

/** Validate a new correction against central as it is now. Pure. */
export function checkNewCorrection(
  input: NewCorrectionInput,
): { ok: true; field: CorrectableField; centralValue: number } | CorrectionRefusal {
  const { field, previousValue, newValue } = input;
  if (!isCorrectableField(field)) {
    return { ok: false, status: 400, error: `"${field}" isn't a figure that can be corrected.` };
  }
  for (const [label, v] of [
    ["previous value", previousValue],
    ["corrected value", newValue],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, status: 400, error: `The ${label} must be a whole number, 0 or more.` };
    }
  }
  if (field === "not_out" && (newValue > 1 || previousValue > 1)) {
    return { ok: false, status: 400, error: "Not out is 1 (not out) or 0 (out)." };
  }
  if (newValue === previousValue) {
    return { ok: false, status: 400, error: "The corrected value is the same as the current one." };
  }
  if (!input.match) {
    return { ok: false, status: 422, error: "That match isn't one of this club's matches." };
  }
  if (input.match.grade === null) {
    return {
      ok: false,
      status: 422,
      error: "Junior and pathway matches can't be corrected here.",
    };
  }
  if (!input.line) {
    return {
      ok: false,
      status: 422,
      error: "That player has no batting, bowling or fielding line for this club in that match.",
    };
  }
  if (beforeBoundary(input.boundaries, input.line.grade, input.line.season)) {
    return {
      ok: false,
      status: 422,
      error:
        "That match is before the club's history boundary, so its figures come from the club's own history, not the association's.",
    };
  }
  const centralValue = lineFieldValue(input.line, field);
  if (centralValue !== previousValue) {
    return {
      ok: false,
      status: 409,
      error: `The association figure is now ${centralValue}, not ${previousValue}. Reload the match and try again.`,
      centralValue,
    };
  }
  return { ok: true, field, centralValue };
}

/** Every correctable figure of one line, as central has it now. */
export function lineFigures(
  line: CentralParticipantMatchLine,
): { field: CorrectableField; value: number }[] {
  return CORRECTABLE_FIELDS.map((field) => ({ field, value: lineFieldValue(line, field) }));
}

/** Who made (or removed) a correction, as the journal records it. */
export function correctionActor(admin: { id: number; username: string }): string {
  return `admin:${admin.username}`;
}

export interface CorrectionView {
  id: number;
  playhqMatchId: string;
  participantId: string;
  field: CorrectableField;
  previousValue: number;
  newValue: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
  status: "active" | "stale";
  staleReason: StaleCorrectionReason | null;
  centralValue: number | null;
  displayName: string | null;
  isPrivate: boolean;
  match: (CentralCorrectionMatch & { grade: string }) | null;
}

/**
 * The admin list: each correction in force, `active` or `stale` with the
 * overlay's own reason (U10's `resolveCorrections`, so the list and the read
 * path always agree). Newest first. Pure.
 */
export function describeCorrections(
  rows: readonly ClubCorrectionRow[],
  input: {
    lines: readonly CentralParticipantMatchLine[];
    boundaries: readonly OverlayBoundary[];
    matches: readonly CentralCorrectionMatch[];
    players: ReadonlyMap<string, { displayName: string | null; isPrivate: boolean }>;
  },
): CorrectionView[] {
  const active = rows.filter((r) => r.removedAt === null);
  const resolved = resolveCorrections(
    active.map((r) => ({
      id: r.id,
      playhqMatchId: r.playhqMatchId,
      participantId: r.participantId,
      field: r.field,
      previousValue: r.previousValue,
      newValue: r.newValue,
    })),
    input.lines,
    { canonicalOf: (g) => g, boundaries: input.boundaries },
  );
  const staleById = new Map(resolved.stale.map((s) => [s.id, s]));
  const lineOf = new Map(
    input.lines
      .filter((l) => l.playhqMatchId)
      .map((l) => [`${l.participantId}\u0000${l.playhqMatchId}`, l]),
  );
  const matchOf = new Map(
    input.matches
      .filter((m): m is CentralCorrectionMatch & { playhqMatchId: string } => !!m.playhqMatchId)
      .map((m) => [m.playhqMatchId, m]),
  );
  return [...active]
    .sort((a, b) => b.id - a.id)
    .map((r) => {
      const stale = staleById.get(r.id);
      const line = lineOf.get(`${r.participantId}\u0000${r.playhqMatchId}`);
      const player = input.players.get(r.participantId);
      const m = matchOf.get(r.playhqMatchId);
      return {
        id: r.id,
        playhqMatchId: r.playhqMatchId,
        participantId: r.participantId,
        field: r.field,
        previousValue: r.previousValue,
        newValue: r.newValue,
        note: r.note,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        status: stale ? "stale" : "active",
        staleReason: stale?.reason ?? null,
        centralValue: stale ? stale.centralValue : line ? lineFieldValue(line, r.field) : null,
        displayName: player?.isPrivate ? null : (player?.displayName ?? null),
        isPrivate: player?.isPrivate ?? false,
        match: m && m.grade !== null ? { ...m, grade: m.grade } : null,
      };
    });
}

// ── The store (migration 0021) ─────────────────────────────────────────────

/** The corrections table (migration 0021) isn't in this database yet. */
export class CorrectionsStoreMissingError extends Error {
  readonly status = 503;
  constructor() {
    super(
      "Corrections aren't available yet: this database is missing the club history " +
        "tables (migration 0021).",
    );
    this.name = "CorrectionsStoreMissingError";
  }
}

const UNDEFINED_TABLE = "42P01";

function isUndefinedTable(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    if ((e as { code?: unknown }).code === UNDEFINED_TABLE) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Run a store operation, turning a missing table into {@link CorrectionsStoreMissingError}. */
export async function withCorrectionsStore<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUndefinedTable(err)) throw new CorrectionsStoreMissingError();
    throw err;
  }
}
