/**
 * Page token catalogues (ADR-011 §1, T1.4): the text fields, images and
 * repeats each page of a kind's template can bind, extending `KIND_FIELDS`.
 *
 * - Single-card pages (`card`, Match Day's `fixture`, Match Summary's
 *   `result`, Team List's `team`) bind what `KIND_FIELDS` lists for the kind.
 * - Carousel pages bind what the renderer's `bindInput` produces for a
 *   carousel slide (`weekendTitle`, `dateRange`, `dayHeading`, …). The junior
 *   day rows and the sponsors are repeats (`dayRows`, `sponsors`), so day and
 *   sponsors pages lay them out with rows layers.
 *
 * Every token on a content kind's page names the ADR-010 content field that
 * shows or hides it (`roundLabel` → `fixture.round`). A token without one is
 * always shown (club identity, layout values). The drop rule (`drop-rule.ts`)
 * and the fit check read the content fields; validation (L1-B) reads the keys.
 */
import { contentFields, KIND_FIELDS, type KindField, type KindFieldCatalogue } from "./fields";
import type { PageKey } from "./format";
import { kindHasPage, primaryPage, templateKindFor } from "./pages";

/** A token a page can bind, with the ADR-010 content field that shows it, if any. */
export type PageToken = { key: string; label: string; content?: string };
export type PageImageToken = PageToken & { type: "photo" | "logo" };
export type PageRepeat = {
  key: string;
  label: string;
  variants: string[];
  fields: PageToken[];
  /** The content field that shows the list as a whole. */
  content?: string;
};

export type PageTokenCatalogue = {
  kind: string;
  page: PageKey;
  fields: PageToken[];
  images: PageImageToken[];
  repeats: PageRepeat[];
};

/**
 * Images every page can show without listing them: the club's crest and
 * ground photo, and its first three sponsors' logos (every pack prints a
 * sponsor strip on every card; decision O8).
 */
export const IMPLICIT_IMAGE_TOKENS = [
  "clubLogo",
  "groundPhoto",
  "sponsor1",
  "sponsor2",
  "sponsor3",
] as const;

/** A carousel page's sponsor logos by position, as the packs lay them out (`weekendSponsor0…`). */
const weekendSponsors = (n: number, content?: string): PageImageToken[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `weekendSponsor${i}`,
    label: `Sponsor logo ${i + 1}`,
    type: "logo" as const,
    ...(content ? { content } : {}),
  }));

/** The token photo layers bind: the card's photo. */
export const PHOTO_TOKEN = "photo";

/** The club's identity on every page: its name, tagline, initials and hashtag. */
const CLUB_IDENTITY: PageToken[] = [
  { key: "clubName", label: "Club name" },
  { key: "clubTagline", label: "Club tagline" },
  { key: "clubMonogram", label: "Club monogram (no crest)" },
  { key: "clubHashtag", label: "Club hashtag" },
  { key: "hashtags", label: "Hashtag footer" },
];

const CLUB_LOGO: PageImageToken = { key: "clubLogo", label: "Club logo", type: "logo" };

/** Token → content field, for the single-card pages of the content kinds. */
const SINGLE_PAGE_CONTENT: Record<string, Record<string, string>> = {
  matchDay: {
    grade: "fixture.grade",
    roundLabel: "fixture.round",
    "opposition.name": "fixture.opposition",
    "opposition.monogram": "fixture.opposition",
    "opposition.logo": "fixture.oppositionCrest",
    homeAway: "fixture.homeAway",
    oppositionHomeAway: "fixture.homeAway",
    venue: "fixture.venue",
    date: "fixture.date",
    startTime: "fixture.startTime",
    "ladder.club": "fixture.ladder",
    "ladder.opposition": "fixture.ladder",
    lastMeeting: "fixture.lastMeeting",
    milestoneWatch: "fixture.milestoneWatch",
    photo: "fixture.photo",
  },
  matchSummary: {
    matchTitle: "result.grade",
    result: "result.result",
    resultVerb: "result.result",
    resultVerbShort: "result.result",
    resultWord: "result.result",
    "club.name": "result.scores",
    "club.score": "result.scores",
    "club.oversLabel": "result.scores",
    "club.barName": "result.scores",
    "club.monogram": "result.scores",
    "club.logo": "result.scores",
    "opposition.name": "result.scores",
    "opposition.score": "result.scores",
    "opposition.oversLabel": "result.scores",
    "opposition.barName": "result.scores",
    "opposition.monogram": "result.scores",
    "club.performers": "result.performers",
    "opposition.performers": "result.performers",
    "opposition.logo": "result.oppositionCrest",
    "opposition.logoDisplay": "result.oppositionCrest",
    photo: "result.photo",
  },
  teamList: {
    gradeHeading: "team.grade",
    gradeRound: "team.grade",
    competitionLine: "team.grade",
    broadcastRoundLabel: "team.round",
    roundLabel: "team.round",
    venueDateTime: "team.match",
    opponent: "team.match",
    venue: "team.match",
    date: "team.match",
    startTime: "team.match",
    squadPhoto: "team.photo",
    photo: "team.photo",
  },
};

/**
 * The Match Summary's match graphics content (Ovation Match Graphics, plan
 * 2026-10-23, M9): the innings in batting order, the venue and competition,
 * and each innings' batting, bowling and paired rows. `bindInput` fills them.
 */
const INNINGS_FIELDS = (n: 1 | 2): PageToken[] => [
  { key: `innings${n}.team`, label: `Innings ${n} team`, content: "result.scores" },
  { key: `innings${n}.short`, label: `Innings ${n} team short name`, content: "result.scores" },
  { key: `innings${n}.score`, label: `Innings ${n} score (W/R)`, content: "result.scores" },
  { key: `innings${n}.scoreDash`, label: `Innings ${n} score (W-R)`, content: "result.scores" },
  { key: `innings${n}.overs`, label: `Innings ${n} overs`, content: "result.scores" },
];

/** Every field of a batting row. */
export const BATTING_ROW_FIELDS = [
  "name",
  "initialName",
  "initialDotName",
  "surname",
  "runs",
  "runsOnly",
  "notOut",
  "balls",
  "strikeRate",
] as const;

/** Every field of a bowling row. */
export const BOWLING_ROW_FIELDS = [
  "name",
  "initialName",
  "initialDotName",
  "surname",
  "figures",
  "figuresDash",
  "overs",
  "economy",
] as const;

/** A paired row: a batter's fields (`bat…`) beside a bowler's (`bowl…`). */
export const PAIR_ROW_FIELDS = [
  ...BATTING_ROW_FIELDS.map((f) => `bat${f[0]!.toUpperCase()}${f.slice(1)}`),
  ...BOWLING_ROW_FIELDS.map((f) => `bowl${f[0]!.toUpperCase()}${f.slice(1)}`),
];

const ROW_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  initialName: "Initial and surname (K Standing)",
  initialDotName: "Initial and surname (K.Standing)",
  surname: "Surname",
  runs: "Runs (with * not out)",
  runsOnly: "Runs",
  notOut: "Not out mark (*)",
  balls: "Balls faced",
  figures: "Figures (W/R)",
  figuresDash: "Figures (W-R)",
  overs: "Overs",
  strikeRate: "Strike rate",
  economy: "Economy",
  team: "Team",
};

const rowFields = (keys: readonly string[], prefix = ""): PageToken[] =>
  keys.map((key) => {
    const base = key.replace(/^(bat|bowl)/, "");
    const field = base[0]!.toLowerCase() + base.slice(1);
    return {
      key,
      label: `${prefix}${ROW_FIELD_LABELS[field] ?? field}`,
      content: "result.performers",
    };
  });

const INNINGS_REPEATS = (n: 1 | 2): PageRepeat[] => [
  {
    key: `innings${n}.batting`,
    label: `Innings ${n} batting`,
    variants: [],
    content: "result.performers",
    fields: rowFields(BATTING_ROW_FIELDS),
  },
  {
    key: `innings${n}.bowling`,
    label: `Innings ${n} bowling`,
    variants: [],
    content: "result.performers",
    fields: rowFields(BOWLING_ROW_FIELDS),
  },
  {
    key: `innings${n}.pairs`,
    label: `Innings ${n} batters and bowlers`,
    variants: [],
    content: "result.performers",
    fields: [
      ...rowFields(PAIR_ROW_FIELDS.slice(0, BATTING_ROW_FIELDS.length), "Batter: "),
      ...rowFields(PAIR_ROW_FIELDS.slice(BATTING_ROW_FIELDS.length), "Bowler: "),
    ],
  },
];

/**
 * The performance lists (full draft editor plan, stage 4): both innings'
 * batting or bowling rows, each with its team. A list's `pick` chooses whose,
 * sorted how and how many (`rows-pick.ts`); a row's style can differ by side
 * (`club`, `opposition`).
 */
const PERFORMANCE_LISTS: PageRepeat[] = [
  {
    key: "performances.batting",
    label: "Performances: batting",
    variants: ["club", "opposition"],
    content: "result.performers",
    fields: rowFields([...BATTING_ROW_FIELDS, "team"]),
  },
  {
    key: "performances.bowling",
    label: "Performances: bowling",
    variants: ["club", "opposition"],
    content: "result.performers",
    fields: rowFields([...BOWLING_ROW_FIELDS, "team"]),
  },
];

/** Tokens `bindInput` produces on a single-card page that `KIND_FIELDS` doesn't list. */
const SINGLE_PAGE_EXTRA_FIELDS: Record<string, PageToken[]> = {
  matchDay: [{ key: "opposition.monogram", label: "Opposition monogram (no crest)" }],
  matchSummary: [
    { key: "club.monogram", label: "Club side monogram (no crest)" },
    { key: "opposition.monogram", label: "Opposition monogram (no crest)" },
    { key: "club.short", label: "Club side short name", content: "result.scores" },
    { key: "opposition.short", label: "Opposition short name", content: "result.scores" },
    { key: "competition", label: "Competition", content: "result.grade" },
    { key: "venue", label: "Venue" },
    { key: "date", label: "Match date" },
    { key: "winner.name", label: "Winning side", content: "result.result" },
    ...INNINGS_FIELDS(1),
    ...INNINGS_FIELDS(2),
  ],
};

/** Images `bindInput` produces on a single-card page that `KIND_FIELDS` doesn't list. */
const SINGLE_PAGE_EXTRA_IMAGES: Record<string, PageImageToken[]> = {
  matchSummary: [
    { key: "innings1.logo", label: "Innings 1 team logo", type: "logo", content: "result.scores" },
    { key: "innings2.logo", label: "Innings 2 team logo", type: "logo", content: "result.scores" },
    { key: "winner.logo", label: "Winning side's logo", type: "logo", content: "result.scores" },
    { key: "loser.logo", label: "Losing side's logo", type: "logo", content: "result.scores" },
  ],
};

/**
 * The Match Summary's match graphics content (M9) exists in format v2 only: a
 * layer that binds any of it (an Ovation Match Graphics element inserted into
 * a v1 draft) makes the document v2, as v2 styles do.
 */
// Keys no v1 document holds (`venue` and `competition` are older tokens elsewhere).
const MATCH_GRAPHICS_KEYS = [
  "club.short",
  "opposition.short",
  "winner.name",
  "winner.logo",
  "loser.logo",
  "innings1.",
  "innings2.",
  "performances.",
];

/** Whether a layer binds the match graphics content (tokens or rows), which only v2 holds. */
export function usesMatchGraphicsContent(layer: unknown): boolean {
  const json = JSON.stringify(layer ?? null);
  return MATCH_GRAPHICS_KEYS.some(
    (k) =>
      json.includes(`{{${k}`) || json.includes(`"bind":"${k}`) || json.includes(`"repeat":"${k}`),
  );
}

/** Repeats `bindInput` produces on a single-card page that `KIND_FIELDS` doesn't list. */
const SINGLE_PAGE_EXTRA_REPEATS: Record<string, PageRepeat[]> = {
  matchSummary: [...INNINGS_REPEATS(1), ...INNINGS_REPEATS(2), ...PERFORMANCE_LISTS],
};

/** Content fields of each team-list row field. */
const PLAYER_ROW_CONTENT: Record<string, string> = {
  number: "team.players",
  broadcastName: "team.players",
  surname: "team.players",
  role: "team.players",
  os: "team.players",
  debut: "team.debuts",
};

const withContent = (fields: KindField[], map: Record<string, string> | undefined): PageToken[] =>
  fields.map((f) => (map?.[f.key] ? { ...f, content: map[f.key] } : { ...f }));

/** A single-card page: the kind's `KIND_FIELDS`, with content fields on the content kinds. */
function singlePage(kind: string, page: PageKey, cat: KindFieldCatalogue): PageTokenCatalogue {
  const map = SINGLE_PAGE_CONTENT[kind];
  const fields = withContent(cat.fields, map);
  for (const extra of SINGLE_PAGE_EXTRA_FIELDS[kind] ?? []) {
    if (!fields.some((f) => f.key === extra.key))
      fields.push(map?.[extra.key] ? { ...extra, content: map[extra.key] } : { ...extra });
  }
  const images = cat.images.map((i) => (map?.[i.key] ? { ...i, content: map[i.key] } : { ...i }));
  for (const extra of SINGLE_PAGE_EXTRA_IMAGES[kind] ?? [])
    if (!images.some((i) => i.key === extra.key)) images.push({ ...extra });
  return {
    kind,
    page,
    fields,
    images,
    repeats: [
      ...cat.repeats.map((r) => ({
        key: r.key,
        label: r.label,
        variants: [...r.variants],
        fields:
          kind === "teamList" && r.key === "players"
            ? withContent(r.fields, PLAYER_ROW_CONTENT)
            : r.fields.map((f) => ({ ...f })),
        ...(kind === "teamList" && r.key === "players" ? { content: "team.players" } : {}),
      })),
      ...(SINGLE_PAGE_EXTRA_REPEATS[kind] ?? []).map((r) => structuredClone(r)),
    ],
  };
}

/** Match Day's title page: the round's heading, its dates and the cover photo. */
const MATCH_DAY_TITLE: Omit<PageTokenCatalogue, "kind" | "page"> = {
  fields: [
    { key: "weekendTitle", label: "Title", content: "title.heading" },
    { key: "dateRange", label: "Dates", content: "title.dates" },
    { key: "roundLabel", label: "Round", content: "title.round" },
    { key: "fixtureCount", label: "Number of games" },
    { key: "livestream", label: "Livestream link", content: "title.livestream" },
    { key: "sponsorPresentedBy", label: "Presenting sponsor", content: "title.presentingSponsor" },
    ...CLUB_IDENTITY,
  ],
  images: [
    CLUB_LOGO,
    { key: "photo", label: "Cover photo", type: "photo", content: "title.coverPhoto" },
    ...weekendSponsors(3),
  ],
  repeats: [],
};

/** Match Day's junior day slide: the day's fixtures as rows. */
const MATCH_DAY_DAY: Omit<PageTokenCatalogue, "kind" | "page"> = {
  fields: [{ key: "dayHeading", label: "Day heading" }, ...CLUB_IDENTITY],
  images: [CLUB_LOGO],
  repeats: [
    {
      key: "dayRows",
      label: "The day's games",
      variants: [],
      content: "fixture.grade",
      fields: [
        { key: "grade", label: "Grade", content: "fixture.grade" },
        { key: "opposition", label: "Opposition", content: "fixture.opposition" },
        { key: "monogram", label: "Opposition monogram", content: "fixture.opposition" },
        { key: "crest", label: "Opposition crest", content: "fixture.oppositionCrest" },
        { key: "time", label: "Start time", content: "fixture.startTime" },
        { key: "venue", label: "Ground", content: "fixture.venue" },
        { key: "homeAway", label: "Home or away", content: "fixture.homeAway" },
        { key: "round", label: "Round", content: "fixture.round" },
        { key: "meta", label: "Ground · home or away · round", content: "fixture.venue" },
      ],
    },
  ],
};

/** Match Day's sponsors page: the club's sponsors as rows, and its optional blocks. */
const MATCH_DAY_SPONSORS: Omit<PageTokenCatalogue, "kind" | "page"> = {
  fields: [
    { key: "weekendTitle", label: "Title" },
    { key: "dateRange", label: "Dates" },
    { key: "fixtureCount", label: "Number of games" },
    { key: "sponsorThanks", label: "Thank-you line", content: "sponsors.thankYou" },
    { key: "sponsorCta", label: "Thank-you call to action", content: "sponsors.thankYou" },
    { key: "nextHomeMatch", label: "Next home game", content: "sponsors.nextHomeGame" },
    { key: "nextHomeWhen", label: "Next home game date", content: "sponsors.nextHomeGame" },
    { key: "sponsorSocials", label: "Club socials", content: "sponsors.nextHomeGame" },
    ...CLUB_IDENTITY,
  ],
  images: [
    CLUB_LOGO,
    { key: "photo", label: "Background photo", type: "photo", content: "sponsors.background" },
    // The packs' sponsor grid by position (the page's sponsor logos, as the `sponsors`
    // repeat is); the repeat lays out any number.
    ...weekendSponsors(12, "sponsors.logos"),
  ],
  repeats: [
    {
      key: "sponsors",
      label: "Sponsors",
      // `major` rows are the larger tier when "Major sponsors larger" is on.
      variants: ["major"],
      content: "sponsors.logos",
      fields: [
        { key: "name", label: "Sponsor name", content: "sponsors.logos" },
        { key: "logo", label: "Sponsor logo", content: "sponsors.logos" },
      ],
    },
  ],
};

/** Match Summary's junior day slide: the day's results as rows. */
const MATCH_SUMMARY_DAY: Omit<PageTokenCatalogue, "kind" | "page"> = {
  fields: [{ key: "dayHeading", label: "Day heading" }, ...CLUB_IDENTITY],
  images: [CLUB_LOGO],
  repeats: [
    {
      key: "dayRows",
      label: "The day's results",
      variants: ["won", "lost", "draw"],
      content: "result.result",
      fields: [
        { key: "grade", label: "Grade", content: "result.grade" },
        { key: "opposition", label: "Opposition", content: "result.scores" },
        { key: "monogram", label: "Opposition monogram", content: "result.scores" },
        { key: "crest", label: "Opposition crest", content: "result.oppositionCrest" },
        { key: "word", label: "Result headline", content: "result.result" },
        { key: "result", label: "Result", content: "result.result" },
        { key: "clubScore", label: "Club score", content: "result.scores" },
        { key: "oppScore", label: "Opposition score", content: "result.scores" },
      ],
    },
  ],
};

const CAROUSEL_PAGES: Record<
  string,
  Partial<Record<PageKey, Omit<PageTokenCatalogue, "kind" | "page">>>
> = {
  matchDay: { title: MATCH_DAY_TITLE, day: MATCH_DAY_DAY, sponsors: MATCH_DAY_SPONSORS },
  matchSummary: { day: MATCH_SUMMARY_DAY },
};

const clone = (c: Omit<PageTokenCatalogue, "kind" | "page">) => structuredClone(c);

/**
 * A page's token catalogue, or null when the kind has no such page. The
 * Results kind reads the Match Summary template's catalogues.
 */
export function pageTokens(kind: string, page: PageKey): PageTokenCatalogue | null {
  const templateKind = templateKindFor(kind);
  if (!kindHasPage(templateKind, page)) return null;
  const carousel = CAROUSEL_PAGES[templateKind]?.[page];
  if (carousel) return { kind: templateKind, page, ...clone(carousel) };
  const cat = (KIND_FIELDS as Record<string, KindFieldCatalogue>)[templateKind];
  return cat ? singlePage(templateKind, page, cat) : null;
}

/** Every key a page's text can use as a `{{token}}`, its images included. */
export function pageTokenKeys(kind: string, page: PageKey): Set<string> {
  const cat = pageTokens(kind, page);
  return new Set([
    ...IMPLICIT_IMAGE_TOKENS,
    ...(cat?.fields.map((f) => f.key) ?? []),
    ...(cat?.images.map((i) => i.key) ?? []),
  ]);
}

/** The repeat a page offers under `key`, or null. */
export function pageRepeat(kind: string, page: PageKey, key: string): PageRepeat | null {
  return pageTokens(kind, page)?.repeats.find((r) => r.key === key) ?? null;
}

/**
 * The content field that shows a token (or a repeat) on a page, or null when
 * the token is always shown. The card's photo (`photo`, what photo layers
 * bind) maps to the single card's photo field.
 */
export function tokenContentField(kind: string, page: PageKey, token: string): string | null {
  const cat = pageTokens(kind, page);
  if (!cat) return null;
  const hit =
    cat.fields.find((f) => f.key === token) ??
    cat.images.find((i) => i.key === token) ??
    cat.repeats.find((r) => r.key === token);
  if (hit?.content) return hit.content;
  // Photo layers bind the card's photo, which is the single card's photo field.
  if (token === PHOTO_TOKEN && page === primaryPage(cat.kind))
    return SINGLE_PAGE_CONTENT[cat.kind]?.photo ?? null;
  return null;
}

/** Whether a content field of a kind is core (always shown, ADR-010). */
export function isCoreContentField(kind: string, field: string): boolean {
  return contentFields(kind).some((f) => f.key === field && f.tier === "core");
}
