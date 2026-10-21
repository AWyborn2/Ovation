/**
 * Converter content (ADR-011 §5, task T4.2): what the capture renders so the
 * DOM maps back to tokens.
 *
 *   - Sentinel content: every string the input carries is a unique marker
 *     (`QA`, `QB ZB` for a person), so a repeat row's cells are told apart;
 *     the capture then shows every text FIELD as its own marker
 *     (`[[playerName]]`, see `fieldMarker`), so text maps to `{{tokens}}`.
 *   - Two sentinel palettes (`SENTINEL_PALETTES`): a colour that moves with the
 *     palette is a token.
 *   - Worst-case content, for boxes: the longest names the pilot clubs
 *     produce, rows filled to the layout's capacity, every optional field on.
 *     Interim: L2-A's `kind-templates/worst-case.ts` replaces these fixtures
 *     when it lands.
 *
 * Images are tiny inline SVGs whose title names the slot (`sentinel:photo`),
 * so a capture never touches the network for them and `src` says which slot
 * an image came from. Dev and CI builds only (see `./index.ts`).
 */

import {
  SENTINEL_PALETTES,
  type CaptureContent,
  type ColourMode,
  type SentinelPaletteId,
} from "@workspace/scorecard/pack-capture";
import {
  ladderContent,
  lastMeetingContent,
  matchDayDayContent,
  matchDayDraftInput,
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  milestoneWatchContent,
  resultContent,
  resultDayContent,
  resultDraftInput,
  teamListContent,
  teamListDraftInput,
  presetFields,
  type CardContent,
  type ContentPreset,
  type MatchDayFixtureContent,
  type ResultContent,
  type TeamListSource,
} from "@workspace/scorecard/card-content";
import { contentSlideInput } from "@workspace/scorecard/queued-carousel";
import type { MatchSummaryInput } from "@workspace/scorecard";
import type { ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import type { PackCardData } from "../types";

// ---------------------------------------------------------------------------
// Sentinel images
// ---------------------------------------------------------------------------

/**
 * A flat SVG image whose title names it: `src` in a capture reads
 * `sentinel:<name>`. Double quotes only, so the encoded URL has no `'`, `(`
 * or `)` and sits safely in a CSS `url()`.
 */
export function sentinelImage(name: string, w = 400, h = 400, fill = "#808080"): string {
  const safe = name.replace(/[^A-Za-z0-9_.-]/g, "_");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<title>sentinel:${safe}</title><rect width="${w}" height="${h}" fill="${fill}"/>` +
    `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.round(Math.min(w, h) / 3)}" fill="#b0b0b0"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const logo = (name: string) => sentinelImage(name, 300, 300, "#606060");
const photo = (name: string) => sentinelImage(name, 1200, 1500, "#707070");

// ---------------------------------------------------------------------------
// Text sources
// ---------------------------------------------------------------------------

type TextKind = "person" | "team" | "grade" | "venue" | "round" | "line" | "label" | "sponsor";

/** Where content strings come from: unique markers, or the longest real ones. */
interface Texts {
  readonly content: CaptureContent;
  text(kind: TextKind, sample: string): string;
}

/** 0 → A, 25 → Z, 26 → BA (base 26, letters only, so case changes keep them). */
function letters(n: number): string {
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return s;
}

class SentinelTexts implements Texts {
  readonly content = "sentinel" as const;
  private n = 0;
  text(kind: TextKind): string {
    const id = letters(this.n++);
    // A person keeps two words, so first-initial and surname cuts stay unique.
    return kind === "person" ? `Q${id} Z${id}` : `Q${id}`;
  }
}

/** The longest names and labels the pilot clubs produce (the fit grid's worst case). */
const LONG: Record<TextKind, string> = {
  person: "Alexander Featherstonehaugh-Smith",
  team: "Rockingham Mandurah Districts Cricket Club Inc",
  grade: "Western District Female Premier Championship Grade",
  venue: "Mike Barnett Sports Complex Oval 2",
  round: "Round 15",
  line: "Rockingham Mandurah Districts won by 10 wickets (DLS method)",
  label: "",
  sponsor: "Mandurah Toyota & Peel Automotive Group",
};

class WorstTexts implements Texts {
  readonly content = "worst" as const;
  text(kind: TextKind, sample: string): string {
    // Labels and headlines are the pack's own words: keep the sample.
    return kind === "label" ? sample : LONG[kind];
  }
}

export function textsFor(content: CaptureContent): Texts {
  return content === "sentinel" ? new SentinelTexts() : new WorstTexts();
}

// ---------------------------------------------------------------------------
// Sample inputs, re-voiced
// ---------------------------------------------------------------------------

/** Keys whose strings drive layout or logic, never shown as typed: left alone. */
const KEEP_KEY =
  /^(kind|category|page|homeAway|teamKey|resultWinner|winner|outcome|role|setRole|setPage|density|numbering|design|tier|startAt|day|tierLabel)$/;
const PERSON_KEY =
  /^(playerName|playerFirstName|playerLastName|surname|mom|bat\dName|bowl\dName|firstInitial)$/;
const TEAM_KEY = /^(opponent|oppositionName|team|clubName|oppName|formerClub|opposition)$/;
const GRADE_KEY =
  /^(grade|gradeLabel|gradesPlayed|competition|competitionName|competitionLine|gradeRound|matchType)$/;
const VENUE_KEY = /^(venue|dateVenue|venueDateTime)$/;
const LINE_KEY = /^(result|resultLine|performers|note|noteBody|equation|boundaryDetail)$/;
/** Digits, scores, overs, times and figures: the sample's own value is realistic. */
const NUMERIC = /^[\d\s.,/*()&+:#-]*$/;

/** Arrays of rows a layout repeats: worst-case content fills them to capacity. */
const ROW_ARRAYS: Record<string, number | "template"> = {
  players: 12,
  rows: "template",
  matches: "template",
  leaders: "template",
  fixtures: "template",
  results: "template",
  highlights: "template",
};

interface Revoice {
  texts: Texts;
  photo: boolean;
  /** Most rows any repeat of the design holds (worst case). */
  rowCap: number;
}

function textKind(key: string, parentKey: string | null): TextKind | null {
  if (key === "name") {
    if (parentKey === "club" || parentKey === "opposition") return "team";
    if (parentKey === "sponsors") return "sponsor";
    return "person";
  }
  if (PERSON_KEY.test(key)) return "person";
  if (TEAM_KEY.test(key)) return "team";
  if (GRADE_KEY.test(key)) return "grade";
  if (VENUE_KEY.test(key)) return "venue";
  if (key === "roundLabel") return "round";
  if (LINE_KEY.test(key)) return "line";
  return null;
}

function revoiceValue(
  value: unknown,
  key: string,
  parentKey: string | null,
  path: string,
  r: Revoice,
): unknown {
  if (typeof value === "string") {
    if (KEEP_KEY.test(key) || /colou?r$/i.test(key)) return value;
    if (/url$/i.test(key)) return value;
    if (!value || NUMERIC.test(value)) return value;
    const kind = textKind(key, parentKey) ?? "label";
    if (r.texts.content === "worst" && key === "surname")
      return LONG.person.split(" ")[1]!.toUpperCase();
    return r.texts.text(kind, value);
  }
  if (Array.isArray(value)) {
    const cap = ROW_ARRAYS[key];
    let items = value;
    if (r.texts.content === "worst" && cap !== undefined && value.length > 0) {
      const n = cap === "template" ? Math.max(value.length, r.rowCap) : cap;
      items = Array.from({ length: n }, (_, i) => {
        const item = value[i % value.length];
        if (!item || typeof item !== "object") return item;
        const row = { ...(item as Record<string, unknown>) };
        if (typeof row.order === "number") row.order = i + 1;
        if (typeof row.pos === "number") row.pos = i + 1;
        if (i > 0 && "isClub" in row) row.isClub = false;
        return row;
      });
    }
    return items.map((v, i) => revoiceValue(v, key, parentKey, `${path}[${i}]`, r));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/url$/i.test(k)) {
        out[k] = imageFor(k, `${path}.${k}`, r.photo);
        continue;
      }
      out[k] = revoiceValue(v, k, key, `${path}.${k}`, r);
    }
    return out;
  }
  return value;
}

/** A sentinel image for an input URL key: logos always, photos only on the photo branch. */
function imageFor(key: string, path: string, withPhoto: boolean): string | null {
  const name = path.replace(/^\./, "").replace(/[^A-Za-z0-9_.-]/g, "_");
  if (/logo|crest/i.test(key)) return logo(name);
  if (/photo/i.test(key)) return withPhoto ? photo(name) : null;
  return null;
}

/** A kind's sample input in sentinel or worst-case voice. */
export function revoicedSample(
  kind: ShareCardInput["kind"],
  texts: Texts,
  opts: { photo: boolean; rowCap: number },
): Record<string, unknown> {
  const sample = sampleCardInput(kind) as unknown as Record<string, unknown>;
  return revoiceValue(sample, "", null, "", { texts, ...opts }) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Content kinds (ADR-010): content built by the real builders, then projected
// ---------------------------------------------------------------------------

const DAY = "2026-10-10";
const LIVESTREAM = "https://www.youtube.com/@RockinghamMandurahDistrictsCricketClub/live";

function fixtureContent(
  texts: Texts,
  i: number,
  opts: { junior?: boolean } = {},
): MatchDayFixtureContent {
  const c = matchDayFixtureContent(
    {
      id: 100 + i,
      grade: texts.text("grade", "A Grade"),
      roundLabel: texts.text("round", "Round 15"),
      opponentName: texts.text("team", "Baldivis"),
      opponentLogoUrl: logo(`opposition${i}`),
      venue: texts.text("venue", "Sample Oval"),
      // 9 am Perth onwards, one fixture an hour: always the same club day.
      startAt: new Date(Date.UTC(2026, 9, 10, 1 + i)),
      isHome: i % 2 === 0,
    },
    { junior: opts.junior === true },
  );
  if (opts.junior) return c;
  return {
    ...c,
    ladder: ladderContent({
      teams: 14,
      tableName: null,
      club: { rank: 12 },
      opposition: { rank: 13 },
    })!,
    lastMeeting: lastMeetingContent({
      outcome: "won",
      margin: texts.content === "worst" ? "10 wickets (DLS method)" : texts.text("line", ""),
      date: "2026-02-07",
      season: "2025/26",
    })!,
    milestoneWatch: milestoneWatchContent({
      playerName: texts.text("person", "Sample Player"),
      stat: "wickets",
      tier: 100,
      gap: 3,
    })!,
  };
}

function summarySource(texts: Texts, i: number, junior: boolean): MatchSummaryInput {
  const sample = sampleCardInput("matchSummary") as unknown as MatchSummaryInput;
  const voiced = revoiceValue(sample, "", null, `summary${i}`, {
    texts,
    photo: false,
    rowCap: 0,
  }) as MatchSummaryInput;
  return {
    ...voiced,
    roundLabel: texts.text("round", "Round 15"),
    club: { ...voiced.club, logoUrl: logo(`club${i}`) },
    opposition: { ...voiced.opposition, logoUrl: logo(`opposition${i}`) },
    ...(junior ? { junior: true } : {}),
  };
}

function resultFor(
  texts: Texts,
  kind: "results" | "matchSummary",
  i: number,
  junior = false,
): ResultContent {
  return resultContent(summarySource(texts, i, junior), {
    kind,
    matchId: 200 + i,
    junior,
    grade: texts.text("grade", "A Grade"),
    day: DAY,
  });
}

/** How many rows a day slide or sponsors page holds in this render. */
export interface ContentRows {
  /** Fixtures or results on a junior day slide. */
  day: number;
  sponsors: number;
}

export const SENTINEL_ROWS: ContentRows = { day: 3, sponsors: 4 };

/** The content of one content-kind page (the carousel slide's, or the single card's source). */
export function pageContent(
  kind: "matchDay" | "results" | "matchSummary" | "teamList",
  page: string,
  texts: Texts,
  rows: ContentRows,
): CardContent {
  if (kind === "matchDay") {
    if (page === "fixture") return fixtureContent(texts, 0);
    if (page === "day")
      return matchDayDayContent(
        Array.from({ length: rows.day }, (_, i) => fixtureContent(texts, i, { junior: true })),
      );
    const bookend = {
      heading: texts.text("label", "Round three — every team, every ground, all weekend"),
      from: DAY,
      to: "2026-10-11",
      roundLabels: ["Round 15"],
      fixtureCount: 6,
      livestreamUrl: LIVESTREAM,
    };
    if (page === "title") return matchDayTitleContent(bookend);
    return matchDaySponsorsContent({
      ...bookend,
      sponsors: Array.from({ length: rows.sponsors }, (_, i) => ({
        name: texts.text("sponsor", `Sponsor ${i + 1}`),
        logoUrl: logo(`sponsor${i + 1}`),
        tier: i < 2 ? "major" : "standard",
        teamSponsor: i === rows.sponsors - 1,
      })),
      nextHomeGame: fixtureContent(texts, 9),
      socials:
        texts.content === "worst"
          ? ["@ourcricketclubofficial", "Our Cricket Club Official", "ourcricketclub.com.au"]
          : [texts.text("label", ""), texts.text("label", ""), texts.text("label", "")],
    });
  }
  if (kind === "teamList") {
    const sample = revoicedSample("teamList", texts, { photo: false, rowCap: 12 });
    const players = (sample.players as Array<Record<string, unknown>>).map((p, i) => ({
      ...p,
      shirtNumber: String(10 + i),
      ...(i === 1 ? { role: "VC" } : {}),
      ...(i === 2 ? { overseas: true } : {}),
    }));
    return teamListContent(
      {
        id: 300,
        grade: texts.text("grade", "A Grade"),
        roundLabel: texts.text("round", "Round 15"),
        opponentName: texts.text("team", "Sample Rivals"),
        opponentLogoUrl: logo("opposition0"),
        venue: texts.text("venue", "Sample Oval"),
        startAt: new Date(Date.UTC(2026, 9, 10, 2)),
      },
      { ...sample, kind: "teamList", homeAway: "HOME", players } as unknown as TeamListSource,
    );
  }
  if (page === "day")
    return resultDayContent(
      Array.from({ length: rows.day }, (_, i) => resultFor(texts, kind, i, true)),
    );
  return resultFor(texts, kind, 0);
}

/** A content page's render input: the carousel slide's, or the single card's. */
export function contentPageInput(
  content: CardContent,
  preset: ContentPreset | undefined,
  opts: { slide: boolean; photo: boolean },
): Record<string, unknown> {
  const visible = presetFields(content.kind, preset ?? "standard");
  if (opts.slide)
    return contentSlideInput({
      content,
      visibleFields: [...visible],
      photoId: null,
      data: opts.photo ? { photoUrl: photo("photo") } : {},
      junior: "junior" in content ? content.junior : false,
    });
  if (content.page === "fixture") return matchDayDraftInput(content);
  if (content.page === "result") return resultDraftInput(content, visible);
  if (content.page === "team") return teamListDraftInput(content, visible);
  throw new Error(`No single card for the ${content.kind} ${content.page} page`);
}

// ---------------------------------------------------------------------------
// Tenant data
// ---------------------------------------------------------------------------

/** The sentinel club: one palette's colours, sentinel logos, sponsors and photo. */
export function captureData(
  packId: string,
  opts: {
    palette: SentinelPaletteId;
    content: CaptureContent;
    photo: boolean;
    colourMode: ColourMode;
  },
): PackCardData {
  const palette = SENTINEL_PALETTES.find((p) => p.id === opts.palette);
  if (!palette) throw new Error(`Unknown sentinel palette: ${opts.palette}`);
  const worst = opts.content === "worst";
  return {
    brand: {
      name: worst ? LONG.team : "Sentinel Cricket Club",
      tagline: worst ? "Cricket Club · Established 1897 · Home of the Mariners" : "QTAGLINE",
      logoUrl: logo("clubLogo"),
      groundPhotoUrl: photo("groundPhoto"),
      ...palette.brand,
    },
    hashtag: worst ? "#ROCKINGHAMMANDURAHDISTRICTS" : "#QHASHTAG",
    sponsors: [1, 2, 3].map((n) => ({
      name: worst ? LONG.sponsor : `QSPONSOR${n}`,
      logoUrl: logo(`sponsor${n}`),
    })),
    presentingSponsorName: worst ? LONG.sponsor : "QPRESENTING",
    photoUrl: opts.photo ? photo("photo") : null,
    packColourModes: { [packId]: opts.colourMode },
  };
}
