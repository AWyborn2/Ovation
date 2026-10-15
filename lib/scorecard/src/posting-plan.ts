/**
 * The Posting Plan (plan 2026-10-07-001, reshaped by 2026-10-15-001 as
 * version 2): one row per card type deciding whether it drafts, for which
 * senior and junior grades, and how it is packaged.
 *
 * Shared by the API (which stores, validates and resolves it) and the web
 * admin (which edits it). Pure: no DB, no React.
 *
 * Version 2 has no legacy derivation: a club whose stored plan is missing or
 * older than version 2 gets the code default (ADR-004), so every club starts
 * from the same table and no settings migration is needed.
 */

import { isJuniorGradeLabel } from "./junior-grade";

export const POSTING_PLAN_VERSION = 2;

export const POSTING_ROWS = [
  "results",
  "bigMoments",
  "milestones",
  "debuts",
  "gameDay",
  "teamLists",
  "clubLeaderboards",
  "ladders",
] as const;
export type PostingRowId = (typeof POSTING_ROWS)[number];

export type Packaging = "individual" | "round";
/** What happens to a grade the row doesn't list: seniors draft (juniors don't), or nothing. */
export type OtherGrades = "seniors" | "off";
/** A carousel row with junior grades on: juniors share the seniors' carousel or get their own. */
export type JuniorPackaging = "combined" | "separate";

export interface PostingRow {
  enabled: boolean;
  packaging: Packaging;
  /** Explicit per-grade choices; a grade absent here follows `others`. */
  grades: Record<string, boolean>;
  others: OtherGrades;
  /** Only meaningful when `packaging` is "round" and a junior grade is on. */
  juniors?: JuniorPackaging;
}

/** Runs a junior innings needs to be a Big Moment (R11): a century, or a half-century. */
export type JuniorRunsBar = 50 | 100;

export interface PostingPlan {
  version: typeof POSTING_PLAN_VERSION;
  /** The style the plan was filled from, or null when built by hand. */
  styleId: string | null;
  rows: Record<PostingRowId, PostingRow>;
  bigMoments: { juniorRunsBar: JuniorRunsBar };
}

export interface PostingRowDef {
  label: string;
  /** Card kinds the row governs (for the UI and the reader guard). */
  kinds: readonly string[];
  packaging: readonly Packaging[];
  /** Round carousel needs central data (KTD12 of the Posting Plan plan). */
  roundCentralOnly: boolean;
  /** The row may list junior grades (rows with junior data, KTD6). */
  juniors: boolean;
}

export const POSTING_ROW_DEFS: Record<PostingRowId, PostingRowDef> = {
  results: {
    label: "Match result",
    kinds: ["matchSummary", "weekendWrap", "resultsSummary"],
    packaging: ["individual", "round"],
    roundCentralOnly: true,
    juniors: true,
  },
  bigMoments: {
    label: "Big Moment",
    kinds: ["century", "fiveFor", "bigMoment"],
    packaging: ["individual"],
    roundCentralOnly: false,
    juniors: true,
  },
  milestones: {
    label: "Milestones",
    kinds: ["milestone"],
    packaging: ["individual"],
    roundCentralOnly: false,
    juniors: false,
  },
  debuts: {
    label: "Debuts",
    kinds: ["debut"],
    packaging: ["individual"],
    roundCentralOnly: false,
    juniors: false,
  },
  gameDay: {
    label: "Game day",
    kinds: ["matchDay", "roundFixtures"],
    packaging: ["individual", "round"],
    roundCentralOnly: false,
    juniors: true,
  },
  teamLists: {
    label: "Team lists",
    kinds: ["teamList", "teamListRound"],
    packaging: ["individual", "round"],
    roundCentralOnly: false,
    juniors: true,
  },
  clubLeaderboards: {
    label: "Club leaderboards",
    kinds: ["clubLeaderboard"],
    packaging: ["round"],
    roundCentralOnly: true,
    juniors: false,
  },
  ladders: {
    label: "Ladders",
    kinds: ["ladder"],
    packaging: ["round"],
    roundCentralOnly: true,
    juniors: false,
  },
};

// ---------------------------------------------------------------------------
// Grades

/** Does this row draft for `grade`? Same rule as the family switches once had (KTD4). */
export function rowAllows(row: PostingRow, grade: string | null, junior: boolean): boolean {
  if (!row.enabled) return false;
  const explicit = row.grades[grade ?? ""];
  if (explicit !== undefined) return explicit;
  return row.others === "seniors" ? !junior : false;
}

/** The row drafts one card per event (match, fixture, milestone…). */
export function rowIndividual(row: PostingRow): boolean {
  return row.enabled && row.packaging === "individual";
}

/** The row drafts one club-wide carousel per round. */
export function rowRound(row: PostingRow): boolean {
  return row.enabled && row.packaging === "round";
}

/** Any junior grade switched on for this row. */
export function rowHasJuniors(row: PostingRow): boolean {
  return row.enabled && Object.entries(row.grades).some(([g, on]) => on && isJuniorGradeLabel(g));
}

/** How a carousel row with juniors on packages them: their own set unless the club chose combined. */
export function rowJuniorPackaging(row: PostingRow): JuniorPackaging {
  return row.juniors ?? "separate";
}

// ---------------------------------------------------------------------------
// Defaults and styles

const row = (
  enabled: boolean,
  packaging: Packaging,
  grades: Record<string, boolean> = {},
  others: OtherGrades = "seniors",
): PostingRow => ({ enabled, packaging, grades: { ...grades }, others });

export interface PostingStyle {
  id: string;
  label: string;
  description: string;
  rows: Record<PostingRowId, PostingRow>;
}

const A_GRADES = { "A Grade": true, "Female A Grade": true };

export const DEFAULT_STYLE_ID = "round-carousels";

/**
 * The posting styles (presets). The results row needs central data for a
 * round carousel, so a non-central club's "round carousels" style posts each
 * match on its own instead.
 */
export function postingStyles(central: boolean): readonly PostingStyle[] {
  return [
    {
      id: DEFAULT_STYLE_ID,
      label: "Round carousels + individual highlights",
      description:
        "Results, team lists and game day as one club-wide carousel per round; Big Moments, milestones and A Grade debuts on their own.",
      rows: {
        results: row(true, central ? "round" : "individual"),
        bigMoments: row(true, "individual"),
        milestones: row(true, "individual"),
        debuts: row(true, "individual", A_GRADES, "off"),
        gameDay: row(true, "round"),
        teamLists: row(true, "round"),
        clubLeaderboards: row(false, "round"),
        ladders: row(false, "round"),
      },
    },
    {
      id: "every-match",
      label: "Every match on its own",
      description: "A card for every match, fixture, team list, Big Moment and milestone.",
      rows: {
        results: row(true, "individual"),
        bigMoments: row(true, "individual"),
        milestones: row(true, "individual"),
        debuts: row(true, "individual"),
        gameDay: row(true, "individual"),
        teamLists: row(true, "individual"),
        clubLeaderboards: row(false, "round"),
        ladders: row(false, "round"),
      },
    },
    {
      id: "results-only",
      label: "Results only",
      description: "Just a card for each result.",
      rows: {
        results: row(true, "individual"),
        bigMoments: row(false, "individual"),
        milestones: row(false, "individual"),
        debuts: row(false, "individual"),
        gameDay: row(false, "individual"),
        teamLists: row(false, "individual"),
        clubLeaderboards: row(false, "round"),
        ladders: row(false, "round"),
      },
    },
  ];
}

export function findPostingStyle(
  id: string | null | undefined,
  central: boolean,
): PostingStyle | null {
  return postingStyles(central).find((s) => s.id === id) ?? null;
}

/** A plan filled from a style, ready to review and save. */
export function planFromStyle(style: PostingStyle): PostingPlan {
  const rows = {} as Record<PostingRowId, PostingRow>;
  for (const id of POSTING_ROWS) {
    const r = style.rows[id];
    rows[id] = row(r.enabled, r.packaging, r.grades, r.others);
  }
  return {
    version: POSTING_PLAN_VERSION,
    styleId: style.id,
    rows,
    bigMoments: { juniorRunsBar: 100 },
  };
}

/** The table every club starts on (R13): the default style for its data source. */
export function defaultPostingPlan(central: boolean): PostingPlan {
  return planFromStyle(findPostingStyle(DEFAULT_STYLE_ID, central)!);
}

function sameRow(a: PostingRow, b: PostingRow): boolean {
  if (a.enabled !== b.enabled) return false;
  if (!a.enabled) return true; // an off row's other fields don't matter
  if (a.packaging !== b.packaging || a.others !== b.others) return false;
  const keys = new Set([...Object.keys(a.grades), ...Object.keys(b.grades)]);
  for (const k of keys) {
    if (rowAllows(a, k, false) !== rowAllows(b, k, false)) return false;
    if (rowAllows(a, k, true) !== rowAllows(b, k, true)) return false;
  }
  if (a.packaging === "round" && rowHasJuniors(a)) {
    if (rowJuniorPackaging(a) !== rowJuniorPackaging(b)) return false;
  }
  return true;
}

/** The style whose rows this plan matches, or null when it's custom. */
export function matchingStyle(plan: PostingPlan, central: boolean): PostingStyle | null {
  return (
    postingStyles(central).find((s) =>
      POSTING_ROWS.every((id) => sameRow(plan.rows[id], s.rows[id])),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Mirror back to legacy settings (KTD3 of the Posting Plan plan)

type FamilyLike = { enabled: boolean; grades: Record<string, boolean> };
type ModeLike = "off" | "perFixture" | "perRound" | "both";

export interface LegacyPostingOutput {
  families: {
    results: FamilyLike;
    achievements: FamilyLike;
    roundup: FamilyLike;
    matchday: FamilyLike;
  };
  modes: { gameDay: ModeLike; teamLists: ModeLike; weekendWrap: ModeLike };
}

/**
 * Rows sharing one legacy family collapse widest-wins: the family is on if any
 * row is, and a grade is on if any row allows it. Legacy families can only say
 * "seniors by default", so a grade no row lists explicitly falls back to that
 * default — an older build after rollback may draft more than the saved plan,
 * never less.
 */
function union(rows: PostingRow[]): FamilyLike {
  const on = rows.filter((r) => r.enabled);
  const keys = new Set(on.flatMap((r) => Object.keys(r.grades)));
  const grades: Record<string, boolean> = {};
  for (const k of keys) {
    // Per row: true / false when listed, "default" when unlisted under "seniors".
    const votes = on.map((r) =>
      k in r.grades ? r.grades[k] : r.others === "seniors" ? "default" : false,
    );
    if (votes.includes(true)) grades[k] = true;
    else if (!votes.includes("default")) grades[k] = false;
  }
  return { enabled: on.length > 0, grades };
}

export function postingPlanToLegacy(plan: PostingPlan): LegacyPostingOutput {
  const r = plan.rows;
  const modeOf = (x: PostingRow): ModeLike =>
    !x.enabled ? "off" : x.packaging === "round" ? "perRound" : "perFixture";
  const resultsCarousel = rowRound(r.results);
  return {
    families: {
      results: { enabled: rowIndividual(r.results), grades: { ...r.results.grades } },
      achievements: union([r.milestones, r.bigMoments, r.debuts]),
      // Grade leaders are retired; the round-up family now only carries the results carousel.
      roundup: { enabled: resultsCarousel, grades: {} },
      matchday: union([r.gameDay, r.teamLists]),
    },
    modes: {
      gameDay: modeOf(r.gameDay),
      teamLists: modeOf(r.teamLists),
      weekendWrap: resultsCarousel ? "perRound" : "perFixture",
    },
  };
}

// ---------------------------------------------------------------------------
// Validation / normalisation

export interface PostingPlanContext {
  central: boolean;
}

export const PACKAGING_LABELS: Record<Packaging, string> = {
  individual: "Each on its own",
  round: "One round carousel",
};

export const JUNIOR_PACKAGING_LABELS: Record<JuniorPackaging, string> = {
  combined: "In the same carousel as seniors",
  separate: "Their own carousel",
};

/** Why a submitted plan can't be saved, or null when it's fine. */
export function invalidPostingPlan(plan: PostingPlan, ctx: PostingPlanContext): string | null {
  for (const id of POSTING_ROWS) {
    const r = plan.rows[id];
    const def = POSTING_ROW_DEFS[id];
    if (!def.packaging.includes(r.packaging)) {
      const how = PACKAGING_LABELS[r.packaging]?.toLowerCase() ?? String(r.packaging);
      return `${def.label} can't be posted as ${how}.`;
    }
    if (r.enabled && r.packaging === "round" && def.roundCentralOnly && !ctx.central) {
      return `${def.label} round carousels need your club's results from the association database.`;
    }
    if (!def.juniors && rowHasJuniors(r)) {
      return `${def.label} can't draft for junior grades.`;
    }
  }
  const bar = plan.bigMoments.juniorRunsBar as number;
  if (bar !== 50 && bar !== 100) return "The junior runs bar must be 50 or 100.";
  return null;
}

/**
 * Coerce an untrusted (stored or submitted) plan onto the full shape, taking
 * anything missing or malformed from `base`. A plan older than version 2 (or
 * nothing at all) is replaced by `base` wholesale (ADR-004). Values a row
 * doesn't support are kept as submitted so validation can reject them with a
 * message.
 */
export function normalizePostingPlan(input: unknown, base: PostingPlan): PostingPlan {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (src.version !== POSTING_PLAN_VERSION) return planCopy(base);
  const rowsIn = (src.rows && typeof src.rows === "object" ? src.rows : {}) as Record<
    string,
    unknown
  >;
  const rows = {} as Record<PostingRowId, PostingRow>;
  for (const id of POSTING_ROWS) {
    const b = base.rows[id];
    const raw = (rowsIn[id] && typeof rowsIn[id] === "object" ? rowsIn[id] : {}) as Partial<
      Record<keyof PostingRow, unknown>
    >;
    const grades: Record<string, boolean> = {};
    const rawGrades =
      raw.grades && typeof raw.grades === "object" ? (raw.grades as Record<string, unknown>) : null;
    for (const [g, v] of Object.entries(rawGrades ?? b.grades)) {
      if (typeof v === "boolean") grades[g] = v;
    }
    const packaging =
      raw.packaging === "individual" || raw.packaging === "round"
        ? raw.packaging
        : ((raw.packaging as Packaging | undefined) ?? b.packaging);
    const out: PostingRow = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : b.enabled,
      packaging,
      grades,
      others: raw.others === "seniors" || raw.others === "off" ? raw.others : b.others,
    };
    const juniors =
      raw.juniors === "combined" || raw.juniors === "separate" ? raw.juniors : b.juniors;
    if (juniors && packaging === "round") out.juniors = juniors;
    rows[id] = out;
  }
  const styleId =
    typeof src.styleId === "string" ? src.styleId : src.styleId === null ? null : base.styleId;
  const bm = (src.bigMoments && typeof src.bigMoments === "object" ? src.bigMoments : {}) as {
    juniorRunsBar?: unknown;
  };
  const juniorRunsBar =
    typeof bm.juniorRunsBar === "number"
      ? (bm.juniorRunsBar as JuniorRunsBar)
      : base.bigMoments.juniorRunsBar;
  return { version: POSTING_PLAN_VERSION, styleId, rows, bigMoments: { juniorRunsBar } };
}

function planCopy(plan: PostingPlan): PostingPlan {
  const rows = {} as Record<PostingRowId, PostingRow>;
  for (const id of POSTING_ROWS) {
    const r = plan.rows[id];
    rows[id] = {
      ...row(r.enabled, r.packaging, r.grades, r.others),
      ...(r.juniors ? { juniors: r.juniors } : {}),
    };
  }
  return {
    version: POSTING_PLAN_VERSION,
    styleId: plan.styleId,
    rows,
    bigMoments: { ...plan.bigMoments },
  };
}
