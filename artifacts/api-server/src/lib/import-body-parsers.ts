import { FINALS_STAGES, type FinalsStage } from "./match-scorecard";
import { nameKey } from "./name-match";

/**
 * Pure parsers for the untrusted request bodies the import routes accept.
 *
 * Extracted from routes/imports.ts, which interleaved these coercion helpers
 * among its large route handlers. They take `unknown` bodies and defend the
 * commit/reconcile endpoints against malformed input — no db, no request
 * object — so importing them back into the router cannot create a cycle.
 */
export type PlayerResolution =
  | { action: "link"; playerId: number }
  | { action: "create" };

/**
 * Parse the optional `resolutions` array from a commit request body into a map
 * keyed by the canonical name key, so the parsed row a resolution refers to can
 * be looked up unambiguously. Invalid/partial entries are ignored.
 */
export function buildResolutionMap(body: unknown): Map<string, PlayerResolution> {
  const map = new Map<string, PlayerResolution>();
  const list = (body as { resolutions?: unknown } | null)?.resolutions;
  if (!Array.isArray(list)) return map;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const { surname, givenName, action, playerId } = r as Record<
      string,
      unknown
    >;
    if (typeof surname !== "string" || typeof givenName !== "string") continue;
    const key = nameKey(surname, givenName);
    if (action === "link" && typeof playerId === "number") {
      map.set(key, { action: "link", playerId });
    } else if (action === "create") {
      map.set(key, { action: "create" });
    }
  }
  return map;
}

/**
 * Read an optional `round` override from a commit request body.
 * Returns `undefined` when the field is absent (caller should fall back to the
 * parsed/header value), `null` when explicitly cleared, or the integer round.
 * Non-integer junk is treated as absent.
 */
export function parseCommitRound(body: unknown): number | null | undefined {
  if (!body || typeof body !== "object" || !("round" in body)) return undefined;
  const r = (body as { round?: unknown }).round;
  if (r == null) return null;
  const n = typeof r === "number" ? r : parseInt(String(r), 10);
  return Number.isInteger(n) ? n : undefined;
}

/** Narrow an arbitrary value to a known finals stage, else null. */
export function coerceStage(v: unknown): FinalsStage | null {
  return typeof v === "string" && (FINALS_STAGES as readonly string[]).includes(v)
    ? (v as FinalsStage)
    : null;
}

/**
 * Read an optional finals `stage` override from a commit request body.
 * Returns `undefined` when absent, `null` when explicitly cleared, or the
 * recognised finals stage. Unknown strings are treated as cleared (null).
 */
export function parseCommitStage(body: unknown): FinalsStage | null | undefined {
  if (!body || typeof body !== "object" || !("stage" in body)) return undefined;
  const s = (body as { stage?: unknown }).stage;
  if (s == null) return null;
  return coerceStage(s);
}

/**
 * Enforce the round XOR stage invariant for a match identity: a finals stage
 * always wins and forces round to null; otherwise stage is null and the round
 * (possibly null) stands. The DB identity is (grade, season, round, stage) with
 * NULLS NOT DISTINCT, so exactly one of round/stage should be set per match.
 */
export function normalizeRoundStage(
  round: number | null,
  stage: FinalsStage | null,
): { round: number | null; stage: FinalsStage | null } {
  if (stage != null) return { round: null, stage };
  return { round: round ?? null, stage: null };
}
