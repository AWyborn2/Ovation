/**
 * A list's row choice (full draft editor plan, stages 4 and 5): which of a
 * result's performances a list draws. The renderer applies it to the bound
 * rows and the slide planner to the same rows, so the editor, the share
 * dialog and the server's render agree on every slide.
 *
 * - Performance lists (`performances.batting`, `performances.bowling`) hold
 *   both innings' rows, each marked with its `side`. Without a choice they
 *   draw every row of both teams in scorecard order (D4, as changed with Ash:
 *   maximum flexibility, not a default); a choice without a side keeps both.
 *   A junior card's input names only the club's players, so its lists do too.
 * - Innings lists (`innings1.batting`, …) are one side's, so `side` doesn't
 *   apply; without a choice they draw every row as bound.
 */
import type { RowsPick } from "./document";
import type {
  MatchSummaryBatter,
  MatchSummaryBowler,
  MatchSummaryInnings,
} from "../match-summary-types";

/** The most rows a list can be set to keep. */
export const MAX_PICK_COUNT = 30;
/** The highest "at least this many runs" a batting list can be set to. */
export const MAX_PICK_MIN_RUNS = 400;
/** The highest "at least this many wickets" a bowling list can be set to. */
export const MAX_PICK_MIN_WICKETS = 10;

export const PICK_SIDES = ["club", "opposition", "both"] as const;
/** A batting list's sorts: runs (then fewest balls), balls faced, strike rate. */
export const BATTING_PICK_SORTS = ["runs", "balls", "strikeRate"] as const;
/** A bowling list's sorts: wickets or figures (most wickets, then fewest runs), economy. */
export const BOWLING_PICK_SORTS = ["wickets", "figures", "economy"] as const;
export const PICK_SORTS = [...BATTING_PICK_SORTS, ...BOWLING_PICK_SORTS] as const;
/** The sorts stage 4 accepted on either list (a list orders by its own stat). */
const ANY_LIST_SORTS = ["runs", "wickets", "figures"] as const;

type Sort = NonNullable<RowsPick["sort"]>;

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

/** The sorts a batting or bowling list accepts: its own, and stage 4's three. */
export function pickSortsFor(stat: "batting" | "bowling"): readonly Sort[] {
  const own = stat === "batting" ? BATTING_PICK_SORTS : BOWLING_PICK_SORTS;
  return [...new Set<Sort>([...own, ...ANY_LIST_SORTS])];
}

/**
 * The choice a list draws by, or null when nothing is chosen (every row, as
 * bound). A performance list keeps its choice as saved (no side is both
 * teams); an innings list drops `side`. Within a choice, no `sort` keeps the
 * bound order, no `count` keeps every row and no minimum keeps everyone.
 */
export function effectivePick(repeat: string, pick: RowsPick | undefined): RowsPick | null {
  if (!pick || !isPickableRepeat(repeat)) return null;
  if (isPerformanceRepeat(repeat)) return pick;
  const { side: _side, ...rest } = pick;
  return rest;
}

const int = (v: string | undefined): number | null => {
  const n = Number.parseInt((v ?? "").replace(/\D+$/, ""), 10);
  return Number.isFinite(n) ? n : null;
};

/** Balls in a cricket overs figure: "8.3" is 8 overs and 3 balls (51); null when unreadable. */
export function oversToBalls(overs: string | null | undefined): number | null {
  const m = /^(\d+)(?:\.([0-5]))?$/.exec((overs ?? "").trim());
  return m ? Number(m[1]) * 6 + Number(m[2] ?? 0) : null;
}

/** Runs per 100 balls, one decimal ("125.0"); empty without balls faced. */
export function strikeRateText(runs: number, balls: number | null | undefined): string {
  return balls ? ((runs * 100) / balls).toFixed(1) : "";
}

/** Runs conceded per over, two decimals ("4.67"); empty without a ball bowled. */
export function economyText(runs: number, overs: string | null | undefined): string {
  const balls = oversToBalls(overs);
  return balls ? ((runs * 6) / balls).toFixed(2) : "";
}

/** A batting row's runs, balls and not-out mark; null runs when the row isn't a batter's. */
function battingKey(row: Record<string, string>) {
  const runs = int(row.runsOnly ?? row.runs);
  const balls = int(row.balls);
  const notOut = row.notOut === "*" || /\*$/.test(row.runs ?? "");
  return { runs, balls, notOut };
}

/** A bowling row's wickets, runs conceded and balls bowled; null when it has no figures. */
function bowlingKey(row: Record<string, string>) {
  const m = /^(\d+)[/-](\d+)$/.exec((row.figures ?? "").trim());
  return m ? { wickets: Number(m[1]), runs: Number(m[2]), balls: oversToBalls(row.overs) } : null;
}

const isBattingSort = (sort: Sort) => (BATTING_PICK_SORTS as readonly Sort[]).includes(sort);

/**
 * A row's rank under a sort, best first (lower ranks first), or null when the
 * row lacks what the sort needs (it then sorts last, in its bound order):
 * - runs: most runs, then fewest balls; balls: most balls, then most runs;
 *   strike rate: highest, then most runs (needs balls faced).
 * - wickets and figures: most wickets, then fewest runs; economy: lowest
 *   runs per over, then most wickets (needs overs bowled).
 * A row of the other stat ranks by its own (a bowler's figures under
 * "runs"), so a list orders by its own stat whatever it is set to.
 */
function rank(row: Record<string, string>, sort: Sort): number[] | null {
  const bat = battingKey(row);
  const bowl = bowlingKey(row);
  const batting = isBattingSort(sort);
  if (bat.runs != null && (batting || !bowl)) {
    const runs = bat.runs;
    switch (batting ? sort : "runs") {
      case "balls":
        return bat.balls == null ? null : [-bat.balls, -runs];
      case "strikeRate":
        return bat.balls ? [-(runs * 100) / bat.balls, -runs] : null;
      default:
        return [-runs, bat.balls ?? Number.MAX_SAFE_INTEGER];
    }
  }
  if (!bowl) return null;
  if (sort === "economy") return bowl.balls ? [(bowl.runs * 6) / bowl.balls, -bowl.wickets] : null;
  return [-bowl.wickets, bowl.runs];
}

function compare(sort: Sort) {
  return (a: Record<string, string>, b: Record<string, string>): number => {
    const ra = rank(a, sort);
    const rb = rank(b, sort);
    if (!ra || !rb) return ra ? -1 : rb ? 1 : 0;
    return ra[0]! - rb[0]! || ra[1]! - rb[1]!;
  };
}

/** Whether a row passes a choice's filters: at least so many runs or wickets, not outs only. */
function passes(row: Record<string, string>, p: RowsPick): boolean {
  if ((p.minRuns ?? 0) > 0 && (battingKey(row).runs ?? -1) < p.minRuns!) return false;
  if ((p.minWickets ?? 0) > 0 && (bowlingKey(row)?.wickets ?? -1) < p.minWickets!) return false;
  if (p.notOutOnly && !battingKey(row).notOut) return false;
  return true;
}

/**
 * The indexes of the rows a list draws, in the order it draws them. Rows are
 * the bound rows of the list's repeat; a performance list's carry `side`.
 * Applying a choice to rows it already chose changes nothing (filters, a
 * stable sort and a cap), which is how a slide's share of a list draws.
 */
export function pickRowIndexes(
  repeat: string,
  rows: ReadonlyArray<Record<string, string>>,
  pick: RowsPick | undefined,
): number[] {
  const all = rows.map((_, i) => i);
  const p = effectivePick(repeat, pick);
  if (!p) return all;
  const side = p.side ?? "both";
  let picked = all.filter(
    (i) =>
      (side === "both" || !isPerformanceRepeat(repeat) || rows[i]!.side === side) &&
      passes(rows[i]!, p),
  );
  if (p.sort) {
    const cmp = compare(p.sort);
    // A stable sort: equal rows keep their bound order.
    picked = [...picked].sort((a, b) => cmp(rows[a]!, rows[b]!) || a - b);
  }
  const count = p.count ?? 0;
  return count > 0 ? picked.slice(0, count) : picked;
}

/** One performance: a batter or bowler and the side they played for. */
export type PerformanceEntry<T> = { player: T; side: "club" | "opposition" };

/**
 * A result's performances in scorecard order: every innings' batters (its
 * full list, else an older input's top three), each the batting side's, and
 * its bowlers, each the other side's. The binding draws these rows and the
 * slide planner counts them, so both see the same list.
 */
export function performanceEntries(innings: ReadonlyArray<MatchSummaryInnings>): {
  batting: Array<PerformanceEntry<MatchSummaryBatter>>;
  bowling: Array<PerformanceEntry<MatchSummaryBowler>>;
} {
  const batting: Array<PerformanceEntry<MatchSummaryBatter>> = [];
  const bowling: Array<PerformanceEntry<MatchSummaryBowler>> = [];
  for (const inn of innings) {
    const bat = inn.teamKey;
    const bowl = bat === "club" ? "opposition" : "club";
    for (const player of inn.batters ?? inn.topBatters ?? []) batting.push({ player, side: bat });
    for (const player of inn.bowlers ?? inn.topBowlers ?? []) bowling.push({ player, side: bowl });
  }
  return { batting, bowling };
}

/**
 * A performance list's rows with just the values a choice reads (the bound
 * rows carry the same values, formatted the same way, and more).
 */
export function performancePickRows(
  innings: ReadonlyArray<MatchSummaryInnings>,
  repeat: string,
): Array<Record<string, string>> {
  const entries = performanceEntries(innings);
  if (repeat === "performances.batting")
    return entries.batting.map(({ player: b, side }) => ({
      runs: `${b.runs}${b.notOut ? "*" : ""}`,
      runsOnly: String(b.runs),
      notOut: b.notOut ? "*" : "",
      balls: b.balls != null ? String(b.balls) : "",
      side,
    }));
  if (repeat === "performances.bowling")
    return entries.bowling.map(({ player: b, side }) => ({
      figures: `${b.wickets}/${b.runs}`,
      overs: b.overs,
      side,
    }));
  return [];
}
