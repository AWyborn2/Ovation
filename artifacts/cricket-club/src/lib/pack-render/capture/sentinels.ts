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
 *   - Worst-case content, for boxes, is the fit check's own
 *     (`worstCaseCard` in `kind-templates/worst-case.ts`, see `./plan.ts`).
 *
 * Images are tiny inline SVGs whose title names the slot (`sentinel:photo`),
 * so a capture never touches the network for them and `src` says which slot
 * an image came from. Dev and CI builds only (see `./index.ts`).
 */

import {
  SENTINEL_PALETTES,
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

/** Where content strings come from: unique markers. */
interface Texts {
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
  private n = 0;
  text(kind: TextKind, sample: string): string {
    const id = letters(this.n++);
    // A person keeps two words, so first-initial and surname cuts stay unique; so does a
    // grade of several words, which a list splits into a large first word over the rest
    // (a weekend wrap's grade label and sub-label).
    const twoWords = kind === "person" || (kind === "grade" && /\s/.test(sample.trim()));
    return twoWords ? `Q${id} Z${id}` : `Q${id}`;
  }
}

/** Fresh sentinel markers for one render (deterministic: the same render gets the same markers). */
export function sentinelTexts(): Texts {
  return new SentinelTexts();
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

interface Revoice {
  texts: Texts;
  photo: boolean;
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
    return r.texts.text(textKind(key, parentKey) ?? "label", value);
  }
  if (Array.isArray(value))
    return value.map((v, i) => revoiceValue(v, key, parentKey, `${path}[${i}]`, r));
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

/** A kind's sample input with sentinel markers for its strings. */
export function revoicedSample(
  kind: ShareCardInput["kind"],
  texts: Texts,
  opts: { photo: boolean },
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
      margin: texts.text("line", ""),
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
      socials: [texts.text("label", ""), texts.text("label", ""), texts.text("label", "")],
    });
  }
  if (kind === "teamList") {
    const sample = revoicedSample("teamList", texts, { photo: false });
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

/** A sentinel palette's brand colours. */
export function paletteBrand(id: SentinelPaletteId) {
  const palette = SENTINEL_PALETTES.find((p) => p.id === id);
  if (!palette) throw new Error(`Unknown sentinel palette: ${id}`);
  return palette.brand;
}

/** The sentinel club: one palette's colours, sentinel logos, sponsors and photo. */
export function sentinelData(
  packId: string,
  opts: { palette: SentinelPaletteId; photo: boolean; colourMode: ColourMode },
): PackCardData {
  return {
    brand: {
      name: "Sentinel Cricket Club",
      tagline: "QTAGLINE",
      logoUrl: logo("clubLogo"),
      groundPhotoUrl: photo("groundPhoto"),
      ...paletteBrand(opts.palette),
    },
    hashtag: "#QHASHTAG",
    sponsors: [1, 2, 3].map((n) => ({ name: `QSPONSOR${n}`, logoUrl: logo(`sponsor${n}`) })),
    presentingSponsorName: "QPRESENTING",
    photoUrl: opts.photo ? photo("photo") : null,
    packColourModes: { [packId]: opts.colourMode },
  };
}
