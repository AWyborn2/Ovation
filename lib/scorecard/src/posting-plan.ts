/**
 * The Posting Plan (plan 2026-10-07-001): one row per card kind deciding
 * whether it drafts, for which grades, and how it is packaged.
 *
 * Shared by the API (which stores, validates and resolves it) and the web
 * admin (which edits it). Pure: no DB, no React.
 *
 * A club that has never saved a plan gets one derived from its legacy
 * settings (family switches + round-schedule modes), so nothing it drafts
 * changes until an admin saves (KTD1, KTD5).
 */

export const POSTING_ROWS = [
  "results",
  "milestones",
  "feats",
  "debuts",
  "gradeLeaders",
  "clubLeaderboards",
  "ladders",
  "gameDay",
  "teamLists",
] as const;
export type PostingRowId = (typeof POSTING_ROWS)[number];

export type Packaging = "individual" | "round" | "both";
/** What happens to a grade the row doesn't list: seniors draft (juniors don't), or nothing. */
export type OtherGrades = "seniors" | "off";

export interface PostingRow {
  enabled: boolean;
  packaging: Packaging;
  /** Explicit per-grade choices; a grade absent here follows `others`. */
  grades: Record<string, boolean>;
  others: OtherGrades;
}

export interface PostingPlan {
  version: 1;
  /** The style the plan was filled from, or null when built by hand / derived. */
  styleId: string | null;
  rows: Record<PostingRowId, PostingRow>;
}

export interface PostingRowDef {
  label: string;
  /** Card kinds the row governs (for the UI and the reader guard). */
  kinds: readonly string[];
  packaging: readonly Packaging[];
  /** Round carousel needs central data (KTD12). */
  roundCentralOnly: boolean;
}

export const POSTING_ROW_DEFS: Record<PostingRowId, PostingRowDef> = {
  results: {
    label: "Results",
    kinds: ["matchSummary", "weekendWrap"],
    packaging: ["individual", "round", "both"],
    roundCentralOnly: true,
  },
  milestones: {
    label: "Milestones",
    kinds: ["milestone"],
    packaging: ["individual"],
    roundCentralOnly: false,
  },
  feats: {
    label: "Centuries and five-fors",
    kinds: ["century", "fiveFor"],
    packaging: ["individual"],
    roundCentralOnly: false,
  },
  debuts: { label: "Debuts", kinds: ["debut"], packaging: ["individual"], roundCentralOnly: false },
  gradeLeaders: {
    label: "Grade leaders",
    kinds: ["gradeLeader"],
    packaging: ["individual"],
    roundCentralOnly: false,
  },
  clubLeaderboards: {
    label: "Club leaderboards",
    kinds: ["clubLeaderboard"],
    packaging: ["round"],
    roundCentralOnly: true,
  },
  ladders: { label: "Ladders", kinds: ["ladder"], packaging: ["round"], roundCentralOnly: true },
  gameDay: {
    label: "Game day",
    kinds: ["matchDay", "roundFixtures"],
    packaging: ["individual", "round"],
    roundCentralOnly: false,
  },
  teamLists: {
    label: "Team lists",
    kinds: ["teamList", "teamListRound"],
    packaging: ["individual", "round"],
    roundCentralOnly: false,
  },
};

// ---------------------------------------------------------------------------
// Grades

/** Does this row draft for `grade`? Same rule as the family switches (KTD4). */
export function rowAllows(row: PostingRow, grade: string | null, junior: boolean): boolean {
  if (!row.enabled) return false;
  const explicit = row.grades[grade ?? ""];
  if (explicit !== undefined) return explicit;
  return row.others === "seniors" ? !junior : false;
}

/** The row drafts one card per event (match, fixture, milestone…). */
export function rowIndividual(row: PostingRow): boolean {
  return row.enabled && row.packaging !== "round";
}

/** The row drafts one club-wide carousel per round. */
export function rowRound(row: PostingRow): boolean {
  return row.enabled && row.packaging !== "individual";
}

// ---------------------------------------------------------------------------
// Derivation from legacy settings

type FamilyLike = { enabled: boolean; grades: Record<string, boolean> };
type ModeLike = "off" | "perFixture" | "perRound" | "both";

export interface LegacyPostingInput {
  families: {
    results: FamilyLike;
    achievements: FamilyLike;
    roundup: FamilyLike;
    matchday: FamilyLike;
  };
  modes: { gameDay: ModeLike; teamLists: ModeLike; weekendWrap: ModeLike };
  /** Whether the club reads central data (results carousels need it). */
  central: boolean;
}

const row = (
  enabled: boolean,
  packaging: Packaging,
  grades: Record<string, boolean> = {},
  others: OtherGrades = "seniors",
): PostingRow => ({ enabled, packaging, grades: { ...grades }, others });

/**
 * The plan a club's current settings amount to. Reproduces today's gates
 * exactly (KTD5):
 *  - per-match results: the results family, unless the weekend-wrap mode is
 *    carousel-only;
 *  - results carousel: the round-up family with a carousel mode, on central
 *    clubs only, covering every senior grade;
 *  - game day / team lists: the match-day family, per fixture or per round.
 */
export function derivePostingPlan(input: LegacyPostingInput): PostingPlan {
  const { families: f, modes, central } = input;
  const perMatch = f.results.enabled && modes.weekendWrap !== "perRound";
  const carousel =
    central &&
    f.roundup.enabled &&
    (modes.weekendWrap === "perRound" || modes.weekendWrap === "both");
  const resultsPackaging: Packaging =
    perMatch && carousel ? "both" : carousel ? "round" : "individual";

  const matchday = (mode: ModeLike): PostingRow => {
    const on = f.matchday.enabled && (mode === "perFixture" || mode === "perRound");
    return row(on, mode === "perRound" ? "round" : "individual", f.matchday.grades);
  };

  return {
    version: 1,
    styleId: null,
    rows: {
      results: row(perMatch || carousel, resultsPackaging, f.results.grades),
      milestones: row(f.achievements.enabled, "individual", f.achievements.grades),
      feats: row(f.achievements.enabled, "individual", f.achievements.grades),
      debuts: row(f.achievements.enabled, "individual", f.achievements.grades),
      gradeLeaders: row(f.roundup.enabled, "individual", f.roundup.grades),
      clubLeaderboards: row(false, "round"),
      ladders: row(false, "round"),
      gameDay: matchday(modes.gameDay),
      teamLists: matchday(modes.teamLists),
    },
  };
}

// ---------------------------------------------------------------------------
// Mirror back to legacy settings (KTD3)

export interface LegacyPostingOutput {
  families: { results: FamilyLike; achievements: FamilyLike; roundup: FamilyLike; matchday: FamilyLike };
  modes: { gameDay: ModeLike; teamLists: ModeLike; weekendWrap: ModeLike };
}

/**
 * Rows sharing one legacy family collapse widest-wins (KTD3): the family is on
 * if any row is, and a grade is on if any row allows it. Legacy families can
 * only say "seniors by default", so a grade no row lists explicitly falls back
 * to that default — rollback may draft more than the saved plan, never less.
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
      achievements: union([r.milestones, r.feats, r.debuts]),
      roundup: (() => {
        const u = union([r.gradeLeaders]);
        return { enabled: u.enabled || resultsCarousel, grades: u.grades };
      })(),
      matchday: union([r.gameDay, r.teamLists]),
    },
    modes: {
      gameDay: modeOf(r.gameDay),
      teamLists: modeOf(r.teamLists),
      weekendWrap:
        r.results.enabled && r.results.packaging === "both"
          ? "both"
          : resultsCarousel
            ? "perRound"
            : "perFixture",
    },
  };
}

// ---------------------------------------------------------------------------
// Styles (KTD11)

export interface PostingStyle {
  id: string;
  label: string;
  description: string;
  rows: Record<PostingRowId, PostingRow>;
}

const A_GRADES = { "A Grade": true, "Female A Grade": true };

export const POSTING_STYLES: readonly PostingStyle[] = [
  {
    id: "round-carousels",
    label: "Round carousels + individual highlights",
    description:
      "Results, team lists, ladders and leaderboards as one club-wide carousel per round; milestones and A Grade debuts on their own.",
    rows: {
      results: row(true, "round"),
      milestones: row(true, "individual"),
      feats: row(true, "individual"),
      debuts: row(true, "individual", A_GRADES, "off"),
      gradeLeaders: row(false, "individual"),
      clubLeaderboards: row(true, "round"),
      ladders: row(true, "round"),
      gameDay: row(true, "individual"),
      teamLists: row(true, "round"),
    },
  },
  {
    id: "every-match",
    label: "Every match on its own",
    description: "A card for every match, fixture, team list and milestone.",
    rows: {
      results: row(true, "individual"),
      milestones: row(true, "individual"),
      feats: row(true, "individual"),
      debuts: row(true, "individual"),
      gradeLeaders: row(true, "individual"),
      clubLeaderboards: row(false, "round"),
      ladders: row(false, "round"),
      gameDay: row(true, "individual"),
      teamLists: row(true, "individual"),
    },
  },
  {
    id: "results-only",
    label: "Results only",
    description: "Just a card for each result.",
    rows: {
      results: row(true, "individual"),
      milestones: row(false, "individual"),
      feats: row(false, "individual"),
      debuts: row(false, "individual"),
      gradeLeaders: row(false, "individual"),
      clubLeaderboards: row(false, "round"),
      ladders: row(false, "round"),
      gameDay: row(false, "individual"),
      teamLists: row(false, "individual"),
    },
  },
];

export function findPostingStyle(id: string | null | undefined): PostingStyle | null {
  return POSTING_STYLES.find((s) => s.id === id) ?? null;
}

/** A plan filled from a style, ready to review and save. */
export function planFromStyle(style: PostingStyle): PostingPlan {
  const rows = {} as Record<PostingRowId, PostingRow>;
  for (const id of POSTING_ROWS) {
    const r = style.rows[id];
    rows[id] = row(r.enabled, r.packaging, r.grades, r.others);
  }
  return { version: 1, styleId: style.id, rows };
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
  return true;
}

/** The style whose rows this plan matches, or null when it's custom. */
export function matchingStyle(plan: PostingPlan): PostingStyle | null {
  return POSTING_STYLES.find((s) => POSTING_ROWS.every((id) => sameRow(plan.rows[id], s.rows[id]))) ?? null;
}

// ---------------------------------------------------------------------------
// Validation / normalisation

export interface PostingPlanContext {
  central: boolean;
}

/** Why a submitted plan can't be saved, or null when it's fine. */
export function invalidPostingPlan(plan: PostingPlan, ctx: PostingPlanContext): string | null {
  for (const id of POSTING_ROWS) {
    const r = plan.rows[id];
    const def = POSTING_ROW_DEFS[id];
    if (!def.packaging.includes(r.packaging)) {
      return `${def.label} can't be posted as ${PACKAGING_LABELS[r.packaging].toLowerCase()}.`;
    }
    if (r.enabled && r.packaging !== "individual" && def.roundCentralOnly && !ctx.central) {
      return `${def.label} round carousels need your club's results from the association database.`;
    }
  }
  return null;
}

export const PACKAGING_LABELS: Record<Packaging, string> = {
  individual: "Each on its own",
  round: "One round carousel",
  both: "Each on its own and a round carousel",
};

/**
 * Coerce an untrusted (stored or submitted) plan onto the full shape, taking
 * anything missing or malformed from `base`. Packaging a row doesn't support
 * is kept as submitted so validation can reject it with a message.
 */
export function normalizePostingPlan(input: unknown, base: PostingPlan): PostingPlan {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rowsIn = (src.rows && typeof src.rows === "object" ? src.rows : {}) as Record<string, unknown>;
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
    rows[id] = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : b.enabled,
      packaging:
        raw.packaging === "individual" || raw.packaging === "round" || raw.packaging === "both"
          ? raw.packaging
          : b.packaging,
      grades,
      others: raw.others === "seniors" || raw.others === "off" ? raw.others : b.others,
    };
  }
  const styleId = typeof src.styleId === "string" ? src.styleId : src.styleId === null ? null : base.styleId;
  return { version: 1, styleId, rows };
}
