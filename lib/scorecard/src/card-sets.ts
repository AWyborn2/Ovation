import { isJuniorGradeLabel } from "./junior-grade";

/*
 * Balanced card sets (plan docs/plans/2026-10-01-001-feat-balanced-card-sets-plan.md).
 * Shared by the web app (previews, editor, downloads) and the api-server
 * (post pack), so a set always splits the same way wherever it is rendered.
 */

/**
 * Even distribution of rows across detail cards (balanced card sets, R2/R3).
 *
 * Rules, in order:
 *  1. Rows split into sections (senior / junior) in their original order;
 *     sections never share a card.
 *  2. A section of n rows needs k = ceil(n / cap) cards.
 *  3. Sizes are as even as possible: the first n % k cards get one row more
 *     than the rest, so sizes differ by at most one, fullest first
 *     (6 → 3+3, 7 → 4+3, 11 → 4+4+3; never 5+1).
 *  4. Among cuts that keep exactly those sizes there is no freedom, so a
 *     group boundary is only honoured when it already falls on a cut; when
 *     two equally even layouts exist (sizes may be permuted between cards of
 *     the same size), the one whose cuts land on more group boundaries wins.
 */

export interface BalanceOptions<T> {
  /** Most rows a card holds. */
  cap: number;
  /** Section a row belongs to; rows of different sections never share a card. */
  sectionOf?: (row: T) => string;
  /** Group a row belongs to (men / women / other); breaks prefer group boundaries. */
  groupOf?: (row: T) => string;
}

export interface BalancedCard<T> {
  section: string;
  rows: T[];
}

/** Card sizes for n rows at `cap`: as even as possible, fullest first. */
export function evenSizes(n: number, cap: number): number[] {
  if (n <= 0) return [];
  const c = Math.max(1, Math.floor(cap));
  const k = Math.ceil(n / c);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Split rows into sections, preserving the order sections first appear in. */
function sections<T>(rows: readonly T[], sectionOf?: (row: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const s = sectionOf ? sectionOf(r) : "all";
    const list = out.get(s) ?? [];
    list.push(r);
    out.set(s, list);
  }
  return [...out.entries()];
}

/** Every distinct ordering of `sizes` that keeps the larger cards first or not. */
function orderings(sizes: number[]): number[][] {
  const big = sizes[0] ?? 0;
  const nBig = sizes.filter((s) => s === big).length;
  const nSmall = sizes.length - nBig;
  if (nSmall === 0 || nBig === 0) return [sizes];
  // Choose which positions hold the larger cards (small k, so this stays tiny).
  const out: number[][] = [];
  const k = sizes.length;
  const pick = (start: number, left: number, acc: number[]) => {
    if (left === 0) {
      out.push(Array.from({ length: k }, (_, i) => (acc.includes(i) ? big : big - 1)));
      return;
    }
    for (let i = start; i <= k - left; i++) pick(i + 1, left - 1, [...acc, i]);
  };
  pick(0, nBig, []);
  return out;
}

function chunk<T>(rows: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const s of sizes) {
    out.push(rows.slice(i, i + s));
    i += s;
  }
  return out;
}

/** Plan rows onto cards: even sizes per section, cuts on group boundaries where possible. */
export function planRows<T>(rows: readonly T[], opts: BalanceOptions<T>): BalancedCard<T>[] {
  const out: BalancedCard<T>[] = [];
  for (const [section, list] of sections(rows, opts.sectionOf)) {
    const sizes = evenSizes(list.length, opts.cap);
    let best = sizes;
    if (opts.groupOf && sizes.length > 1) {
      const groupOf = opts.groupOf;
      const score = (cand: number[]) => {
        let at = 0;
        let hits = 0;
        for (const s of cand.slice(0, -1)) {
          at += s;
          const before = list[at - 1];
          const after = list[at];
          if (before !== undefined && after !== undefined && groupOf(before) !== groupOf(after)) {
            hits++;
          }
        }
        return hits;
      };
      let bestScore = score(sizes);
      for (const cand of orderings(sizes)) {
        const sc = score(cand);
        // Ties keep the default (fullest first).
        if (sc > bestScore) {
          best = cand;
          bestScore = sc;
        }
      }
    }
    for (const rowsOnCard of chunk(list, best)) out.push({ section, rows: rowsOnCard });
  }
  return out;
}

/**
 * Sections and groups for balanced card sets, from free-text grade labels.
 * Sections never share a card (juniors isolation); groups only steer where a
 * card break falls.
 */

export type SetSection = "senior" | "junior";
export type SetGroup = "men" | "women" | "other" | "junior";

export function sectionOfGrade(grade: string | null | undefined): SetSection {
  return isJuniorGradeLabel(grade) ? "junior" : "senior";
}

/** Women's / girls' grades ("Female A Grade", "Women's T20", "FA", "Girls U15"). */
const WOMEN_RE = /\b(female|women'?s?|womens|ladies|girls?)\b|^F[A-D]$/i;
/** Grades that are neither the men's ladder nor women's (T20, vets, masters, social). */
const OTHER_RE =
  /\b(t20|twenty20|vets?|veterans|masters|over\s?\d{2}|o\d{2}|social|midweek|colts)\b/i;

export function groupOfGrade(grade: string | null | undefined): SetGroup {
  const g = (grade ?? "").trim();
  if (isJuniorGradeLabel(g)) return "junior";
  if (WOMEN_RE.test(g)) return "women";
  if (OTHER_RE.test(g)) return "other";
  return "men";
}

/**
 * Balanced card sets (plan 2026-10-01-001, KTD1): a list card that holds more
 * than one card's worth of rows posts as a COVER followed by DETAIL cards,
 * the rows spread evenly (sizes differ by at most one) and junior rows never
 * on a senior card.
 *
 * The set is derived from the card's input, never stored: the queue, the
 * editor, the share modal and the still harness all call this with the same
 * input and get the same slides. Each slide is an ordinary card input (with
 * `setRole` / `setPage` / `density`), so every pack renders it unchanged.
 */

export interface CardSetOptions {
  /** Cover card: `undefined` = automatic (when there is more than one detail card). */
  cover?: boolean;
  /** "none" turns off men / women / other break preferences (sections still apply). */
  grouping?: "auto" | "none";
}

export type SlideRole = "single" | "cover" | "detail";

/** Row sizes a detail slide may use (one per set, so every slide matches). */
export type SetDensity = "spotlight" | "standard" | "compact";

/**
 * The structural shape of the card inputs the planner reads (the web app's
 * `ShareCardInput` union satisfies it; the server passes stored drafts).
 */
export interface SetInput {
  kind: string;
  junior?: boolean;
  [key: string]: unknown;
}

type FixtureRow = { grade: string };
type MatchRow = { gradeLabel: string };
type ResultRow = { grade: string };
type TeamRow = {
  grade: string;
  gradeRound: string;
  competitionLine: string;
  venueDateTime: string;
  players: unknown[];
  squadPhotoUrl?: string | null;
  /** "shirt" when the club numbers its players: rows then print shirt numbers. */
  numbering?: "shirt";
  [extra: string]: unknown;
};

export interface PlannedSlide<I extends SetInput = SetInput> {
  /** Stable key for per-slide edits: "single", "cover" or "detail:<section>:<first row>". */
  key: string;
  role: SlideRole;
  input: I;
  /** 1-based position in the post. */
  page: number;
  of: number;
}

/** The kinds that become sets, and how many rows a detail card holds. */
export const SET_CAPS = {
  roundFixtures: 5,
  weekendWrap: 4,
  teamListRound: 1,
  resultsSummary: 3,
} as const;

export type SetKind = keyof typeof SET_CAPS;

export function isSetKind(kind: string): kind is SetKind {
  return kind in SET_CAPS;
}

/** One row size per set, from its fullest detail card. */
export function densityFor(maxRows: number, cap: number): SetDensity {
  return cap > 1 && maxRows <= 2 ? "spotlight" : "standard";
}

type Planned = { section: string; rows: unknown[] };

function balanced<T>(
  rows: T[],
  cap: number,
  gradeOf: (r: T) => string,
  forceJunior: boolean,
  grouping: CardSetOptions["grouping"],
): Planned[] {
  return planRows(rows, {
    cap,
    sectionOf: (r) => (forceJunior ? "junior" : sectionOfGrade(gradeOf(r))),
    groupOf: grouping === "none" ? undefined : (r) => groupOfGrade(gradeOf(r)),
  });
}

/**
 * One team of a round as its own team-list card: the team's fields as they
 * came (its grade, so a grade sponsor finds it, and the match parts the
 * Starting XI sets out), plus the round's chosen design.
 */
function teamCard(team: TeamRow, junior: boolean, design: unknown): SetInput {
  const { squadPhotoUrl, ...rest } = team;
  return {
    ...rest,
    kind: "teamList",
    ...(squadPhotoUrl ? { squadPhotoUrl } : {}),
    ...(typeof design === "string" && design ? { design } : {}),
    ...(junior ? { junior: true } : {}),
  };
}

/**
 * A round carousel of ordinary cards (Posting Plan, plan 2026-10-07-001 KTD8):
 * the input is itself a complete card (its first slide) and `carousel` lists
 * every slide, e.g. one club leaderboard per category or one ladder per grade.
 * No cover — each slide carries its own title — so code that doesn't know
 * about carousels still shows a sensible single card.
 */
export function carouselSlides(input: SetInput): SetInput[] | null {
  const list = (input as { carousel?: unknown }).carousel;
  return Array.isArray(list) && list.length > 0 ? (list as SetInput[]) : null;
}

/** Whether this input posts as more than one slide (a set kind or a round carousel). */
export function isSetInput(input: SetInput): boolean {
  return isSetKind(input.kind) || carouselSlides(input) !== null;
}

/** Plan the slides one card input posts as (a single slide for every non-set kind). */
export function planCardSet<I extends SetInput>(
  input: I,
  opts: CardSetOptions = {},
): PlannedSlide<I>[] {
  const carousel = carouselSlides(input);
  if (carousel) {
    const of = carousel.length;
    return carousel.map((slide, i) => ({
      key: of === 1 ? "single" : `detail:slide:${i}`,
      role: of === 1 ? "single" : "detail",
      input: (of === 1 ? slide : { ...slide, setPage: `${i + 1}/${of}` }) as unknown as I,
      page: i + 1,
      of,
    }));
  }
  if (!isSetKind(input.kind)) return [{ key: "single", role: "single", input, page: 1, of: 1 }];
  const out = planSet(input, opts);
  return out as unknown as PlannedSlide<I>[];
}

function planSet(input: SetInput, opts: CardSetOptions): PlannedSlide[] {
  let details: {
    section: string;
    firstKey: string;
    build: (page: string | null, density: SetDensity) => SetInput;
    count: number;
  }[];
  let cap: number;

  switch (input.kind as SetKind) {
    case "roundFixtures": {
      cap = SET_CAPS.roundFixtures;
      const parts = balanced(
        (input.fixtures as FixtureRow[]) ?? [],
        cap,
        (f) => f.grade,
        !!input.junior,
        opts.grouping,
      );
      details = parts.map((p) => {
        const rows = p.rows as FixtureRow[];
        return {
          section: p.section,
          firstKey: rows[0]?.grade ?? "",
          count: rows.length,
          build: (page, density) => ({
            ...input,
            fixtures: rows,
            setPage: page,
            density,
            ...(p.section === "junior" ? { junior: true } : {}),
          }),
        };
      });
      break;
    }
    case "weekendWrap": {
      // A round-results carousel (Ash, 6 Oct 2026): the wrap's cover, then each match's own
      // result card, in the wrap's order. Without `results` it is the list-style wrap.
      const results = Array.isArray(input.results) ? (input.results as SetInput[]) : [];
      if (results.length > 0) {
        cap = 1;
        const rows = (input.matches as MatchRow[] | undefined) ?? [];
        details = results.map((r, i) => {
          // Keyed by the matching wrap row's grade (results and matches share an order).
          const grade = rows[i]?.gradeLabel ?? String(i);
          return {
            section: "senior",
            firstKey: grade,
            count: 1,
            build: (page) => ({ ...r, setPage: page }),
          };
        });
        break;
      }
      cap = SET_CAPS.weekendWrap;
      const parts = balanced(
        (input.matches as MatchRow[]) ?? [],
        cap,
        (m) => m.gradeLabel,
        !!input.junior,
        opts.grouping,
      );
      details = parts.map((p) => {
        const rows = p.rows as MatchRow[];
        return {
          section: p.section,
          firstKey: rows[0]?.gradeLabel ?? "",
          count: rows.length,
          build: (page, density) => ({
            ...input,
            matches: rows,
            setPage: page,
            density,
            ...(p.section === "junior" ? { junior: true } : {}),
          }),
        };
      });
      break;
    }
    case "resultsSummary": {
      cap = SET_CAPS.resultsSummary;
      const parts = balanced(
        (input.results as ResultRow[]) ?? [],
        cap,
        (r) => r.grade,
        !!input.junior,
        opts.grouping,
      );
      details = parts.map((p) => {
        const rows = p.rows as ResultRow[];
        return {
          section: p.section,
          firstKey: rows[0]?.grade ?? "",
          count: rows.length,
          build: (page, density) => ({
            ...input,
            results: rows,
            setPage: page,
            density,
            ...(p.section === "junior" ? { junior: true } : {}),
          }),
        };
      });
      break;
    }
    case "teamListRound": {
      cap = SET_CAPS.teamListRound;
      const parts = balanced((input.teams as TeamRow[]) ?? [], cap, (t) => t.grade, false, "none");
      details = parts.map((p) => {
        const team = p.rows[0] as TeamRow;
        return {
          section: p.section,
          firstKey: team.grade,
          count: 1,
          build: (page) => ({
            ...teamCard(team, p.section === "junior", input.design),
            setPage: page,
          }),
        };
      });
      break;
    }
  }

  const density = densityFor(Math.max(0, ...details.map((d) => d.count)), cap);
  const wantCover =
    opts.cover ?? (input.kind === "teamListRound" ? details.length >= 2 : details.length > 1);
  // A round of team lists IS its cover when there is nothing else to show.
  const cover = wantCover || details.length === 0;
  const of = details.length + (cover ? 1 : 0);

  const only = details[0];
  if (!cover && details.length === 1 && only) {
    const d = only;
    return [{ key: "single", role: "single", input: d.build(null, density), page: 1, of: 1 }];
  }

  const slides: PlannedSlide[] = [];
  if (cover) {
    slides.push({
      key: "cover",
      role: "cover",
      input: { ...input, setRole: "cover", setPage: null },
      page: 1,
      of,
    });
  }
  details.forEach((d, i) => {
    const page = i + 1 + (cover ? 1 : 0);
    slides.push({
      key: `detail:${d.section}:${d.firstKey}`,
      role: "detail",
      input: d.build(`${page}/${of}`, density),
      page,
      of,
    });
  });
  return slides;
}

/**
 * The single card a set exports at landscape (web / email): the cover, which
 * carries the round's headline number and full summary line, whenever the
 * set has more than one slide; otherwise the card itself.
 */
export function landscapeSummary<I extends SetInput>(input: I, opts: CardSetOptions = {}): I {
  const carousel = carouselSlides(input);
  if (carousel) return carousel[0] as unknown as I;
  if (!isSetKind(input.kind)) return input;
  const slides = planCardSet(input, { ...opts, cover: undefined });
  if (slides.length <= 1) return slides[0]?.input ?? input;
  return { ...input, setRole: "cover", setPage: null };
}

/**
 * The grade tile text: "A Grade" → "A", "Female A Grade" → "FA",
 * "Under 15" → "U15", "T20" → "T20".
 */
export function gradeTile(grade: string): string {
  const words = grade
    .replace(/\bgrade\b/gi, "")
    .replace(/\bcricket\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return grade.trim().slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words
    .map((w) => (/\d/.test(w) ? w.replace(/[^0-9]/g, "") : (w[0] ?? "")))
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * Junior same-day slides (ADR-010 P3). A Weekend Carousel normally gives each
 * fixture or result its own slide. With the club's switch on
 * (`card_content.matchDay.juniorConsolidateByDay`), the junior items of one
 * club-time day share a slide instead: grouped by day, then split evenly at
 * the layout's capacity for the size and preset (7 at 4 → 4 + 3).
 *
 * Only Match Day, Results and Match Summary sets consolidate; senior items
 * always keep a slide each, and a senior item never joins a junior day slide
 * (juniors isolation). Slides keep the order the admin chose: a day's slide
 * sits where its first junior item was.
 */

/** The carousel set types whose junior items can share a day slide. */
export const DAY_GROUP_KINDS = ["matchDay", "results", "matchSummary"] as const;
export type DayGroupKind = (typeof DAY_GROUP_KINDS)[number];

export function isDayGroupKind(kind: string): kind is DayGroupKind {
  return (DAY_GROUP_KINDS as readonly string[]).includes(kind);
}

/** The most images a Facebook or Instagram carousel takes. */
export const META_CAROUSEL_MAX_SLIDES = 10;

export interface GroupSlidesOptions<T> {
  /** Whether an item was built from junior sources. */
  junior: (item: T) => boolean;
  /** The item's club-time day, YYYY-MM-DD (the tenant's time zone). */
  dayOf: (item: T) => string;
  /** The club's switch: junior items of one day share a slide. */
  consolidateByDay: boolean;
  /** Items a day slide holds: the layout's capacity for the size and preset. */
  capacity: number;
  /** Slides the carousel adds around these (its title and sponsors pages). */
  reserved?: number;
}

export interface SlideGroup<T> {
  /** "single": one item on its own slide; "day": junior items of one day. */
  role: "single" | "day";
  junior: boolean;
  /** The day a "day" slide covers; null for a single slide. */
  day: string | null;
  items: T[];
}

export interface SlideGroupPlan<T> {
  groups: SlideGroup<T>[];
  /** Every slide the carousel posts, the reserved ones included. */
  slideCount: number;
  /** Set when the carousel has more slides than Meta takes. */
  warning?: string;
}

/** Plan which items share a slide. */
export function groupSlides<T>(
  kind: string,
  items: readonly T[],
  opts: GroupSlidesOptions<T>,
): SlideGroupPlan<T> {
  const capacity = Math.floor(opts.capacity);
  const consolidate = isDayGroupKind(kind) && opts.consolidateByDay && capacity >= 2;
  type Entry = { item: T } | { day: string };
  const entries: Entry[] = [];
  const days = new Map<string, T[]>();
  for (const item of items) {
    if (!consolidate || !opts.junior(item)) {
      entries.push({ item });
      continue;
    }
    const day = opts.dayOf(item);
    const list = days.get(day);
    if (list) list.push(item);
    else {
      days.set(day, [item]);
      entries.push({ day });
    }
  }
  const single = (item: T): SlideGroup<T> => ({
    role: "single",
    junior: opts.junior(item),
    day: null,
    items: [item],
  });
  const groups = entries.flatMap((e): SlideGroup<T>[] => {
    if ("item" in e) return [single(e.item)];
    const list = days.get(e.day)!;
    let at = 0;
    return evenSizes(list.length, capacity).map((size) => {
      const part = list.slice(at, (at += size));
      return part.length === 1
        ? single(part[0]!)
        : { role: "day", junior: true, day: e.day, items: part };
    });
  });
  const slideCount = groups.length + Math.max(0, opts.reserved ?? 0);
  return {
    groups,
    slideCount,
    ...(slideCount > META_CAROUSEL_MAX_SLIDES
      ? {
          warning: `This carousel has ${slideCount} slides. Facebook and Instagram take at most ${META_CAROUSEL_MAX_SLIDES}, so it can be downloaded but not published there. Select fewer fixtures or matches.`,
        }
      : {}),
  };
}
