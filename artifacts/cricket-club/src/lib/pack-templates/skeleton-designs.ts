import type { PackTemplateFormats } from "./types";
import { SK_COND, SK_MONO, skeletonFooter, skeletonPresentedBy, slot, sponsorsOn } from "./shared";
import {
  K,
  K_DISP,
  K_RULE,
  type FooterKeys,
  type PackLook,
  kColumn,
  kCond,
  kEyebrow,
  kFooterLogos,
  kFooterOn,
  kFooterPresented,
  kHashtags,
  kNum,
  kPill,
  kPresentedByBody,
  kSplit,
  kSub,
  kTitle,
  kitCard,
  kitChip,
  kitFormats,
} from "./skeleton-kit";

/**
 * One body builder per card kind (U13), shared by the packs restyled onto the
 * skeleton — Metallic Foil, Bold Type, Neon Night and Sunset. Each is the
 * handoff's body for that kind (ported from Broadcast Dark's U12 designs) in
 * the kit's variable-driven vocabulary, so the pack's `PackLook` alone decides
 * how it looks.
 *
 * The builders bind exactly the field keys Broadcast Dark's designs bind, and
 * take options only where a pack's design declares fewer (no photo, no note,
 * a different hashtag key in the footer) — the pack's own `fields` list stays
 * the source of truth, and `pack-lint.test.ts` proves both directions.
 */

/** Broadcast Dark's footer key set — the default where a pack declares the same. */
const BD_KEYS: FooterKeys = { on: "clubHashtag", off: "hashtags" };

/**
 * A pack's footer keys, or the Broadcast Dark default. An override replaces
 * the whole set — an omitted `offLeft` means the design has no secondary tag.
 */
function keys(base: FooterKeys, over?: Partial<FooterKeys>): FooterKeys {
  if (!over) return base;
  return { on: over.on ?? base.on, off: over.off ?? base.off, offLeft: over.offLeft };
}

// ---------------------------------------------------------------------------
// Match Result
// ---------------------------------------------------------------------------

function resultSide(prefix: "club" | "opposition", dim: boolean): string {
  return (
    `<div style="display:flex;align-items:flex-end;gap:3cqmin;width:100%;min-width:0${dim ? ";opacity:.74" : ""}">` +
    `<div style="width:8cqmin;height:8cqmin;flex:none;border-radius:1cqmin;overflow:hidden;background:${K.panel};margin-bottom:1.2cqmin">${slot(`${prefix}.logo`, "logo", "rounded", 8)}</div>` +
    `<div style="flex:1;min-width:0;padding-bottom:1.2cqmin">` +
    `<div style="font-family:${SK_COND};font-weight:800;font-size:6cqmin;line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{${prefix}.name}}</div>` +
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:2cqmin;letter-spacing:.14em;color:${K.muted};margin-top:.8cqmin">{{${prefix}.oversLabel}}</div>` +
    `</div>` +
    (dim
      ? `<div style="flex:none;font-family:${K_DISP};font-size:17cqmin;line-height:.9">{{${prefix}.score}}</div>`
      : kNum(`{{${prefix}.score}}`, 17, ";flex:none;margin-top:0")) +
    `</div>` +
    `<div style="font-size:2.5cqmin;line-height:1.4;font-weight:500;color:${K.muted};margin-top:.6cqmin;max-width:96cqmin">{{${prefix}.performers}}</div>`
  );
}

export interface MatchResultOpts {
  /** The design declares the weekly `photo` slot. */
  photo: boolean;
  /** Footer hashtags (Gold Foil / Sunset bind `clubHashtag` with sponsors on). */
  footer?: Partial<FooterKeys>;
}

export function matchResultFormats(look: PackLook, opts: MatchResultOpts): PackTemplateFormats {
  const ft = keys({ on: "hashtags", off: "hashtags" }, opts.footer);
  return kitFormats((fmt) => {
    const verb = fmt === "landscape" ? "{{resultVerbShort}}" : "{{resultVerb}}";
    const body = kColumn(
      look,
      kEyebrow("{{matchTitle}}") +
        `<div style="width:100%;margin-top:3cqmin">${resultSide("opposition", true)}</div>` +
        `<div style="display:flex;align-items:center;gap:2cqmin;width:100%;margin:2.4cqmin 0">` +
        `<span style="font-family:${SK_MONO};font-weight:700;font-size:2.2cqmin;letter-spacing:.22em;color:${K.accText};white-space:nowrap">${verb}</span>` +
        `<span style="flex:1;height:.2cqmin;background:${K.line}"></span>` +
        `</div>` +
        `<div style="width:100%">${resultSide("club", false)}</div>` +
        kPill("{{result}}", 4.6, ";margin-top:3cqmin;max-width:100%") +
        kPresentedByBody("presented by", ";margin-top:2.4cqmin"),
      !opts.photo,
    );
    return kitCard(look, {
      chip: kitChip("RESULT"),
      photo: opts.photo ? "photo" : undefined,
      body,
      footer: kFooterLogos(ft),
      deco: { word: "SCORE", script: "Full time" },
    });
  });
}

// ---------------------------------------------------------------------------
// Match Day
// ---------------------------------------------------------------------------

function fixtureSide(logoKey: string, name: string, tag: string, accent: boolean): string {
  return (
    `<div style="display:flex;align-items:center;gap:2.4cqmin;padding:1.4cqmin 0;border-bottom:.2cqmin solid ${K.line}">` +
    `<div style="width:8cqmin;height:8cqmin;flex:none;border-radius:50%;overflow:hidden;background:${K.panel}">${slot(logoKey, "logo", "circle")}</div>` +
    `<div style="flex:1;min-width:0;font-family:${SK_COND};font-weight:800;font-size:5cqmin;line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>` +
    `<div style="flex:none;font-family:${SK_COND};font-weight:800;font-size:2.4cqmin;letter-spacing:.1em;padding:.6cqmin 1.4cqmin;border-radius:${K.pillR};${accent ? `background:${K.acc};color:${K.accInk};box-shadow:${K.pillGlow}` : `border:.2cqmin solid ${K.line};color:${K.muted}`}">${tag}</div>` +
    `</div>`
  );
}

function fixtureInfo(label: string, value: string): string {
  return `<div style="min-width:0"><div style="font-family:${SK_MONO};font-weight:600;font-size:1.8cqmin;letter-spacing:.18em;color:${K.muted}">${label}</div><div style="font-weight:700;font-size:3.2cqmin;line-height:1.2;margin-top:.6cqmin">${value}</div></div>`;
}

export interface MatchDayOpts {
  /** The design declares `note.title` / `note.body` (Broadcast Dark only). */
  note: boolean;
}

export function matchDayFormats(look: PackLook, opts: MatchDayOpts): PackTemplateFormats {
  return kitFormats((fmt) => {
    const head =
      kNum("MATCH<br>DAY", fmt === "landscape" ? 18 : 16, ";line-height:.84;margin-top:0") +
      kEyebrow("{{roundLabel}}", K.accText, ";margin-top:2cqmin");
    const note = opts.note
      ? `<div style="margin-top:2.6cqmin;padding:1.8cqmin 2.4cqmin;border-left:.8cqmin solid ${K.accSolid};background:${K.panel};border-radius:0 1cqmin 1cqmin 0">` +
        `<div style="font-family:${SK_MONO};font-weight:600;font-size:2cqmin;letter-spacing:.16em;color:${K.accText}">{{note.title}}</div>` +
        `<div style="font-size:2.8cqmin;line-height:1.35;margin-top:.6cqmin;color:${K.sub}">{{note.body}}</div>` +
        `</div>`
      : "";
    const fixture =
      `<div style="border-top:.2cqmin solid ${K.line}">` +
      fixtureSide("clubLogo", "{{clubName}}", "{{homeAway}}", true) +
      fixtureSide("opposition.logo", "{{opposition.name}}", "{{oppositionHomeAway}}", false) +
      `</div>` +
      `<div style="display:flex;gap:5cqmin;margin-top:2.6cqmin">${fixtureInfo("GROUND", "{{venue}}")}${fixtureInfo("DATE", "{{date}}")}${fixtureInfo("START", "{{startTime}}")}</div>` +
      note;
    return kitCard(look, {
      chip: kitChip("MATCH DAY"),
      body: kSplit(look, fmt, head, fixture),
      footer: kFooterLogos({ on: "hashtags", off: "hashtags" }),
      deco: { word: "PLAY", script: "Game day" },
    });
  });
}

// ---------------------------------------------------------------------------
// Player Spotlight
// ---------------------------------------------------------------------------

function statBox(n: 1 | 2 | 3): string {
  const lead = n === 1;
  const box = lead
    ? `background:color-mix(in srgb, ${K.accSolid} 16%, transparent);border:.25cqmin solid color-mix(in srgb, ${K.accSolid} 55%, transparent)`
    : `background:${K.panel};border:.25cqmin solid ${K.panelBorder};color:${K.panelText}`;
  return (
    `<div style="${box};border-radius:${K.boxR};padding:2cqmin 3cqmin;text-align:center;min-width:14cqmin">` +
    `<div style="font-family:${K_DISP};font-size:9cqmin;line-height:.9${lead ? `;color:${K.accText}` : ""}">{{stat${n}Value}}</div>` +
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:1.9cqmin;letter-spacing:.1em;color:${lead ? K.muted : K.panelMuted};margin-top:1cqmin;text-transform:uppercase">{{stat${n}Label}}</div>` +
    `</div>`
  );
}

export function playerSpotlightFormats(look: PackLook): PackTemplateFormats {
  const html = kitCard(look, {
    chip: kitChip("SPOTLIGHT"),
    tag: "{{season}}",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("PLAYER SPOTLIGHT") +
        kNum("{{playerName}}", 13, ";max-width:78cqmin") +
        `<div style="display:flex;gap:2cqmin;margin-top:4cqmin">${statBox(1)}${statBox(2)}${statBox(3)}</div>` +
        kSub("{{headline}}", ";margin-top:4cqmin;max-width:72cqmin"),
    ),
    footer: kFooterOn("presented by"),
    deco: { word: "STAR", script: "Star turn" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Team List
// ---------------------------------------------------------------------------

export function teamListFormats(look: PackLook): PackTemplateFormats {
  const row =
    `<div style="display:flex;align-items:baseline;gap:1.8cqmin;padding:1.1cqmin 0;border-bottom:.2cqmin solid ${K.line};min-width:0">` +
    `<span style="font-family:${SK_COND};font-weight:800;font-size:3.4cqmin;width:4cqmin;flex:none;color:${K.accText}">{{row.number}}</span>` +
    `<span style="font-weight:600;font-size:3.2cqmin;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">{{row.surname}}</span>` +
    `<span style="font-family:${SK_COND};font-weight:700;font-size:2.4cqmin;flex:none;color:${K.accText}">({{row.role}})</span>` +
    `</div>`;
  const html = kitCard(look, {
    chip: kitChip("TEAM LIST"),
    tag: "{{gradeRound}}",
    photo: "squadPhoto",
    body: kColumn(
      look,
      kEyebrow("{{competitionLine}}") +
        kTitle("THE XI", 14) +
        `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.2cqmin;letter-spacing:.14em;color:${K.muted};margin-top:1.6cqmin">{{venueDateTime}}</div>` +
        `<div data-repeat="players" data-repeat-max="12" style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,auto);grid-auto-flow:column;column-gap:5cqmin;width:100%;max-width:92cqmin;margin-top:3cqmin">${row}</div>`,
    ),
    footer: kFooterLogos({ on: "hashtags", off: "hashtags" }),
    deco: { word: "XI", script: "Selected" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Milestone
// ---------------------------------------------------------------------------

export function milestoneFormats(look: PackLook): PackTemplateFormats {
  const html = kitCard(look, {
    chip: kitChip("MILESTONE"),
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("{{tierLabel}}") +
        kNum("{{currentValue}}", 36, ";line-height:.84") +
        kCond("{{milestoneLabel}}", 8.4, ";margin-top:1cqmin") +
        K_RULE +
        kCond("{{playerName}}", 7) +
        kSub("{{headline}}", ";margin-top:1.6cqmin;max-width:76cqmin"),
    ),
    footer: kFooterOn("proudly supported by"),
    deco: { word: "EPIC", script: "What a career" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Weekend Wrap
// ---------------------------------------------------------------------------

function wrapRow(variant: "won" | "lost"): string {
  const lost = variant === "lost";
  const pill = lost
    ? `background:transparent;color:${K.panelMuted};border:.2cqmin solid ${K.line}`
    : `background:${K.acc};color:${K.accInk};border:.2cqmin solid transparent;box-shadow:${K.pillGlow}`;
  return (
    `<div${lost ? ' data-repeat-variant="lost"' : ""} style="display:flex;align-items:center;gap:2.6cqmin;padding:1.8cqmin 2.4cqmin;margin-top:1.2cqmin;border-radius:${K.rowR};background:${K.panel};border:.2cqmin solid ${K.panelBorder};color:${K.panelText}">` +
    `<div style="width:11cqmin;flex:none;text-align:center"><div style="font-family:${K_DISP};font-size:5.4cqmin;line-height:.9;color:${K.panelAcc}">{{row.gradeLabel}}</div><div style="font-family:${SK_MONO};font-weight:600;font-size:1.5cqmin;letter-spacing:.12em;color:${K.panelMuted};margin-top:.5cqmin">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:3.1cqmin;line-height:1.2">{{row.resultLine}}</div><div style="font-weight:500;font-size:2.3cqmin;line-height:1.3;color:${K.panelMuted};margin-top:.5cqmin">{{row.performers}}</div></div>` +
    `<div style="flex:none;font-family:${SK_COND};font-weight:800;font-size:2.6cqmin;line-height:1;letter-spacing:.08em;padding:1cqmin 1.8cqmin;border-radius:${K.pillR};${pill}">{{row.outcome}}</div>` +
    `</div>`
  );
}

export function weekendWrapFormats(
  look: PackLook,
  footer?: Partial<FooterKeys>,
): PackTemplateFormats {
  const ft = keys({ ...BD_KEYS, offLeft: "hashtagsExtra" }, footer);
  return kitFormats((fmt) => {
    const head =
      kEyebrow("<span>{{roundLabel}}</span> · <span>{{dateRange}}</span>") +
      kNum("WEEKEND<br>WRAP", 12, ";line-height:.88");
    const rows = `<div data-repeat="matches" data-repeat-max="${fmt === "landscape" ? 4 : 5}">${wrapRow("won")}${wrapRow("lost")}</div>`;
    return kitCard(look, {
      chip: kitChip("WEEKEND WRAP"),
      body: kSplit(look, fmt, head, rows),
      footer: kFooterPresented("supported by", ft),
      deco: { word: "WRAP", script: "The weekend" },
    });
  });
}

// ---------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------

const LADDER_CELL = `width:7cqmin;flex:none;text-align:center;font-weight:500`;
/** Points cell — also the marker the ladder row-count tests key on. */
const LADDER_PTS = `width:10cqmin;flex:none;text-align:right;font-family:${K_DISP}`;

function ladderRow(variant: "base" | "club"): string {
  const club = variant === "club";
  const box = club
    ? `background:var(--sk-hi-row-bg,color-mix(in srgb, ${K.accSolid} 22%, ${K.panel}));border:.2cqmin solid color-mix(in srgb, ${K.accSolid} 60%, transparent);box-shadow:${K.pillGlow}`
    : `background:${K.panel};border:.2cqmin solid ${K.panelBorder}`;
  // The club's own row: a tinted panel by default; a pack may set a solid
  // highlight (`--sk-hi-row-bg` / `--sk-hi-row-text`) where a tint cannot read.
  const hi = club ? `;color:var(--sk-hi-row-text,${K.panelAcc})` : "";
  const cell = `${LADDER_CELL};color:${club ? `var(--sk-hi-row-muted,${K.panelMuted})` : K.panelMuted}`;
  return (
    `<div${club ? ' data-repeat-variant="club"' : ""} style="display:flex;align-items:center;padding:1.1cqmin 2.2cqmin;margin-top:.8cqmin;border-radius:${K.rowR};${box};color:${K.panelText};font-weight:700;font-size:2.9cqmin;line-height:1.2">` +
    `<span style="width:6cqmin;flex:none;font-family:${K_DISP};color:${club ? `var(--sk-hi-row-text,${K.panelAcc})` : K.panelMuted}">{{row.pos}}</span>` +
    `<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis${hi}">{{row.team}}</span>` +
    `<span style="${cell}">{{row.played}}</span><span style="${cell}">{{row.won}}</span><span style="${cell}">{{row.lost}}</span>` +
    `<span style="${LADDER_PTS};font-size:3.6cqmin${hi}">{{row.points}}</span>` +
    `</div>`
  );
}

export function ladderFormats(look: PackLook, footer?: Partial<FooterKeys>): PackTemplateFormats {
  const ft = keys({ ...BD_KEYS, offLeft: "hashtagsExtra" }, footer);
  return kitFormats((fmt) => {
    const head =
      kEyebrow("{{competitionName}}") + kTitle("{{gradeLabel}} LADDER", 10, ";line-height:.92");
    const table =
      `<div style="display:flex;align-items:center;padding:0 2.2cqmin .6cqmin;font-family:${SK_MONO};font-weight:600;font-size:1.9cqmin;letter-spacing:.12em;color:${K.muted};border-bottom:.2cqmin solid ${K.line}">` +
      `<span style="width:6cqmin;flex:none">#</span><span style="flex:1">TEAM</span><span style="width:7cqmin;flex:none;text-align:center">P</span><span style="width:7cqmin;flex:none;text-align:center">W</span><span style="width:7cqmin;flex:none;text-align:center">L</span><span style="width:10cqmin;flex:none;text-align:right">PTS</span>` +
      `</div>` +
      `<div data-repeat="rows" data-repeat-max="${fmt === "landscape" ? 5 : 10}">${ladderRow("club")}${ladderRow("base")}</div>`;
    return kitCard(look, {
      chip: kitChip("LADDER"),
      tag: "{{asOfLabel}}",
      body: kSplit(look, fmt, head, table),
      footer: kFooterPresented("ladder via", ft),
      deco: { word: "TABLE", script: "Where we stand" },
    });
  });
}

// ---------------------------------------------------------------------------
// Big Moment · Live
// ---------------------------------------------------------------------------

/** The LIVE chip is broadcast red in every pack — a status colour, not the accent. */
const LIVE_CHIP = `<div style="display:inline-flex;align-items:center;gap:1cqmin;font-family:${SK_COND};font-weight:800;font-size:2.4cqmin;line-height:1;letter-spacing:.12em;padding:1cqmin 2cqmin;background:#E23B3B;color:#fff;border-radius:var(--sk-chip-radius,.6cqmin)"><span style="width:1.1cqmin;height:1.1cqmin;border-radius:50%;background:#fff;animation:hhPulse 1.4s ease-in-out infinite"></span>LIVE</div>`;

export function bigMomentFormats(
  look: PackLook,
  footer?: Partial<FooterKeys>,
): PackTemplateFormats {
  const ft = keys(BD_KEYS, footer);
  const moment =
    kNum(
      "{{momentLabel}}",
      22,
      `;line-height:.86;max-width:74cqmin;text-wrap:balance;margin-top:0`,
    ) +
    kCond("{{playerName}}", 8.4, ";margin-top:1.6cqmin") +
    `<div style="font-size:3.4cqmin;font-weight:600;margin-top:1.4cqmin">{{runs}} <span style="color:${K.muted}">({{balls}})</span> · {{boundaryDetail}}</div>`;
  const scorebug =
    `<div style="background:${K.panel};color:${K.panelText};border:.2cqmin solid ${K.panelBorder};border-left:1cqmin solid ${K.accSolid};border-radius:${K.boxR};padding:2.4cqmin 3cqmin;display:flex;flex-direction:column;align-items:flex-start">` +
    `<div style="font-family:${SK_MONO};font-weight:600;font-size:2.2cqmin;letter-spacing:.18em;color:${K.panelMuted}">{{inningsLabel}}</div>` +
    `<div style="font-family:${K_DISP};font-size:13cqmin;line-height:.9;margin-top:1cqmin">{{liveScore}}</div>` +
    `<div style="font-size:3cqmin;font-weight:500;color:${K.panelMuted};margin-top:.8cqmin">{{oversChaseLine}}</div>` +
    kPill("{{equation}}", 3.8, ";margin-top:2cqmin") +
    `</div>`;
  return kitFormats((fmt) => {
    const body =
      fmt === "landscape"
        ? `<div style="display:flex;align-items:center;gap:8cqmin"><div style="flex:none;max-width:110cqmin">${moment}</div><div style="flex:none">${scorebug}</div></div>`
        : kColumn(look, moment + `<div style="margin-top:4cqmin">${scorebug}</div>`, true);
    return kitCard(look, {
      chip: LIVE_CHIP,
      tag: "vs {{oppositionName}}",
      body,
      footer: kFooterPresented("live scoring by", ft),
      deco: { word: "LIVE", script: "What a moment" },
    });
  });
}

// ---------------------------------------------------------------------------
// New Signing
// ---------------------------------------------------------------------------

function bullet(inner: string): string {
  return `<div style="display:flex;align-items:center;gap:1.8cqmin;font-size:3.4cqmin;line-height:1.3;font-weight:600;margin-top:1.4cqmin"><span style="width:1.4cqmin;height:1.4cqmin;flex:none;background:${K.accSolid};box-shadow:${K.pillGlow};transform:rotate(45deg)"></span><span>${inner}</span></div>`;
}

export interface NewSigningOpts {
  /** The design declares the welcome `headline` (Bold Type's does not). */
  headline: boolean;
}

export function newSigningFormats(look: PackLook, opts: NewSigningOpts): PackTemplateFormats {
  const html = kitCard(look, {
    chip: kitChip("NEW SIGNING"),
    tag: "{{season}}",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("WELCOME TO THE CLUB") +
        kNum("{{playerFirstName}}<br>{{playerLastName}}", 15, ";max-width:80cqmin") +
        `<div style="margin-top:2.6cqmin">` +
        bullet("{{role}}") +
        bullet(`From <span style="color:${K.accText}">{{formerClub}}</span>`) +
        `</div>` +
        (opts.headline ? kSub("{{headline}}", ";margin-top:3.4cqmin;max-width:74cqmin") : ""),
    ),
    footer: kFooterOn("recruitment by"),
    deco: { word: "NEW", script: "Welcome aboard" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

export function countdownFormats(
  look: PackLook,
  footer?: Partial<FooterKeys>,
): PackTemplateFormats {
  const ft = keys({ ...BD_KEYS, offLeft: "hashtagsExtra" }, footer);
  return kitFormats((fmt) => {
    const hype =
      kEyebrow("{{eventLabel}}") +
      kTitle(
        `{{hypeLine1}}<br><span style="color:${K.accText}">{{hypeLine2}}</span>`,
        10,
        ";line-height:.92",
      );
    const days =
      `<div style="display:flex;align-items:flex-end;gap:2.6cqmin">` +
      kNum("{{daysToGo}}", 34, ";line-height:.82;margin-top:0") +
      kCond("DAYS<br>TO GO", 7, `;line-height:.95;color:${K.accText};padding-bottom:1.4cqmin`) +
      `</div>`;
    const when =
      K_RULE + kCond("{{dateVenue}}", 5) + kSub("{{fixtureLine}}", ";margin-top:1.2cqmin");
    const body =
      fmt === "landscape"
        ? `<div style="display:flex;align-items:center;gap:8cqmin">` +
          `<div style="flex:none;width:82cqmin">${hype}</div>` +
          `<div style="flex:none">${days}${when}</div>` +
          `</div>`
        : kColumn(look, hype + `<div style="margin-top:3cqmin">${days}</div>` + when, true);
    return kitCard(look, {
      chip: kitChip("COUNTDOWN"),
      body,
      footer: kFooterPresented("season launch ·", ft),
      deco: { word: "SOON", script: "Nearly there" },
    });
  });
}

// ---------------------------------------------------------------------------
// Debut
// ---------------------------------------------------------------------------

export function debutFormats(look: PackLook, footer?: Partial<FooterKeys>): PackTemplateFormats {
  const ft = keys(BD_KEYS, footer);
  // The cap line keeps its literal `CAP {{capNumber}}` inside one <div> —
  // `dropEmptyCapNumber` removes that div when no cap number resolved.
  const html = kitCard(look, {
    chip: kitChip("DEBUT"),
    tag: "{{season}}",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("FIRST GRADE DEBUT · <span>{{grade}}</span>") +
        kNum("{{playerName}}", 14, ";max-width:80cqmin") +
        kSub(
          `<span style="color:${K.muted}">Round {{round}} · vs {{opponent}} —</span> {{tributeLine}}`,
          ";margin-top:3cqmin;max-width:76cqmin",
        ) +
        kPill("CAP {{capNumber}}", 5.4, ";margin-top:3.4cqmin"),
    ),
    footer: kFooterPresented("presented by", ft),
    deco: { word: "DEBUT", script: "Welcome" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

export function recordFormats(look: PackLook, footer?: Partial<FooterKeys>): PackTemplateFormats {
  const ft = keys(BD_KEYS, footer);
  const html = kitCard(look, {
    chip: kitChip("RECORD"),
    tag: "CLUB BEST",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("CLUB RECORD") +
        kCond("{{title}}", 7.4, ";margin-top:1.4cqmin") +
        kNum("{{value}}", 36, ";line-height:.84") +
        K_RULE +
        kCond("{{playerName}}", 7) +
        kEyebrow("{{grade}}", K.muted, ";margin-top:1.6cqmin;font-weight:500"),
    ),
    footer: kFooterPresented("records by", ft),
    deco: { word: "BEST", script: "For the ages" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Grade Leader (Runs / Wickets presets)
// ---------------------------------------------------------------------------

export function gradeLeaderFormats(
  look: PackLook,
  preset: "Runs" | "Wickets",
  footer?: Partial<FooterKeys>,
): PackTemplateFormats {
  const ft = keys(BD_KEYS, footer);
  // Filled from the category at bind time (see leaderTitle); the preset
  // only picks the field defaults.
  void preset;
  const title = "{{titleTop}}<br>{{titleBottom}}";
  const html = kitCard(look, {
    chip: kitChip("LEADERBOARD"),
    tag: "{{season}}",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("<span>{{grade}}</span> LEADERBOARD") +
        kCond(title, 7, ";margin-top:1.4cqmin;line-height:.95") +
        kNum("{{value}}", 34, ";line-height:.84;margin-top:2cqmin") +
        kCond("{{category}}", 6, `;color:${K.accText};margin-top:.6cqmin`) +
        K_RULE +
        kCond("{{playerName}}", 7),
    ),
    footer: kFooterPresented("stats by", ft),
    deco: { word: preset === "Runs" ? "RUNS" : "WKTS", script: "Top of the pops" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Premiership
// ---------------------------------------------------------------------------

export function premiershipFormats(look: PackLook): PackTemplateFormats {
  const html = kitCard(look, {
    chip: kitChip("PREMIERS"),
    tag: "CHAMPIONS",
    photo: "teamPhoto",
    body: kColumn(
      look,
      kEyebrow("<span>{{grade}}</span> · <span>{{season}}</span>") +
        kNum("PREMIERS", 22, ";line-height:.86") +
        kCond("{{competition}}", 5, `;color:${K.muted};margin-top:1.4cqmin;line-height:1.1`) +
        K_RULE +
        `<div style="font-size:3.8cqmin;line-height:1.3;font-weight:700;max-width:80cqmin">{{result}}</div>` +
        `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.3cqmin;letter-spacing:.16em;color:${K.muted};margin-top:2.4cqmin">PLAYER OF THE MATCH · <span style="color:${K.accText};font-weight:700">{{mom}}</span></div>`,
    ),
    footer: skeletonFooter(
      sponsorsOn(skeletonPresentedBy("season proudly supported by")),
      kHashtags("hashtags"),
    ),
    deco: { word: "FLAG", script: "Champions!" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Century / Five-for
// ---------------------------------------------------------------------------

function heroWithAside(hero: string, size: number, aside: string): string {
  return (
    `<div style="display:flex;align-items:flex-end;gap:2.4cqmin">` +
    kNum(hero, size, ";line-height:.84") +
    `<div style="font-family:${SK_COND};font-weight:700;font-size:6cqmin;line-height:1;color:${K.muted};padding-bottom:1cqmin">(<span>${aside}</span>)</div>` +
    `</div>`
  );
}

const MATCH_LINE =
  "<span>{{grade}}</span> · vs <span>{{opponent}}</span> · RD <span>{{round}}</span>";

export function centuryFormats(look: PackLook, footer?: Partial<FooterKeys>): PackTemplateFormats {
  const ft = keys(BD_KEYS, footer);
  const html = kitCard(look, {
    chip: kitChip("CENTURY"),
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("RAISED THE BAT") +
        heroWithAside("{{runs}}", 36, "{{balls}}") +
        kCond("CENTURY", 8.4, ";margin-top:1cqmin") +
        K_RULE +
        kCond("{{playerName}}", 7) +
        kEyebrow(MATCH_LINE, K.muted, ";margin-top:1.6cqmin;font-weight:500"),
    ),
    footer: kFooterPresented("presented by", ft),
    deco: { word: "100", script: "What a knock" },
  });
  return kitFormats(() => html);
}

export function fiveForFormats(look: PackLook, footer?: Partial<FooterKeys>): PackTemplateFormats {
  const ft = keys(BD_KEYS, footer);
  const html = kitCard(look, {
    chip: kitChip("FIVE-FOR"),
    tag: "{{wickets}} WICKETS",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow("FIVE-WICKET HAUL") +
        heroWithAside("{{figures}}", 32, "{{overs}}") +
        kCond("FIVE-FOR", 8.4, ";margin-top:1cqmin") +
        K_RULE +
        kCond("{{playerName}}", 7) +
        kEyebrow(MATCH_LINE, K.muted, ";margin-top:1.6cqmin;font-weight:500"),
    ),
    footer: kFooterPresented("presented by", ft),
    deco: { word: "FIVE", script: "Five-star" },
  });
  return kitFormats(() => html);
}

// ---------------------------------------------------------------------------
// Club Leaders (Runs / Wickets presets)
// ---------------------------------------------------------------------------

export function clubLeadersFormats(
  look: PackLook,
  preset: "Runs" | "Wickets",
  footer?: Partial<FooterKeys>,
): PackTemplateFormats {
  const ft = keys({ ...BD_KEYS, offLeft: "hashtagsExtra" }, footer);
  const row =
    `<div style="display:flex;align-items:center;gap:2.6cqmin;padding:1.2cqmin 2.4cqmin;margin-top:1cqmin;border-radius:${K.rowR};background:${K.panel};border:.2cqmin solid ${K.panelBorder};color:${K.panelText}">` +
    `<div style="width:12cqmin;flex:none"><div style="font-family:${K_DISP};font-size:4.4cqmin;line-height:.95;color:${K.panelAcc};white-space:nowrap">{{row.gradeLabel}}</div><div style="font-family:${SK_MONO};font-weight:600;font-size:1.5cqmin;letter-spacing:.12em;color:${K.panelMuted};margin-top:.4cqmin">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0;font-weight:600;font-size:3.3cqmin;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{row.playerName}}</div>` +
    `<div style="flex:none;font-family:${K_DISP};font-size:5.4cqmin;line-height:.9">{{row.value}}</div>` +
    `</div>`;
  return kitFormats((fmt) => {
    const head = kEyebrow("{{subtitle}}") + kTitle("{{title}}", 10.5, ";line-height:.92");
    const rows = `<div data-repeat="leaders" data-repeat-max="${fmt === "landscape" ? 5 : 8}">${row}</div>`;
    return kitCard(look, {
      chip: kitChip("{{category}}"),
      tag: "{{season}}",
      body: kSplit(look, fmt, head, rows),
      footer: kFooterPresented("stats by", ft),
      deco: { word: preset === "Runs" ? "RUNS" : "WKTS", script: "Top of the pops" },
    });
  });
}
