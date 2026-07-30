import { columnRoot, slot } from "../shared";

/**
 * Shared markup fragments for the Bold Type pack, transcribed verbatim from the
 * Pack C bundle (`c-*.html`). Same discipline as Broadcast Dark's and Gold
 * Foil's: the inline styles are copied rather than rewritten, because fidelity
 * comes from not re-authoring the CSS.
 *
 * Pack-agnostic mechanics (slots, sponsor wrappers, format roots, field
 * descriptors) come from `../shared` and are re-exported here so card modules
 * import from one place.
 *
 * Bold Type's identity vs the other packs:
 *  - **massive condensed display type as the hero** — 230px scores, 150px
 *    result lines; the type IS the image (the bundle's own card note reads
 *    "Oversized score as hero, Swiss grid, no photo — pure typography"),
 *  - **flat colour-block composition**: a flat `--block` field with a solid
 *    `--gold` band, no gradients or texture in the story,
 *  - **gold outline-stroke display type** (`-webkit-text-stroke`) instead of
 *    foil gradients or glows — see {@link outlineText},
 *  - **mono tracked labels + hard hairline rules** (2px, high-contrast) and
 *    sharp 2px corners on story image frames,
 *  - a **full-bleed solid-gold footer bar** carrying the club name (story
 *    formats), rather than a floating text footer.
 *
 * Token note: the bundle drives the flat field with `--block` (a mid-value
 * club-hued navy, distinct from the near-black `--ink` stage). The renderer
 * does not currently emit `--block`, so it resolves to the verbatim fallback
 * `#0E1C31` for every tenant — kept as-is (like `--surface-*` / `--accent-ink`
 * in the other packs) so promoting `--block` to a real token later needs no
 * template edits. Every accent reads `var(--gold)` / `var(--panel)` /
 * `var(--ink)` as usual, so tenant theming carries the card.
 *
 * Feed (portrait/square) composition — a DEPARTURE from the bundle.
 *
 * The bundle authored every pack's non-story branch as Broadcast Dark's layout
 * with a different background, so all five packs rendered near-identically in
 * the feed formats and in the Studio's pack picker — you could not tell Gold
 * Foil from Bold Type at a glance, which defeats the point of a catalogue.
 *
 * Bold Type's feed layout therefore drops the shared top header band entirely
 * and puts the club name down a vertical TYPE SPINE at the left edge, with the
 * content column set to its right behind a hard gold rule. That is the pack's
 * own thesis applied to the format — the type frames the card instead of
 * sitting in a row above it — and it is what distinguishes it from the other
 * four packs at thumbnail size.
 */

export {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  formatRoot,
  logoField,
  photoField,
  repeatField,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "../shared";

// ---------------------------------------------------------------------------
// Background layers
// ---------------------------------------------------------------------------

/**
 * Story background: one flat colour block, nothing else. Cards layer their own
 * solid `--gold` band over it where the composition calls for one (Match
 * Result's bottom band) — the flat field itself is the whole story stage.
 */
export const STORY_BG = `<div style="position:absolute;inset:0;background:var(--block,#0E1C31)"></div>`;

/**
 * Non-story background: the flat block with a subtle top sheen, plus the
 * rotated gold beam and the bottom panel glow (shared with Broadcast Dark /
 * Gold Foil — the bundle authored the non-story branch on that common stage).
 */
export const SHARED_BG =
  `<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,.05), transparent 24%), var(--block,#0E1C31)"></div>` +
  `<div style="position:absolute;top:-180px;right:-160px;width:820px;height:1300px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) 13%, transparent),transparent);transform:rotate(20deg)"></div>` +
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 66% at 50% 122%, color-mix(in srgb, var(--panel,#42342B) 40%, transparent), transparent 60%)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/** Width of the type spine, and the gutter between its rule and the content. */
const SPINE_W = 156;

/**
 * The left type spine: the club's own name set vertically in the display face,
 * with the logo above it and a hard gold rule closing it off.
 *
 * This replaces the horizontal logo/name header every pack shared. At thumbnail
 * size it is the silhouette that identifies Bold Type — a tall block of type on
 * the left edge rather than a band across the top.
 */
function typeSpine(withName: boolean): string {
  return (
    `<div style="position:absolute;left:0;top:0;bottom:0;width:${SPINE_W}px;display:flex;flex-direction:column;align-items:center;gap:26px;padding:58px 0 52px;overflow:hidden">` +
    `<div style="width:72px;height:72px;flex:none">${slot("clubLogo", "logo", "rect")}</div>` +
    (withName
      ? `<div style="flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center">` +
        `<div style="writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--disp,'Anton'),sans-serif;font-size:64px;line-height:1;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;color:color-mix(in srgb, var(--gold,#FBAC27) 26%, transparent)">{{clubName}}</div>` +
        `</div>`
      : "") +
    `</div>` +
    `<div style="position:absolute;left:${SPINE_W}px;top:0;bottom:0;width:3px;background:var(--gold,#FBAC27);opacity:.55"></div>`
  );
}

/**
 * Non-story root: the flat field, the type spine, and a content column inset to
 * the right of the spine's rule.
 *
 * `spineName: false` drops the vertical club name for the one card whose
 * reference design is deliberately logo-only (Debut declares no `clubName`, and
 * field-key parity forbids a pack declaring a key the reference lacks). That
 * card keeps the logo and the gold rule, so the silhouette still reads as Bold
 * Type.
 */
export function sharedColumnRoot(
  columnInner: string,
  rootStyle = "",
  { spineName = true }: { spineName?: boolean } = {},
): string {
  return columnRoot(
    SHARED_BG + typeSpine(spineName),
    columnInner,
    `58px 66px 52px ${SPINE_W + 46}px`,
    rootStyle,
  );
}

/**
 * Story root — a flex column over the flat block, padded to the bundle's story
 * margins (80px sides / 80px top / 70px bottom).
 *
 * Match Result keeps the bundle's absolute-pinned story composition (its two
 * colour bands split at a fixed y and nothing in it is conditional after the
 * POTM removal), but every other Bold Type story is a straight column — the
 * same reflow rationale as Gold Foil's: conditional blocks collapse cleanly
 * instead of leaving coordinate-tuned holes.
 *
 * NOTE: the full-bleed gold footer bars ({@link PRESENTED_BY_STORY} /
 * {@link HASHTAG_FOOTER_STORY}) cancel exactly this root's padding with
 * negative margins — change one and you must change the other.
 */
export function storyColumnRoot(columnInner: string, columnStyle = ""): string {
  return columnRoot(STORY_BG, columnInner, "80px 80px 70px", "", columnStyle);
}

// ---------------------------------------------------------------------------
// Type treatments
// ---------------------------------------------------------------------------

/**
 * The pack's signature: hollow display type — a gold `-webkit-text-stroke`
 * outline with a transparent fill, set in the display face at poster size.
 * The bundle uses it for the emphatic half of the story result line
 * ("WON BY / <outlined>8 WICKETS</outlined>"); template fields are single
 * strings, so card modules apply it to the whole field instead.
 *
 * The stroke reads `var(--gold)` directly, so it re-colours per tenant — no
 * fixed ramp like Gold Foil's foil gradient.
 */
export function outlineText(content: string, fontSize: number, extraStyle = ""): string {
  return (
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:${fontSize}px;line-height:.94;text-transform:uppercase;` +
    `-webkit-text-stroke:3px var(--gold,#F5B21A);color:transparent${extraStyle}">${content}</div>`
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Story header: tracked mono club wordmark left, tracked mono tag right, on one
 * hairline-free row. Bold Type has no logo slot in the story header — the
 * bundle sets the club identity as tracked mono type (the logo appears where a
 * card's composition places it, e.g. Match Result's oversized top-right slot).
 */
export function storyHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--gold,#F5B21A)">{{clubName}}</div>` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.55)">${tag}</div>` +
    `</div>`
  );
}

/** Solid gold pill chip (non-story header, right side). */
export function goldChip(label: string): string {
  return `<div style="display:inline-block;background:var(--gold,#FBAC27);color:var(--accent-ink,#151515);font-weight:800;font-size:20px;line-height:1;letter-spacing:.03em;padding:11px 15px;border-radius:7px">${label}</div>`;
}

/** Non-story header: club logo + name/tagline on the left, chip + tag right. */
/**
 * Feed header — the chip and its tag only.
 *
 * The logo and club name live in {@link TYPE_SPINE} now, so this is a single
 * tracked row rather than the logo/name/chip band the other packs share. The
 * tagline sits opposite the chip to keep the row from reading half-empty.
 */
export function sharedHeader(chipLabel: string, tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:20px">` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.5);padding-top:9px">{{clubTagline}}</div>` +
    `<div style="text-align:right;flex:none">${goldChip(chipLabel)}` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px">${tag}</div></div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/**
 * The full-bleed gold footer bar — Bold Type's signature footer (transcribed
 * from the bundle's club-leaders card, where it anchors every format): a solid
 * `--gold` band that bleeds out of {@link storyColumnRoot}'s padding, club
 * name left in heavy caps, one mono line right, all set in the accent's ink.
 */
function goldBarStory(right: string): string {
  return (
    `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
    `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>${right}</div>`
  );
}

/** Story sponsors-on footer: the gold bar with a "presented by" credit. */
export const PRESENTED_BY_STORY = goldBarStory(
  `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">presented by {{sponsorPresentedBy}}</span>`,
);

/** Story sponsors-off footer: the gold bar with the club hashtag. */
export const HASHTAG_FOOTER_STORY = goldBarStory(
  `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{clubHashtag}}</span>`,
);

function sponsorSlots(height: number): string {
  return [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:${height}px;border-radius:11px;overflow:hidden;background:rgba(255,255,255,.92)">${slot(`sponsor${n}`, "sponsor", "rounded", 11)}</div>`,
    )
    .join("");
}

/** Non-story three-logo sponsor strip (flex:none block at the column foot). */
export const SPONSOR_STRIP_SHARED =
  `<div style="flex:none"><div style="font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:14px">${sponsorSlots(88)}</div></div>`;

/** Non-story sponsors-off hashtag footer. */
export const HASHTAG_FOOTER_SHARED = `<div style="flex:none;text-align:center;font-weight:700;font-size:24px;line-height:1;letter-spacing:.13em;color:var(--gold,#FBAC27)">{{hashtags}}</div>`;
