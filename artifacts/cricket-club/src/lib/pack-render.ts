/**
 * Pack renderer (U3).
 *
 * Binds a `ShareCardInput` into a Pack A ("Broadcast Dark") template and
 * produces a self-contained, native-size HTML card string. The output is a
 * single positioned root element carrying the theme tokens as CSS custom
 * properties; `PackCard` mounts it scaled via `transform: scale()` and the
 * server-side still/PNG harness (U4) mounts it unscaled.
 *
 * The renderer is DOM-free and pure — safe to run in the browser preview and in
 * the headless render page alike. It never trusts input text: every substituted
 * value is HTML-escaped (security invariant — do not remove).
 */

import { BROADCAST_DARK_PACK } from "./pack-templates/broadcast-dark";
import type {
  PackCardTemplate,
  PackTemplateFormats,
  PackTemplateField,
} from "./pack-templates/types";
import type {
  ShareCardInput,
  CardSize,
  MatchSummaryInnings,
  TeamListPlayer,
  WeekendWrapMatch,
  LadderRow,
  ClubLeaderboardLeader,
} from "./share-card";

// ---------------------------------------------------------------------------
// Public token contract
// ---------------------------------------------------------------------------

export interface PackTokens {
  /** Brand accent → `--gold`. */
  accent: string;
  /** Panel colour → `--panel` (junior forces brown `#42342B`). */
  panel: string;
  /** Deep background → `--ink`. */
  ink: string;
  /** Body text colour. */
  textLight: string;
  /** Display font key → `--disp` family. */
  displayFont?: string;
}

/** The junior brown panel, forced regardless of theme (KTD6 / replit.md). */
export const JUNIOR_PANEL = "#42342B";

/** Curated display-font families behind the `--disp` token. */
export const DISPLAY_FONT_FAMILY: Record<string, string> = {
  anton: "'Anton'",
  bebas: "'Bebas Neue'",
  oswald: "'Oswald'",
  teko: "'Teko'",
  archivo: "'Archivo Black'",
};

const NATIVE: Record<CardSize, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

// The shared (non-story) layouts flex via `--k`; portrait is taller so it gets
// more generous type than the square. Story uses its own dedicated layout.
const SHARED_K: Record<CardSize, number> = {
  square: 1.0,
  portrait: 1.4,
  story: 1.4,
};

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

const DESIGN_BY_KIND = new Map<string, typeof BROADCAST_DARK_PACK.designs>();
for (const d of BROADCAST_DARK_PACK.designs) {
  const list = DESIGN_BY_KIND.get(d.kind) ?? [];
  list.push(d);
  DESIGN_BY_KIND.set(d.kind, list);
}

export function packSupportsKind(kind: string): boolean {
  return DESIGN_BY_KIND.has(kind);
}

/** Pick the design for an input; the two two-design kinds split on category. */
function resolveTemplate(input: ShareCardInput): PackCardTemplate | null {
  const designs = DESIGN_BY_KIND.get(input.kind);
  if (!designs || designs.length === 0) return null;
  if (designs.length === 1) return designs[0].template;
  // gradeLeader / clubLeaderboard: choose Runs vs Wickets by category.
  const category = (input as { category?: string }).category ?? "Runs";
  const wantsWickets = category.trim().toLowerCase().startsWith("w");
  const match = designs.find(
    (d) => (d.categoryPreset === "Wickets") === wantsWickets,
  );
  return (match ?? designs[0]).template;
}

/** Select the format html for a size. A1 has three; every other card has two. */
function selectFormatHtml(
  formats: PackTemplateFormats,
  size: CardSize,
): string {
  if ("portrait" in formats) {
    // Match Result — three distinct layouts.
    if (size === "portrait") return formats.portrait;
    if (size === "square") return formats.square;
    if (size === "story") return formats.story;
    return formats.story; // unknown size → sane default
  }
  // story vs shared (portrait + square both map to shared).
  if (size === "story") return formats.story;
  return formats.shared;
}

// ---------------------------------------------------------------------------
// HTML escaping (security invariant)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Balanced <div> scanning (no regex can balance nested tags)
// ---------------------------------------------------------------------------

interface DivBounds {
  /** Index of the first char after the opening tag's `>`. */
  contentStart: number;
  /** Index of the matching `</div>` opening `<`. */
  contentEnd: number;
  /** Index just after the matching `</div>`. */
  end: number;
}

/** Given `openIdx` at a `<div`, return the bounds of its balanced content. */
function divBounds(html: string, openIdx: number): DivBounds {
  const contentStart = html.indexOf(">", openIdx) + 1;
  let depth = 1;
  const re = /<\/?div\b/g;
  re.lastIndex = contentStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (html[m.index + 1] === "/") {
      depth--;
      if (depth === 0) {
        const contentEnd = m.index;
        const end = html.indexOf(">", m.index) + 1;
        return { contentStart, contentEnd, end };
      }
    } else {
      depth++;
    }
  }
  // Unbalanced (shouldn't happen for transcribed templates) — treat rest as body.
  return { contentStart, contentEnd: html.length, end: html.length };
}

/** Split a run of sibling top-level `<div>…</div>` into separate strings. */
function splitTopLevelDivs(inner: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const open = inner.indexOf("<div", i);
    if (open < 0) break;
    const b = divBounds(inner, open);
    out.push(inner.slice(open, b.end));
    i = b.end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sponsor variant selection
// ---------------------------------------------------------------------------

/** Remove every `<div data-sponsors="loser">…</div>` block, keeping the winner. */
function selectSponsorVariant(html: string, sponsorsOn: boolean): string {
  const loser = sponsorsOn ? "off" : "on";
  const needle = `<div data-sponsors="${loser}"`;
  let out = html;
  let idx = out.indexOf(needle);
  while (idx >= 0) {
    const b = divBounds(out, idx);
    out = out.slice(0, idx) + out.slice(b.end);
    idx = out.indexOf(needle);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repeat expansion
// ---------------------------------------------------------------------------

interface PackRow {
  /** Row-template variant to use (`data-repeat-variant="…"`), if any. */
  variant?: string;
  values: Record<string, string>;
}

function substituteRow(
  template: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
): string {
  return template.replace(/\{\{\s*row\.([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const raw = key in values ? values[key] : defaults[key] ?? "";
    return escapeHtml(raw);
  });
}

/** Expand every `<div data-repeat="key">…</div>` over the supplied rows. */
function expandRepeats(
  html: string,
  rowsByKey: Record<string, PackRow[]>,
  template: PackCardTemplate,
): string {
  let out = html;
  const OPEN = '<div data-repeat="';
  let searchFrom = 0;
  while (true) {
    const idx = out.indexOf(OPEN, searchFrom);
    if (idx < 0) break;
    const keyStart = idx + OPEN.length;
    const keyEnd = out.indexOf('"', keyStart);
    const key = out.slice(keyStart, keyEnd);
    const b = divBounds(out, idx);
    const inner = out.slice(b.contentStart, b.contentEnd);
    const rowTemplates = splitTopLevelDivs(inner);
    const byVariant: Record<string, string> = {};
    let base = rowTemplates[0] ?? "";
    for (const t of rowTemplates) {
      const vm = t.match(/data-repeat-variant="([^"]+)"/);
      if (vm) byVariant[vm[1]] = t;
      else base = t;
    }
    const repeatDef = template.repeats?.find((r) => r.key === key);
    const rowDefaults: Record<string, string> = {};
    for (const f of repeatDef?.fields ?? []) rowDefaults[f.key] = f.sample;

    const rows = rowsByKey[key] ?? [];
    const expanded = rows
      .map((row) => {
        const chosen = (row.variant && byVariant[row.variant]) || base;
        return substituteRow(chosen, row.values, rowDefaults);
      })
      .join("");

    // Neutralise the `data-repeat` attribute so the container is not re-matched,
    // keep the opening/closing tags, and swap in the expanded rows.
    const openTag = out.slice(idx, b.contentStart);
    const newOpenTag = openTag.replace(` data-repeat="${key}"`, "");
    out = out.slice(0, idx) + newOpenTag + expanded + out.slice(b.contentEnd);
    searchFrom = idx + newOpenTag.length + expanded.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Image slot resolution
// ---------------------------------------------------------------------------

// For an unresolved logo/photo slot we render an initials chip; the source name
// is looked up in the bound values by slot-key convention.
const SLOT_NAME_SOURCE: Record<string, string> = {
  clubLogo: "clubName",
  "club.logo": "club.name",
  "opposition.logo": "opposition.name",
  photo: "playerName",
  "potm.photo": "potm.name",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase();
}

function resolveSlots(
  html: string,
  images: Record<string, string>,
  values: Record<string, string>,
): string {
  const slotRe =
    /<div data-slot="([^"]+)" data-slot-type="([^"]+)"([^>]*)><\/div>/g;
  return html.replace(slotRe, (_all, key: string, type: string, rest: string) => {
    const url = images[key];
    const contain = /data-fit="contain"/.test(rest);
    const fit = contain ? "contain" : "cover";
    if (url) {
      return `<img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:${fit};display:block" />`;
    }
    // No URL → placeholder (never an empty <img src>).
    if (type === "sponsor") {
      return `<div class="pack-slot-placeholder" style="width:100%;height:100%;background:rgba(255,255,255,.12)"></div>`;
    }
    const sourceKey = SLOT_NAME_SOURCE[key];
    const initials = sourceKey ? initialsOf(values[sourceKey] ?? "") : "";
    const chip = initials
      ? `<span style="font-family:var(--disp,'Anton'),sans-serif;font-size:2.4em;line-height:1;color:rgba(255,255,255,.55)">${escapeHtml(initials)}</span>`
      : "";
    return `<div class="pack-slot-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08)">${chip}</div>`;
  });
}

// ---------------------------------------------------------------------------
// Input binding — ShareCardInput → template field values / rows / images
// ---------------------------------------------------------------------------

interface BoundInput {
  values: Record<string, string>;
  images: Record<string, string>;
  rows: Record<string, PackRow[]>;
}

function set(
  target: Record<string, string>,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === null || value === undefined) return;
  target[key] = String(value);
}

function seasonFromYear(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

function inningsScore(i: MatchSummaryInnings): string {
  const suffix = i.declared ? "d" : "";
  return `${i.wickets}/${i.totalRuns}${suffix}`;
}

function inningsPerformers(i: MatchSummaryInnings): string {
  const bats = i.topBatters
    .slice(0, 2)
    .map(
      (b) =>
        `${b.name} ${b.runs}${b.notOut ? "*" : ""}${b.balls != null ? ` (${b.balls})` : ""}`,
    );
  const bowls = i.topBowlers
    .slice(0, 1)
    .map((b) => `${b.name} ${b.wickets}/${b.runs} (${b.overs})`);
  return [...bats, ...bowls].join(" · ");
}

function bindInput(input: ShareCardInput): BoundInput {
  const values: Record<string, string> = {};
  const images: Record<string, string> = {};
  const rows: Record<string, PackRow[]> = {};

  switch (input.kind) {
    case "matchSummary": {
      set(values, "matchTitle", input.matchTitle);
      set(values, "result", input.result);
      set(values, "club.name", input.club.name);
      set(values, "opposition.name", input.opposition.name);
      if (input.club.logoUrl) images["club.logo"] = input.club.logoUrl;
      if (input.opposition.logoUrl) images["opposition.logo"] = input.opposition.logoUrl;
      const clubInn = input.innings.find((i) => i.teamKey === "club");
      const oppInn = input.innings.find((i) => i.teamKey === "opposition");
      if (clubInn) {
        set(values, "club.score", inningsScore(clubInn));
        set(values, "club.oversLabel", `${clubInn.overs} OVERS`);
        set(values, "club.performers", inningsPerformers(clubInn));
      }
      if (oppInn) {
        set(values, "opposition.score", inningsScore(oppInn));
        set(values, "opposition.oversLabel", `${oppInn.overs} OVERS`);
        set(values, "opposition.performers", inningsPerformers(oppInn));
      }
      if (input.resultWinner === "draw") {
        set(values, "resultVerb", "MATCH DRAWN");
        set(values, "resultVerbShort", "DRAW");
      }
      break;
    }
    case "player": {
      set(values, "playerName", input.playerName);
      set(values, "headline", input.headline);
      const stats = input.stats ?? [];
      stats.slice(0, 3).forEach((s, idx) => {
        set(values, `stat${idx + 1}Value`, s.value);
        set(values, `stat${idx + 1}Label`, s.label);
      });
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "record": {
      set(values, "title", input.title);
      set(values, "value", input.value);
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "gradeLeader": {
      set(values, "grade", input.grade);
      set(values, "category", input.category);
      set(values, "value", input.value);
      set(values, "playerName", input.playerName);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "premiership": {
      set(values, "grade", input.grade);
      set(values, "season", seasonFromYear(input.year));
      set(values, "competition", input.competition);
      set(values, "result", input.result);
      set(values, "mom", input.mom);
      break;
    }
    case "debut": {
      set(values, "grade", input.grade);
      set(values, "season", input.season);
      set(values, "playerName", input.playerName);
      set(values, "round", input.round);
      set(values, "opponent", input.opponent);
      set(values, "capNumber", input.capNumber);
      set(values, "tributeLine", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "newCap": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "capNumber", input.capNumber);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "century": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "runs", input.runs);
      set(values, "balls", input.balls);
      set(values, "opponent", input.opponent);
      set(values, "round", input.round);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "fiveFor": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "wickets", input.wickets);
      set(values, "figures", input.figures);
      set(values, "overs", input.overs);
      set(values, "opponent", input.opponent);
      set(values, "round", input.round);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "milestone": {
      set(values, "tierLabel", input.tierLabel);
      set(values, "currentValue", input.currentValue);
      set(values, "milestoneLabel", input.milestoneLabel);
      set(values, "playerName", input.playerName);
      set(values, "headline", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "matchDay": {
      set(values, "roundLabel", input.roundLabel);
      set(values, "opposition.name", input.oppositionName);
      set(values, "homeAway", input.homeAway);
      set(values, "oppositionHomeAway", input.homeAway === "HOME" ? "AWAY" : "HOME");
      set(values, "venue", input.venue);
      set(values, "date", input.date);
      set(values, "startTime", input.startTime);
      set(values, "note.title", input.noteTitle);
      set(values, "note.body", input.noteBody);
      if (input.oppositionLogoUrl) images["opposition.logo"] = input.oppositionLogoUrl;
      break;
    }
    case "teamList": {
      set(values, "gradeRound", input.gradeRound);
      set(values, "competitionLine", input.competitionLine);
      set(values, "venueDateTime", input.venueDateTime);
      if (input.squadPhotoUrl) images["squadPhoto"] = input.squadPhotoUrl;
      rows["players"] = (input.players ?? []).map((p: TeamListPlayer) => ({
        values: {
          number: String(p.order),
          surname: p.surname,
          role: p.role ?? "",
        },
      }));
      break;
    }
    case "weekendWrap": {
      set(values, "roundLabel", input.roundLabel);
      set(values, "dateRange", input.dateRange);
      rows["matches"] = (input.matches ?? []).map((mt: WeekendWrapMatch) => ({
        variant: mt.outcome === "lost" ? "lost" : undefined,
        values: {
          gradeLabel: mt.gradeLabel,
          resultLine: mt.resultLine,
          performers: mt.performers,
          outcome: mt.outcome.toUpperCase(),
        },
      }));
      break;
    }
    case "ladder": {
      set(values, "competitionName", input.competitionName);
      set(values, "gradeLabel", input.gradeLabel);
      set(values, "asOfLabel", input.asOfLabel);
      rows["rows"] = (input.rows ?? []).map((r: LadderRow) => ({
        variant: r.isClub ? "club" : undefined,
        values: {
          pos: String(r.pos),
          team: r.team,
          played: String(r.played),
          won: String(r.won),
          lost: String(r.lost),
          points: String(r.points),
        },
      }));
      break;
    }
    case "bigMoment": {
      set(values, "oppositionName", input.oppositionName);
      set(values, "momentLabel", input.momentLabel);
      set(values, "playerName", input.playerName);
      set(values, "runs", input.runs);
      set(values, "balls", input.balls);
      set(values, "boundaryDetail", input.boundaryDetail);
      set(values, "inningsLabel", input.inningsLabel);
      set(values, "liveScore", input.liveScore);
      set(values, "oversChaseLine", input.oversChaseLine);
      set(values, "equation", input.equation);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "newSigning": {
      set(values, "season", input.season);
      set(values, "playerFirstName", input.playerFirstName);
      set(values, "playerLastName", input.playerLastName);
      set(values, "role", input.role);
      set(values, "formerClub", input.formerClub);
      set(values, "headline", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "countdown": {
      set(values, "eventLabel", input.eventLabel);
      set(values, "daysToGo", input.daysToGo);
      set(values, "hypeLine1", input.hypeLine1);
      set(values, "hypeLine2", input.hypeLine2);
      set(values, "dateVenue", input.dateVenue);
      set(values, "fixtureLine", input.fixtureLine);
      break;
    }
    case "clubLeaderboard": {
      set(values, "category", `TOP ${input.category.toUpperCase()}`);
      set(values, "title", input.title);
      set(values, "subtitle", input.subtitle);
      set(values, "season", input.season);
      rows["leaders"] = (input.leaders ?? []).map((l: ClubLeaderboardLeader) => ({
        values: {
          gradeLabel: l.gradeLabel,
          playerName: l.playerName,
          value: l.value,
        },
      }));
      break;
    }
  }

  return { values, images, rows };
}

// ---------------------------------------------------------------------------
// Root wrapper (theme tokens as CSS custom properties)
// ---------------------------------------------------------------------------

function darkenHex(hex: string, amount: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((n >> 8) & 0xff) * (1 - amount));
  const b = Math.round((n & 0xff) * (1 - amount));
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function rootStyle(
  tokens: PackTokens,
  junior: boolean,
  size: CardSize,
): string {
  const native = NATIVE[size] ?? NATIVE.story;
  const panel = junior ? JUNIOR_PANEL : tokens.panel;
  const panel2 = darkenHex(panel, 0.42);
  const disp = DISPLAY_FONT_FAMILY[tokens.displayFont ?? "anton"] ?? DISPLAY_FONT_FAMILY.anton;
  const decls: string[] = [
    `position:relative`,
    `width:${native.w}px`,
    `height:${native.h}px`,
    `overflow:hidden`,
    `background:${tokens.ink}`,
    `color:${tokens.textLight}`,
    `font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif`,
    `--gold:${tokens.accent}`,
    `--panel:${panel}`,
    `--ink:${tokens.ink}`,
    `--disp:${disp}`,
    `--k:${SHARED_K[size] ?? 1.4}`,
  ];
  if (panel2) decls.push(`--panel-2:${panel2}`);
  return decls.join(";");
}

// ---------------------------------------------------------------------------
// Field substitution + cleanup
// ---------------------------------------------------------------------------

function fieldDefaults(template: PackCardTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    if (f.type === "text") out[f.key] = f.sample;
  }
  return out;
}

function substituteFields(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const raw = values[key] ?? "";
    return escapeHtml(raw);
  });
}

/** Drop team-list role parentheticals rendered empty (no role on that player). */
function cleanupEmptyRoles(html: string): string {
  return html.replace(/\s*<span[^>]*>\(\)<\/span>/g, "");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Bind an input into its pack template and return native-size, self-contained
 * card HTML. Falls back to the story/shared layout for an unknown size, and to
 * template samples for any field the input does not supply.
 */
export function renderPackCard(
  input: ShareCardInput,
  size: CardSize,
  sponsorsOn: boolean,
  tokens: PackTokens,
  junior: boolean,
): string {
  const template = resolveTemplate(input);
  if (!template) return "";

  const bound = bindInput(input);
  const values = { ...fieldDefaults(template), ...bound.values };

  let html = selectFormatHtml(template.formats, size);
  html = selectSponsorVariant(html, sponsorsOn);
  html = expandRepeats(html, bound.rows, template);
  html = resolveSlots(html, bound.images, values);
  html = substituteFields(html, values);
  html = cleanupEmptyRoles(html);

  return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size)}">${html}</div>`;
}

/** Native pixel dimensions for a size (exposed for scaled mounting). */
export function packNativeSize(size: CardSize): { w: number; h: number } {
  return NATIVE[size] ?? NATIVE.story;
}
