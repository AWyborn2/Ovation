import JSZip from "jszip";
import { eq, and, inArray } from "drizzle-orm";
import { db, playersTable, matchesTable } from "@workspace/db";
import type { ParsedMatch, FinalsStage } from "./match-scorecard";
import { nameKey, type RosterPlayer } from "./name-match";
import { coerceStage, normalizeRoundStage, type PlayerResolution } from "./import-body-parsers";
import type { ReconcileMode, NegativeBaselineWarning } from "./baseline-reconcile";

/**
 * Shared helpers for the import routes: player-roster resolution, backfill
 * warning enrichment, and the whole-season batch classification pipeline.
 *
 * Extracted from routes/imports.ts, which interleaved these among its large
 * route handlers. Everything here is handler-agnostic — no request/response
 * objects — so importing them back into the router cannot create a cycle.
 */

/** Per-player backfill net-effect figures returned in import previews. */
export type BackfillFigures = {
  seasonGames: number;
  seasonRuns: number;
  seasonWickets: number;
  baselineGames: number;
  baselineRuns: number;
  baselineWickets: number;
  careerGames: number;
  careerRuns: number;
  careerWickets: number;
};

/** A committed negative-baseline warning enriched with the player's name. */
export type NamedNegativeWarning = NegativeBaselineWarning & {
  surname: string;
  givenName: string;
};

/**
 * Parse the optional `reconcileMode` from a commit body. Its presence marks the
 * import as a PREVIOUS-season backfill (suppress social, no out-of-order caps).
 */
export function parseReconcileMode(body: unknown): ReconcileMode | undefined {
  const v = (body as { reconcileMode?: unknown } | null)?.reconcileMode;
  return v === "peel" || v === "add" ? v : undefined;
}

/** Look up names for negative-baseline warnings so the UI can show who. */
export async function nameNegativeWarnings(
  warnings: NegativeBaselineWarning[],
): Promise<NamedNegativeWarning[]> {
  if (warnings.length === 0) return [];
  const ids = Array.from(new Set(warnings.map((w) => w.playerId)));
  const rows = await db
    .select({
      id: playersTable.id,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
    })
    .from(playersTable)
    .where(inArray(playersTable.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return warnings.map((w) => ({
    ...w,
    surname: byId.get(w.playerId)?.surname ?? "",
    givenName: byId.get(w.playerId)?.givenName ?? "",
  }));
}

/** Load the full roster as matcher input. */
export async function loadRoster(): Promise<RosterPlayer[]> {
  return db
    .select({
      id: playersTable.id,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
    })
    .from(playersTable);
}

/**
 * Resolve every parsed match player to a player id, honouring the admin's
 * preview resolutions (link to existing / create new); names without a
 * resolution fall back to exact-match-or-create. Returns the parsed players
 * augmented with their `playerId`.
 */
export async function resolveMatchPlayers(
  players: ParsedMatch["players"],
  resolutions: Map<string, PlayerResolution>,
): Promise<Array<ParsedMatch["players"][number] & { playerId: number }>> {
  const allPlayers = await loadRoster();
  const playerByKey = new Map<string, number>();
  for (const p of allPlayers) {
    playerByKey.set(nameKey(p.surname, p.givenName), p.id);
  }
  const createdByKey = new Map<string, number>();
  const createPlayer = async (surname: string, givenName: string, key: string) => {
    const cached = createdByKey.get(key);
    if (cached != null) return cached;
    const [created] = await db
      .insert(playersTable)
      .values({ surname, givenName })
      .returning({ id: playersTable.id });
    createdByKey.set(key, created.id);
    return created.id;
  };

  const resolved: Array<ParsedMatch["players"][number] & { playerId: number }> = [];
  for (const p of players) {
    const key = nameKey(p.surname, p.givenName);
    const resolution = resolutions.get(key);
    let pid: number;
    if (resolution?.action === "link") {
      pid = resolution.playerId;
    } else if (resolution?.action === "create") {
      pid = await createPlayer(p.surname, p.givenName, key);
    } else {
      pid = playerByKey.get(key) ?? (await createPlayer(p.surname, p.givenName, key));
    }
    resolved.push({ ...p, playerId: pid });
  }
  return resolved;
}

/** Per-file outcome in a batch. Committable: ready | abandoned | duplicate. */
export type BatchFileStatus =
  | "ready"
  | "abandoned"
  | "duplicate"
  | "duplicateInBatch"
  | "missingRound"
  | "needsResolution"
  | "unmappableGrade"
  | "parseError";

/** A single uploaded scorecard, parsed (or with a parse error). */
export type BatchCandidate = {
  filename: string;
  parsed: ParsedMatch | null;
  error: string | null;
};

export type ClassifiedFile = {
  candidate: BatchCandidate;
  status: BatchFileStatus;
  committable: boolean;
  matchExists: boolean;
  grade: string | null;
  season: number | null;
  round: number | null;
  stage: FinalsStage | null;
};

/** Admin's per-file round/stage assignment for needsResolution batch files. */
export type BatchFileResolution = {
  filename: string;
  round: number | null;
  stage: FinalsStage | null;
};

/** Parse the optional `fileResolutions` array from a batch commit body. */
export function parseFileResolutions(body: unknown): Map<string, BatchFileResolution> {
  const map = new Map<string, BatchFileResolution>();
  if (!body || typeof body !== "object") return map;
  const raw = (body as { fileResolutions?: unknown }).fileResolutions;
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const filename = (entry as { filename?: unknown }).filename;
    if (typeof filename !== "string") continue;
    const stage = coerceStage((entry as { stage?: unknown }).stage);
    const r = (entry as { round?: unknown }).round;
    const roundNum = r == null ? null : typeof r === "number" ? r : parseInt(String(r), 10);
    const round = Number.isInteger(roundNum as number) ? (roundNum as number) : null;
    const norm = normalizeRoundStage(round, stage);
    map.set(filename, { filename, round: norm.round, stage: norm.stage });
  }
  return map;
}

/**
 * Expand uploaded files into individual scorecard buffers: a `.zip` is unpacked
 * to its `.xlsx` entries, a `.xlsx` is taken as-is, anything else is ignored.
 */
export async function expandUploads(
  files: Express.Multer.File[],
): Promise<Array<{ filename: string; buffer: Buffer }>> {
  const out: Array<{ filename: string; buffer: Buffer }> = [];
  for (const f of files) {
    const lower = f.originalname.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(f.buffer);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const name = entry.name;
        if (name.startsWith("__MACOSX")) continue;
        if (!name.toLowerCase().endsWith(".xlsx")) continue;
        const buf = await entry.async("nodebuffer");
        out.push({ filename: name.split("/").pop() || name, buffer: buf });
      }
    } else if (lower.endsWith(".xlsx")) {
      out.push({ filename: f.originalname, buffer: f.buffer });
    }
  }
  return out;
}

/**
 * Classify each parsed candidate into a commit decision. A file is committable
 * when it parsed, maps to a grade+season, carries a round, and isn't a duplicate
 * of an earlier committable file in the same batch. A file whose grade+season+
 * round already exists in the DB is "duplicate" (committable — it replaces the
 * stored match), unless the scorecard itself is abandoned, in which case
 * "abandoned" takes priority — `matchExists` is still reported on the file so
 * callers know it will replace a stored match either way. Ordering matters:
 * the FIRST file for a given round wins; later ones become `duplicateInBatch`.
 */
export async function classifyBatchFiles(
  candidates: BatchCandidate[],
  fileResolutions: Map<string, BatchFileResolution> = new Map(),
): Promise<ClassifiedFile[]> {
  // The effective (round, stage) of a file: its parsed identity unless the admin
  // supplied a resolution for it (which then determines the identity).
  const effectiveIdentity = (
    c: BatchCandidate,
  ): { round: number | null; stage: FinalsStage | null } => {
    const res = fileResolutions.get(c.filename);
    if (res) return { round: res.round, stage: res.stage };
    const p = c.parsed;
    return normalizeRoundStage(p?.round ?? null, p?.stage ?? null);
  };

  // Existing (grade, season, round, stage) identities in the DB for fast
  // duplicate checks, scoped to the (grade, season) pairs present in the batch.
  const validKeys = new Set<string>();
  for (const c of candidates) {
    const p = c.parsed;
    if (p && p.grade && p.season != null) {
      const id = effectiveIdentity(c);
      if (id.round != null || id.stage != null) validKeys.add(`${p.grade}|${p.season}`);
    }
  }
  const idKey = (round: number | null, stage: FinalsStage | null): string =>
    stage != null ? `s:${stage}` : `r:${round}`;
  const existing = new Set<string>();
  for (const gs of validKeys) {
    const [grade, seasonStr] = gs.split("|");
    const season = parseInt(seasonStr, 10);
    const rows = await db
      .select({ round: matchesTable.round, stage: matchesTable.stage })
      .from(matchesTable)
      .where(and(eq(matchesTable.grade, grade), eq(matchesTable.season, season)));
    for (const r of rows) {
      if (r.round != null || r.stage != null) {
        existing.add(`${grade}|${season}|${idKey(r.round, r.stage as FinalsStage | null)}`);
      }
    }
  }

  const seenInBatch = new Set<string>();
  const out: ClassifiedFile[] = [];
  for (const c of candidates) {
    const p = c.parsed;
    if (!p || c.error) {
      out.push({
        candidate: c,
        status: "parseError",
        committable: false,
        matchExists: false,
        grade: null,
        season: null,
        round: null,
        stage: null,
      });
      continue;
    }
    const grade = p.grade;
    const season = p.season;
    const id = effectiveIdentity(c);
    const round = id.round;
    const stage = id.stage;
    if (!grade || season == null) {
      out.push({
        candidate: c,
        status: "unmappableGrade",
        committable: false,
        matchExists: false,
        grade,
        season,
        round,
        stage,
      });
      continue;
    }
    // Neither a numeric round nor a recognised finals stage — the admin must
    // assign one via fileResolutions before this file can be committed.
    if (round == null && stage == null) {
      out.push({
        candidate: c,
        status: "needsResolution",
        committable: false,
        matchExists: false,
        grade,
        season,
        round,
        stage,
      });
      continue;
    }
    const key = `${grade}|${season}|${idKey(round, stage)}`;
    if (seenInBatch.has(key)) {
      out.push({
        candidate: c,
        status: "duplicateInBatch",
        committable: false,
        matchExists: existing.has(key),
        grade,
        season,
        round,
        stage,
      });
      continue;
    }
    seenInBatch.add(key);
    const matchExists = existing.has(key);
    const status: BatchFileStatus = p.abandoned ? "abandoned" : matchExists ? "duplicate" : "ready";
    out.push({
      candidate: c,
      status,
      committable: true,
      matchExists,
      grade,
      season,
      round,
      stage,
    });
  }
  return out;
}

/**
 * Map a classified batch file to the wire shape returned by the upload preview
 * and the revalidate endpoint (both must agree so the UI can swap one for the
 * other). `round`/`stage` reflect the EFFECTIVE identity (after any admin
 * resolution), while the remaining header fields come from the parsed scorecard.
 */
export function toBatchFileDto(c: ClassifiedFile) {
  const p = c.candidate.parsed;
  return {
    filename: c.candidate.filename,
    status: c.status,
    committable: c.committable,
    grade: p?.grade ?? null,
    season: p?.season ?? null,
    round: c.round,
    stage: c.stage,
    competition: p?.competition ?? null,
    matchDate: p?.matchDate ?? null,
    venue: p?.venue ?? null,
    result: p?.result ?? null,
    opponent: p?.opponent ?? null,
    hhccScore: p?.hhccScore ?? null,
    opponentScore: p?.opponentScore ?? null,
    abandoned: p?.abandoned ?? false,
    matchExists: c.matchExists,
    playerCount: p?.players.length ?? 0,
    warnings: p?.warnings ?? [],
    error: c.candidate.error,
  };
}
