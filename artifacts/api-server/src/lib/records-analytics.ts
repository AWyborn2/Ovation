/**
 * Pure helpers behind the records analytics endpoints (stats plan U9 / KTD5):
 * the record-progression walk, single-innings value parsing / comparison, and
 * competition ranking for the leaders list. No database access, so both read
 * paths (native and central) share exactly one definition of "broke the record".
 */

export type RecordKind = "highScore" | "bestBowling";

/**
 * One single-innings value, normalised for comparison.
 * - highScore: `primary` = runs, `secondary` = 1 when not out.
 * - bestBowling: `primary` = wickets, `secondary` = runs conceded.
 */
export interface InningsValue {
  primary: number;
  secondary: number;
}

/** "145*" → { 145, 1 }; "87" → { 87, 0 }; blank / unparseable → null. */
export function parseHighScore(text: string | null | undefined): InningsValue | null {
  const m = /^\s*(\d+)\s*(\*)?/.exec(text ?? "");
  if (!m) return null;
  return { primary: Number(m[1]), secondary: m[2] ? 1 : 0 };
}

/** "7/23" → { 7, 23 }; a wicketless or unparseable figure → null. */
export function parseBestBowling(text: string | null | undefined): InningsValue | null {
  const m = /^\s*(\d+)\s*[/-]\s*(\d+)/.exec(text ?? "");
  if (!m) return null;
  const wickets = Number(m[1]);
  if (wickets <= 0) return null;
  return { primary: wickets, secondary: Number(m[2]) };
}

export function parseRecordValue(
  kind: RecordKind,
  text: string | null | undefined,
): InningsValue | null {
  return kind === "highScore" ? parseHighScore(text) : parseBestBowling(text);
}

/** Display form: "145*" / "145" for scores, "7/23" for bowling. */
export function formatRecordValue(kind: RecordKind, v: InningsValue): string {
  return kind === "highScore"
    ? `${v.primary}${v.secondary ? "*" : ""}`
    : `${v.primary}/${v.secondary}`;
}

/**
 * Strictly better. A higher score beats a lower one (not-out status never
 * breaks a tie); more wickets beat fewer, and equal wickets for fewer runs
 * beat the dearer figures. Equal values never break the record.
 */
export function beats(kind: RecordKind, a: InningsValue, b: InningsValue): boolean {
  if (a.primary !== b.primary) return a.primary > b.primary;
  return kind === "bestBowling" && a.secondary < b.secondary;
}

/** A row that could have set the record. `P` identifies the player. */
export interface ProgressionCandidate<P> {
  player: P;
  grade: string | null;
  /** Season start year; null only for undated (career) records. */
  season: number | null;
  matchId: number | null;
  /** ISO "YYYY-MM-DD" when known. */
  matchDate: string | null;
  value: InningsValue;
  /**
   * A season-level (curated / imported) figure with no match behind it. Sorted
   * after the same season's match rows, so a season snapshot that merely
   * repeats a scorecard innings never displaces it.
   */
  seasonLevel?: boolean;
}

export interface ProgressionPoint<P> extends ProgressionCandidate<P> {
  dated: boolean;
}

function chronological<P>(
  kind: RecordKind,
  a: ProgressionCandidate<P>,
  b: ProgressionCandidate<P>,
): number {
  const bySeason = (a.season ?? 0) - (b.season ?? 0);
  if (bySeason) return bySeason;
  const byLevel = Number(!!a.seasonLevel) - Number(!!b.seasonLevel);
  if (byLevel) return byLevel;
  if (a.matchDate !== b.matchDate) {
    if (a.matchDate === null) return 1;
    if (b.matchDate === null) return -1;
    return a.matchDate < b.matchDate ? -1 : 1;
  }
  const byMatch = (a.matchId ?? 0) - (b.matchId ?? 0);
  if (byMatch) return byMatch;
  // Same match: best first, so only the match's best innings can break it.
  if (beats(kind, a.value, b.value)) return -1;
  if (beats(kind, b.value, a.value)) return 1;
  return 0;
}

/**
 * Walk dated rows oldest first and keep each one that strictly beats the
 * record so far (a tie doesn't count). Then, if the best undated record (a
 * career figure with no season) beats every dated row, append it as the final
 * point with `dated: false` — so the series always ends at the record card's
 * value.
 */
export function walkProgression<P>(
  kind: RecordKind,
  dated: ProgressionCandidate<P>[],
  undated: ProgressionCandidate<P>[] = [],
): ProgressionPoint<P>[] {
  const out: ProgressionPoint<P>[] = [];
  let record: InningsValue | null = null;
  const ordered = dated
    .filter((c) => c.season !== null)
    .slice()
    .sort((a, b) => chronological(kind, a, b));
  for (const c of ordered) {
    if (record === null || beats(kind, c.value, record)) {
      out.push({ ...c, dated: true });
      record = c.value;
    }
  }
  let best: ProgressionCandidate<P> | null = null;
  for (const c of undated) {
    if (best === null || beats(kind, c.value, best.value)) best = c;
  }
  if (best && (record === null || beats(kind, best.value, record))) {
    out.push({ ...best, season: null, matchId: null, matchDate: null, dated: false });
  }
  return out;
}

/**
 * Competition ranking ("1, 2, 2, 4") over rows already sorted by `value`
 * descending, then cut to `limit` rows.
 */
export function rankLeaders<T extends { value: number }>(
  sorted: T[],
  limit: number,
): (T & { rank: number })[] {
  const out: (T & { rank: number })[] = [];
  for (const [i, row] of sorted.entries()) {
    if (out.length >= limit) break;
    const prev = out[out.length - 1];
    out.push({ ...row, rank: prev && prev.value === row.value ? prev.rank : i + 1 });
  }
  return out;
}

/** "First Middle Last" → given "First Middle", surname "Last" (central display names). */
export function splitDisplayName(dn: string | null): { givenName: string; surname: string } {
  const parts = (dn ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0]!, surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1]! };
}

/** Optional grade / span filter shared by `/records` and `/records/leaders`. */
export interface RecordsFilter {
  grade?: string;
  fromSeason?: number;
  toSeason?: number;
}

/** The filter to apply, or undefined when no filter param was given. */
export function recordsFilterFrom(q: {
  grade?: string;
  fromSeason?: number;
  toSeason?: number;
}): RecordsFilter | undefined {
  const f: RecordsFilter = {};
  if (q.grade !== undefined && q.grade.trim() !== "") f.grade = q.grade.trim();
  if (q.fromSeason !== undefined) f.fromSeason = Math.trunc(q.fromSeason);
  if (q.toSeason !== undefined) f.toSeason = Math.trunc(q.toSeason);
  return Object.keys(f).length ? f : undefined;
}
