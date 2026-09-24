import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Shared season-range + discipline view state for the stats analytics pages
 * (Player profile, Compare, Records), kept in the URL so links reproduce the
 * view: `?from=2023&to=2025&d=bowl`.
 *
 * Seasons are identified by their START year, the same convention the API uses
 * (`PlayerSeasonStat.season` = 2025 for 2025/26). Career (no range) is the
 * absence of `from`/`to`; batting is the absence of `d`.
 *
 * Every change goes through ONE `setView` call that applies the whole patch to a
 * single fresh `URLSearchParams` and navigates once (KTD8) — per-param setters
 * would each read the same stale query string and overwrite one another. Params
 * that aren't ours (Compare's `a`/`b`/`c`, a records `grade`, …) are preserved.
 */

export type Discipline = "bat" | "bowl";

export interface StatsView {
  /** First season (start year) in range, inclusive; null = open (Career). */
  from: number | null;
  /** Last season (start year) in range, inclusive; null = open (Career). */
  to: number | null;
  d: Discipline;
}

export type StatsViewPatch = Partial<StatsView>;

export const DEFAULT_STATS_VIEW: StatsView = { from: null, to: null, d: "bat" };

/** `2025` → `"2025/26"` (the club-facing season label). */
export function seasonLabel(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/**
 * Parse a free-text season into its start year: `2025`, `"2025"`,
 * `"2025/26"`, `"2025-26"`, `"2025/2026"`, `"Season 2025/26"`. Returns null when
 * no four-digit year is present. Shared with the records heatmap / five-fors
 * timeline, whose seasons arrive as free text (U10).
 */
export function parseSeasonYear(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  const m = /(\d{4})/.exec(value);
  return m ? Number(m[1]) : null;
}

function parseYearParam(raw: string | null): number | null {
  if (raw == null || !/^\d{4}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** Read the view out of a query string (with or without the leading `?`). */
export function parseStatsView(search: string): StatsView {
  const params = new URLSearchParams(search);
  let from = parseYearParam(params.get("from"));
  let to = parseYearParam(params.get("to"));
  if (from != null && to != null && from > to) [from, to] = [to, from];
  const d: Discipline = params.get("d") === "bowl" ? "bowl" : "bat";
  return { from, to, d };
}

/**
 * Merge a patch into the current view, keeping the range ordered: moving From
 * past To pushes To forward, and moving To before From pulls From back. A patch
 * that sets both to an inverted pair is swapped.
 */
export function mergeStatsView(current: StatsView, patch: StatsViewPatch): StatsView {
  let from = "from" in patch ? (patch.from ?? null) : current.from;
  let to = "to" in patch ? (patch.to ?? null) : current.to;
  const setFrom = "from" in patch && patch.from != null;
  const setTo = "to" in patch && patch.to != null;
  if (from != null && to != null && from > to) {
    if (setFrom && !setTo) to = from;
    else if (setTo && !setFrom) from = to;
    else [from, to] = [to, from];
  }
  return { from, to, d: patch.d ?? current.d };
}

/**
 * Apply a patch to a query string and return the new query string (no `?`).
 * Defaults are written as absences: Career drops `from`/`to`, batting drops `d`.
 */
export function applyStatsView(search: string, patch: StatsViewPatch): string {
  const params = new URLSearchParams(search);
  const next = mergeStatsView(parseStatsView(search), patch);
  if (next.from == null) params.delete("from");
  else params.set("from", String(next.from));
  if (next.to == null) params.delete("to");
  else params.set("to", String(next.to));
  if (next.d === "bat") params.delete("d");
  else params.set("d", next.d);
  return params.toString();
}

/** True when a season (start year) falls inside the view's range. */
export function inStatsRange(season: number | null | undefined, view: StatsView): boolean {
  if (season == null) return view.from == null && view.to == null;
  if (view.from != null && season < view.from) return false;
  if (view.to != null && season > view.to) return false;
  return true;
}

export type RangePresetKey = "career" | "last3" | "latest" | "previous" | "custom";

export interface RangePreset {
  key: Exclude<RangePresetKey, "custom">;
  label: string;
  patch: { from: number | null; to: number | null };
}

/** Distinct seasons, newest first (nulls — baseline rows — dropped). */
export function sortSeasonsDesc(seasons: ReadonlyArray<number | null | undefined>): number[] {
  return [...new Set(seasons.filter((s): s is number => typeof s === "number"))].sort(
    (a, b) => b - a,
  );
}

/**
 * The season bar's range chips, built from the page's own season list:
 * Career · Last 3 seasons · <latest> · <previous>. Chips that the list can't
 * support (fewer than 3 / 2 / 1 seasons) are omitted.
 */
export function rangePresets(seasons: ReadonlyArray<number | null | undefined>): RangePreset[] {
  const desc = sortSeasonsDesc(seasons);
  const presets: RangePreset[] = [
    { key: "career", label: "Career", patch: { from: null, to: null } },
  ];
  if (desc.length >= 3) {
    presets.push({
      key: "last3",
      label: "Last 3 seasons",
      patch: { from: desc[2], to: desc[0] },
    });
  }
  if (desc.length >= 1) {
    presets.push({
      key: "latest",
      label: seasonLabel(desc[0]),
      patch: { from: desc[0], to: desc[0] },
    });
  }
  if (desc.length >= 2) {
    presets.push({
      key: "previous",
      label: seasonLabel(desc[1]),
      patch: { from: desc[1], to: desc[1] },
    });
  }
  return presets;
}

/** Which preset chip the view matches, or "custom". */
export function activePreset(
  view: StatsView,
  seasons: ReadonlyArray<number | null | undefined>,
): RangePresetKey {
  if (view.from == null && view.to == null) return "career";
  const hit = rangePresets(seasons).find(
    (p) => p.patch.from === view.from && p.patch.to === view.to,
  );
  return hit?.key ?? "custom";
}

/** "Career", "2024/25" or "2023/24 to 2025/26" (open ends read from/until). */
export function rangeLabel(view: StatsView): string {
  const { from, to } = view;
  if (from == null && to == null) return "Career";
  if (from != null && to != null) {
    return from === to ? seasonLabel(from) : `${seasonLabel(from)} to ${seasonLabel(to)}`;
  }
  return from != null ? `From ${seasonLabel(from)}` : `Until ${seasonLabel(to!)}`;
}

export interface UseStatsView {
  view: StatsView;
  /** Apply every change in one navigation (history is replaced, not pushed). */
  setView: (patch: StatsViewPatch) => void;
  /** Human label for the current range ("Career", "2023/24 to 2025/26"). */
  label: string;
}

export function useStatsView(): UseStatsView {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const view = useMemo(() => parseStatsView(search), [search]);

  const setView = useCallback(
    (patch: StatsViewPatch) => {
      const qs = applyStatsView(search, patch);
      if (qs === new URLSearchParams(search).toString()) return;
      navigate(qs ? `${location}?${qs}` : location, { replace: true });
    },
    [search, location, navigate],
  );

  return { view, setView, label: rangeLabel(view) };
}
