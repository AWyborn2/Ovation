/**
 * Pure helpers + option lists for the stats import page (plan.md §5.6 split).
 * Nothing here touches React state; the hooks under this directory compose them.
 */

import { MatchStage } from "@workspace/api-client-react";
import type {
  NameMatchCandidate,
  PlayerResolution,
  BatchFileResolution,
} from "@workspace/api-client-react";
import type { SelectedPlayer } from "@/components/player-typeahead";

export type Mode = "csv" | "match" | "batch";

/** An admin's decision for a previewed name, held in local state. */
export type RowResolution = { action: "link"; player: SelectedPlayer } | { action: "create" };

export type ReconcileMode = "peel" | "add";

/** The per-file Round / Final choice an admin makes for a batch file. */
export type FileResolutionEntry = { round: string; stage: string };

/**
 * Normalise a name part the same way the server's `nameKey` does (lowercase,
 * strip accents and any non-letter characters) so a row's resolution lines up
 * with the parsed row the server resolves it against. Keeping this in sync
 * prevents punctuation/diacritic variants (e.g. "O'Brien" vs "Obrien") from
 * holding divergent UI state that the server would silently collapse.
 */
export const FINALS_STAGES = Object.values(MatchStage);

export const normName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** A stable key for a previewed name, used to index resolution state. */
export const rowKey = (surname: string, givenName: string) =>
  `${normName(surname)}|${normName(givenName)}`;

/**
 * The player id a row would resolve to given the admin's current choice, or
 * null when it would create a brand-new player. Used for live debut recompute.
 */
export function resolvedPlayerId(
  status: "matched" | "suggested" | "new",
  playerId: number | null | undefined,
  candidates: NameMatchCandidate[],
  resolution: RowResolution | undefined,
): number | null {
  if (resolution) return resolution.action === "link" ? resolution.player.id : null;
  if (status === "matched") return playerId ?? null;
  if (status === "suggested") return candidates[0]?.playerId ?? null;
  return null;
}

/**
 * Whether a row is a debut: cap-eligible import and the resolved player holds
 * no existing cap in the category (a new player always debuts).
 */
export function isDebut(
  capCategory: string | null,
  cappedIds: Set<number>,
  resolvedId: number | null,
): boolean {
  if (capCategory == null) return false;
  return resolvedId == null || !cappedIds.has(resolvedId);
}

/** Count `suggested` rows the admin has not yet decided (link or create). */
export function unresolvedSuggestions(
  players: Array<{ surname: string; givenName: string; status: string }>,
  map: Record<string, RowResolution>,
): number {
  let n = 0;
  for (const p of players) {
    if (p.status === "suggested" && !map[rowKey(p.surname, p.givenName)]) n++;
  }
  return n;
}

/** Build the commit body from the admin's resolution choices. */
export function buildResolutions(
  map: Record<string, RowResolution>,
  players: Array<{ surname: string; givenName: string }>,
): PlayerResolution[] {
  const out: PlayerResolution[] = [];
  for (const p of players) {
    const r = map[rowKey(p.surname, p.givenName)];
    if (!r) continue;
    if (r.action === "link") {
      out.push({
        surname: p.surname,
        givenName: p.givenName,
        action: "link",
        playerId: r.player.id,
      });
    } else {
      out.push({ surname: p.surname, givenName: p.givenName, action: "create" });
    }
  }
  return out;
}

/**
 * Batch file statuses that carry a per-file Round / Final resolver. A
 * `needsResolution` file has no identity yet; `duplicate` / `duplicateInBatch`
 * already have one but collide, so the admin can remap them onto a distinct
 * round/stage to import them as their own match instead of skipping/replacing.
 */
export const RESOLVABLE_STATUSES = new Set(["needsResolution", "duplicate", "duplicateInBatch"]);

/**
 * Turn the admin's per-file round/stage entries into the wire shape. Only
 * entries that name a round or a finals stage are sent; an empty entry means
 * "use the round/stage parsed from the scorecard" and is dropped.
 */
export function buildFileResolutions(
  map: Record<string, { round: string; stage: string }>,
): BatchFileResolution[] {
  const out: BatchFileResolution[] = [];
  for (const [filename, v] of Object.entries(map)) {
    if (v.stage) {
      out.push({ filename, stage: v.stage as MatchStage });
    } else {
      const r = parseInt(v.round, 10);
      if (Number.isInteger(r) && r >= 1) out.push({ filename, round: r });
    }
  }
  return out;
}

export const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

export const SEASON_OPTIONS = (() => {
  const out: { value: number; label: string }[] = [];
  for (let y = 2030; y >= 1991; y--) {
    out.push({ value: y, label: `${y}/${String((y + 1) % 100).padStart(2, "0")}` });
  }
  return out;
})();

export const seasonLabel = (s: number | null | undefined) =>
  s == null ? "—" : `${s}/${String((s + 1) % 100).padStart(2, "0")}`;
