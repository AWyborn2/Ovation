import type { PackTemplateField } from "../types";

/**
 * Shared markup fragments for the Broadcast Dark pack, transcribed verbatim
 * from `Pack A - Broadcast Dark.dc.html`. Every card in the bundle repeats
 * these exact inline styles; centralising the strings keeps the CSS
 * byte-identical across the 20 design modules (fidelity comes from not
 * rewriting the CSS). Anything that differs per card is passed in as a
 * parameter or written inline in the card module.
 */

// ---------------------------------------------------------------------------
// Image slots
// ---------------------------------------------------------------------------

/** Generic image slot; fills its wrapper (the wrapper keeps size/radius). */
export function slot(
  key: string,
  type: "photo" | "logo" | "sponsor",
  shape: "rect" | "rounded" | "circle" = "rect",
  radius?: number,
): string {
  const r = radius != null ? ` data-radius="${radius}"` : "";
  return `<div data-slot="${key}" data-slot-type="${type}" data-shape="${shape}"${r} style="width:100%;height:100%"></div>`;
}

/** Tenant club logo slot (bundle: `fit="contain" shape="rect"`). */
export const CLUB_LOGO_SLOT = `<div data-slot="clubLogo" data-slot-type="logo" data-shape="rect" data-fit="contain" style="width:100%;height:100%"></div>`;

// ---------------------------------------------------------------------------
// Background layers
// ---------------------------------------------------------------------------

/** Radial base + rotated gold beam (beam gold % varies on A8/A10). */
export function bgBase(beamPct = 13): string {
  return (
    `<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 50% -12%, var(--surface-top,#1e232c) 0%, var(--ink,#101216) 52%, var(--surface-deep,#08090c) 100%)"></div>` +
    `<div style="position:absolute;top:-180px;right:-160px;width:820px;height:1300px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) ${beamPct}%, transparent),transparent);transform:rotate(20deg)"></div>`
  );
}

/** Bottom panel glow (third background layer on most cards). */
export const PANEL_GLOW = `<div style="position:absolute;inset:0;background:radial-gradient(120% 66% at 50% 122%, color-mix(in srgb, var(--panel,#42342B) 40%, transparent), transparent 60%)"></div>`;

export function bgLayers(beamPct = 13): string {
  return bgBase(beamPct) + PANEL_GLOW;
}

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/**
 * Template root: the 1080-wide card inner content at native size. The bundle's
 * preview scaling wrappers (width:var(--pw), transform:scale(var(--cscale)))
 * are stripped — the renderer owns sizing via the format's canvas dimensions
 * and the `--ch` / `--k` tokens.
 */
export function formatRoot(inner: string, rootStyle = ""): string {
  return `<div style="position:absolute;inset:0${rootStyle}">${inner}</div>`;
}

/** Shared (non-story) root: background layers + fluid flex column. */
export function sharedColumnRoot(
  layers: string,
  columnInner: string,
  rootStyle = "",
): string {
  return formatRoot(
    `${layers}<div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:58px 66px 52px">${columnInner}</div>`,
    rootStyle,
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** Gold pill chip. Story sections default the gold to #F5B21A, shared to #FBAC27. */
export function goldChip(label: string, fmt: "story" | "shared"): string {
  const gold = fmt === "story" ? "#F5B21A" : "#FBAC27";
  return `<div style="display:inline-block;background:var(--gold,${gold});color:var(--accent-ink,#151515);font-weight:800;font-size:20px;line-height:1;letter-spacing:.03em;padding:11px 15px;border-radius:7px">${label}</div>`;
}

/** Small monospace tag under the header chip. */
export function headerTag(content: string, extraStyle = ""): string {
  return `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px${extraStyle}">${content}</div>`;
}

/** Story header: club logo + name/tagline left, chip + tag right. */
export function storyHeader(rightHtml: string): string {
  return `<div style="position:absolute;top:60px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:22px"><div style="width:104px;height:104px">${CLUB_LOGO_SLOT}</div><div><div style="font-weight:800;font-size:34px;line-height:1;letter-spacing:.01em">{{clubName}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.55);margin-top:8px">{{clubTagline}}</div></div></div><div style="text-align:right">${rightHtml}</div></div>`;
}

/** Shared header: same content in the flex column (flex:none row). */
export function sharedHeader(rightHtml: string): string {
  return `<div style="flex:none;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:20px"><div style="width:100px;height:100px;flex:none">${CLUB_LOGO_SLOT}</div><div><div style="font-weight:800;font-size:34px;line-height:1;letter-spacing:.01em">{{clubName}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.55);margin-top:8px">{{clubTagline}}</div></div></div><div style="text-align:right">${rightHtml}</div></div>`;
}

// ---------------------------------------------------------------------------
// Sponsor variant blocks
// ---------------------------------------------------------------------------

/** Sponsors-on wrapper (layout-neutral; renderer removes the losing variant). */
export function sponsorsOn(inner: string): string {
  return `<div data-sponsors="on" style="display:contents">${inner}</div>`;
}

/** Sponsors-off wrapper. */
export function sponsorsOff(inner: string): string {
  return `<div data-sponsors="off" style="display:contents">${inner}</div>`;
}

function sponsorSlots(height: number): string {
  return [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:${height}px;border-radius:11px;overflow:hidden;background:rgba(255,255,255,.92)">${slot(`sponsor${n}`, "sponsor", "rounded", 11)}</div>`,
    )
    .join("");
}

/** Story "PROUDLY SUPPORTED BY" three-logo strip (absolute bottom). */
export const SPONSOR_STRIP_STORY = sponsorsOn(
  `<div style="position:absolute;bottom:56px;left:70px;right:70px"><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.4);margin-bottom:14px">PROUDLY SUPPORTED BY</div><div style="display:flex;gap:14px">${sponsorSlots(100)}</div></div>`,
);

/** Shared-format sponsor strip (flex:none block in the column). */
export function sponsorStripShared(marginTop = ""): string {
  return sponsorsOn(
    `<div style="flex:none${marginTop}"><div style="font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div><div style="display:flex;gap:14px">${sponsorSlots(88)}</div></div>`,
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/** Centered hashtag footer (story, sponsors-off variant). */
export function hashtagFooterStory(bottom: number, extraStyle = ""): string {
  return sponsorsOff(
    `<div style="position:absolute;bottom:${bottom}px;left:70px;right:70px;text-align:center;font-weight:700;font-size:26px;line-height:1;letter-spacing:.13em;color:var(--gold,#F5B21A)${extraStyle}">{{hashtags}}</div>`,
  );
}

/** Centered hashtag footer (shared, sponsors-off variant). */
export function hashtagFooterShared(extraStyle = ""): string {
  return sponsorsOff(
    `<div style="flex:none;text-align:center;font-weight:700;font-size:24px;line-height:1;letter-spacing:.13em;color:var(--gold,#FBAC27)${extraStyle}">{{hashtags}}</div>`,
  );
}

/** "presented by <sponsor>" line — verbs vary per card ("supported by", "stats by", …). */
export function presentedBy(verb: string, extraStyle = ""): string {
  return `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6)${extraStyle}">${verb} <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;
}

/** Story footer row: club hashtag left + right-hand content. */
export function footerRowStory(
  bottom: number,
  rightHtml: string,
  hashtagExtraStyle = "",
): string {
  return `<div style="position:absolute;bottom:${bottom}px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A)${hashtagExtraStyle}">{{clubHashtag}}</div>${rightHtml}</div>`;
}

/** Shared footer row: club hashtag left + right-hand content (flex:none row). */
export function footerRowShared(
  rightHtml: string,
  marginTop = "",
  hashtagExtraStyle = "",
): string {
  return `<div style="flex:none;display:flex;align-items:center;justify-content:space-between${marginTop}"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)${hashtagExtraStyle}">{{clubHashtag}}</div>${rightHtml}</div>`;
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

export function textField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "text", label, sample };
}

export function photoField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "photo", label, sample };
}

export function logoField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "logo", label, sample };
}

export function repeatField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "repeat", label, sample };
}

/** Fields present on every card's header. */
export function clubHeaderFields(): PackTemplateField[] {
  return [
    textField("clubName", "Club name", "HALLS HEAD"),
    textField("clubTagline", "Club tagline", "CRICKET CLUB · EST 1991"),
    logoField("clubLogo", "Club logo", "Club logo"),
  ];
}
