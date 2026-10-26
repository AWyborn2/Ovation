/**
 * A list's row choice (full draft editor plan, stage 4): which of a result's
 * performances a list draws. The renderer applies it to the bound rows, so
 * the editor, the share dialog and the server's render agree.
 *
 * - Performance lists (`performances.batting`, `performances.bowling`) hold
 *   both innings' rows, each marked with its `side`. They show the club's
 *   top three unless set otherwise (D4): the opposition's players show only
 *   when a list is set to show them.
 * - Innings lists (`innings1.batting`, …) are one side's, so only `sort` and
 *   `count` apply; without a choice they draw every row as bound.
 */
import type { RowsPick } from "./document";

/** The most rows a list can be set to keep. */
export const MAX_PICK_COUNT = 30;

export const PICK_SIDES = ["club", "opposition", "both"] as const;
export const PICK_SORTS = ["runs", "wickets", "figures"] as const;

/** The performance lists: both innings' batting or bowling rows. */
export const PERFORMANCE_REPEATS = ["performances.batting", "performances.bowling"] as const;

const PICKABLE = /^(?:performances|innings[12])\.(batting|bowling)$/;

/** Whether a list is a result's performance list (whose rows carry a side). */
export const isPerformanceRepeat = (repeat: string): boolean =>
  (PERFORMANCE_REPEATS as readonly string[]).includes(repeat);

/** Whether a list can hold a row choice: a performance or innings batting or bowling list. */
export const isPickableRepeat = (repeat: string): boolean => PICKABLE.test(repeat);

/** Whether a pickable list is batting or bowling; null for any other list. */
export function pickStat(repeat: string): "batting" | "bowling" | null {
  const m = PICKABLE.exec(repeat);
  return m ? (m[1] as "batting" | "bowling") : null;
}

/** The row choice a new list starts with: the club's top three for a performance list (D4). */
export function defaultPick(repeat: string): RowsPick | undefined {
  if (!isPerformanceRepeat(repeat)) return undefined;
  return { side: "club", count: 3, sort: pickStat(repeat) === "bowling" ? "wickets" : "runs" };
}

/**
 * The choice a list draws by. A performance list: its own choice, the club's
 * side unless it names another, or without one the D4 default. An innings
 * list: its own choice, without a side. Null when nothing is chosen (every
 * row, as bound). Within a choice, no `sort` keeps the bound order and no
 * `count` keeps every row.
 */
export function effectivePick(repeat: string, pick: RowsPick | undefined): RowsPick | null {
  if (isPerformanceRepeat(repeat)) return pick ? { side: "club", ...pick } : defaultPick(repeat)!;
  if (!pick || !isPickableRepeat(repeat)) return null;
  const { side: _side, ...rest } = pick;
  return rest;
}

const int = (v: string | undefined): number | null => {
  const n = Number.parseInt((v ?? "").replace(/\D+$/, ""), 10);
  return Number.isFinite(n) ? n : null;
};

/** A batting row's runs and balls; null runs when the row isn't a batter's. */
function battingKey(row: Record<string, string>): { runs: number | null; balls: number } {
  const runs = int(row.runsOnly ?? row.runs);
  return { runs, balls: int(row.balls) ?? Number.MAX_SAFE_INTEGER };
}

/** A bowling row's wickets and runs conceded, from its figures (`W/R`); null when it has none. */
function bowlingKey(row: Record<string, string>): { wickets: number; runs: number } | null {
  const m = /^(\d+)[/-](\d+)$/.exec((row.figures ?? "").trim());
  return m ? { wickets: Number(m[1]), runs: Number(m[2]) } : null;
}

/**
 * Best first: runs (most, then fewest balls) or wickets and figures (most
 * wickets, then fewest runs). A row without the stat asked for sorts by the
 * one it has (a bowler's figures under "runs"), so a list orders by its own
 * stat whatever it is set to; rows without either keep their order, last.
 */
function compare(sort: NonNullable<RowsPick["sort"]>) {
  const rank = (row: Record<string, string>): number[] | null => {
    const bat = battingKey(row);
    const bowl = bowlingKey(row);
    const byRuns = bat.runs != null ? [-bat.runs, bat.balls] : null;
    const byWickets = bowl ? [-bowl.wickets, bowl.runs] : null;
    return sort === "runs" ? (byRuns ?? byWickets) : (byWickets ?? byRuns);
  };
  return (a: Record<string, string>, b: Record<string, string>): number => {
    const ra = rank(a);
    const rb = rank(b);
    if (!ra || !rb) return ra ? -1 : rb ? 1 : 0;
    return ra[0]! - rb[0]! || ra[1]! - rb[1]!;
  };
}

/**
 * The indexes of the rows a list draws, in the order it draws them. Rows are
 * the bound rows of the list's repeat; a performance list's carry `side`.
 */
export function pickRowIndexes(
  repeat: string,
  rows: ReadonlyArray<Record<string, string>>,
  pick: RowsPick | undefined,
): number[] {
  const all = rows.map((_, i) => i);
  const p = effectivePick(repeat, pick);
  if (!p) return all;
  const side = p.side ?? "club";
  let picked =
    side === "both" || !isPerformanceRepeat(repeat)
      ? all
      : all.filter((i) => rows[i]!.side === side);
  if (p.sort) {
    const cmp = compare(p.sort);
    // A stable sort: equal rows keep their bound order.
    picked = [...picked].sort((a, b) => cmp(rows[a]!, rows[b]!) || a - b);
  }
  const count = p.count ?? 0;
  return count > 0 ? picked.slice(0, count) : picked;
}
