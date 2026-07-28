/**
 * Card-forms pure logic (U8).
 *
 * The builder edits each card as a plain form-state object that is exactly the
 * card's `ShareCardInput` minus its `kind` discriminant. Keeping state === input
 * (numbers stay numbers, rows stay typed) means the build step is a trivial,
 * pure re-attachment of `kind` (+ the forced junior flag) — no coercion layer —
 * and every field is directly editable (R14).
 *
 * This module is DOM-free and framework-free so the form→input assembly can be
 * unit-tested without rendering any React.
 */

import type { CardKind, ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";

/** Editable form state for a card: its input shape without the `kind` tag. */
export type CardFormState = Record<string, unknown>;

/**
 * Card kinds that carry a `junior` flag in their `ShareCardInput`. Only these
 * may be forced into the junior brown palette; the junior toggle is hidden for
 * every other kind (R20).
 */
export const JUNIOR_CAPABLE: ReadonlySet<CardKind> = new Set<CardKind>([
  "milestone",
  "matchSummary",
  "matchDay",
  "teamList",
  "weekendWrap",
  "ladder",
  "bigMoment",
  "clubLeaderboard",
]);

/**
 * Repeat-driven kinds and their template row caps. The builder disables adding
 * rows past the cap, and the build step defensively truncates so an
 * over-long prefill can never overflow the pack template (A7 ladder ≤7,
 * A4 team list ≤12, A6 weekend wrap 4, A19/A20 club leaderboard 4).
 */
export const ROW_CAPS: Partial<Record<CardKind, { key: string; cap: number; min: number }>> = {
  teamList: { key: "players", cap: 12, min: 1 },
  ladder: { key: "rows", cap: 7, min: 1 },
  weekendWrap: { key: "matches", cap: 4, min: 1 },
  clubLeaderboard: { key: "leaders", cap: 4, min: 1 },
  // player stats are a fixed trio (A3); treated as a capped repeat for a
  // uniform editor.
  player: { key: "stats", cap: 3, min: 1 },
};

/**
 * The starting editable state for a kind: its representative sample minus the
 * `kind` tag. Seeding from the sample guarantees a valid, immediately-previewed
 * card that the admin then edits or prefills over.
 */
export function initialCardState(kind: CardKind, clubName?: string | null): CardFormState {
  // `clubName` makes the seed speak as the tenant ("Mandurah won by …") rather
  // than a generic club — see `sampleCardInput`. The admin edits over it either
  // way; this just makes the starting point theirs.
  const sample = sampleCardInput(kind, clubName) as Record<string, unknown>;
  const clone = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>;
  delete clone.kind;
  return clone;
}

/**
 * Re-attach `kind` (and the forced junior flag for junior-capable kinds) to
 * assemble a valid `ShareCardInput`. Row arrays are truncated to their template
 * caps.
 */
export function buildCardInput(
  kind: CardKind,
  state: CardFormState,
  junior: boolean,
): ShareCardInput {
  const next: Record<string, unknown> = { ...state };
  const cap = ROW_CAPS[kind];
  if (cap) {
    const arr = next[cap.key];
    if (Array.isArray(arr) && arr.length > cap.cap) {
      next[cap.key] = arr.slice(0, cap.cap);
    }
  }
  const out: Record<string, unknown> = { kind, ...next };
  if (JUNIOR_CAPABLE.has(kind) && junior) {
    out.junior = true;
  } else {
    // Never leak a junior flag onto a senior card.
    delete out.junior;
  }
  return out as unknown as ShareCardInput;
}
