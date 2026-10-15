/**
 * Pure (DB-free) helpers for server-side batch carousel-set generation
 * (POST /card-sets/generate). Kept side-effect-free so they unit-test without a
 * database: the route does the I/O (gather source rows) and delegates the
 * slide assembly here. The `matchSummary` path reuses the shared
 * `matchToSummaryInput` builder directly (from @workspace/scorecard) and only
 * needs the assembly/clamp step here; grade-leader sets are retired (plan
 * 2026-10-15-001 R5).
 */

import type { CardSetSlide } from "@workspace/db";

/**
 * Assemble ordered slides from mapped card inputs, clamped to `max`. Extra
 * inputs beyond the cap are dropped (reported via the returned `truncated`
 * count) — the same silent-clamp behaviour as the client's batch "add all"
 * action, but here we also surface how many were cut so the route can log it.
 *
 * Slide ids are deterministic (`gen-1`, `gen-2`, …) so regenerating the same
 * group produces stable ids rather than churning them on every run.
 */
export function assembleSlides(
  inputs: CardSetSlide["input"][],
  max: number,
): { slides: CardSetSlide[]; truncated: number } {
  const capped = inputs.slice(0, max);
  return {
    slides: capped.map((input, i) => ({
      id: `gen-${i + 1}`,
      input,
      themeId: null,
      motionPreset: "none",
    })),
    truncated: Math.max(0, inputs.length - capped.length),
  };
}

// ---------------------------------------------------------------------------
// Auto-seed (C4): derive carousel groups from a round's APPROVED match-summary
// social drafts.
// ---------------------------------------------------------------------------

/**
 * A single approved `matchSummary` draft, annotated with the (season, round,
 * grade, junior) of its source match — the fields the route looks up from the
 * matches table — plus the draft's frozen card `input` (its `cardInput`, already
 * a matchSummary ShareCardInput). Kept DB-free so the grouping logic unit-tests
 * without a database.
 */
export type AutoseedDraft = {
  /** Draft id — only used as a stable tie-breaker when ordering slides. */
  id: number;
  sourceMatchId: number;
  /** From `social_drafts.sourceMatchIsJunior` — junior isolation key. */
  junior: boolean;
  season: number;
  round: number;
  grade: string;
  /** The draft's `cardInput` (opaque ShareCardInput jsonb) — reused as-is. */
  input: CardSetSlide["input"];
};

/** One carousel-worth of same-(season, round, grade, junior) match summaries. */
export type AutoseedGroup = {
  junior: boolean;
  season: number;
  round: number;
  grade: string;
  inputs: CardSetSlide["input"][];
};

/**
 * Group approved match-summary drafts into one carousel per
 * (junior, season, round, grade). Because the junior flag is part of the group
 * key, junior and senior drafts can NEVER land in the same carousel — the
 * juniors-isolation invariant holds by construction (a senior "A Grade" round 5
 * and a junior "A Grade" round 5 stay two distinct groups).
 *
 * Slide order within a group is deterministic (by `sourceMatchId`, then draft
 * id) so regenerating the same round reuses C3's stable `gen-N` slide ids
 * rather than churning them.
 */
export function deriveAutoseedGroups(drafts: AutoseedDraft[]): AutoseedGroup[] {
  const ordered = [...drafts].sort((a, b) => a.sourceMatchId - b.sourceMatchId || a.id - b.id);
  const groups = new Map<string, AutoseedGroup>();
  for (const d of ordered) {
    const key = `${d.junior ? "J" : "S"}|${d.season}|${d.round}|${d.grade}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        junior: d.junior,
        season: d.season,
        round: d.round,
        grade: d.grade,
        inputs: [],
      };
      groups.set(key, g);
    }
    g.inputs.push(d.input);
  }
  return [...groups.values()];
}
