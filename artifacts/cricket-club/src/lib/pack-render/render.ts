/**
 * Pack renderer — public entry point. Composes template resolution, input
 * binding, the html transforms and the token root wrapper into a native-size,
 * self-contained card html string.
 */

import {
  isDocumentV2,
  isPageBackground,
  kindFields,
  normaliseDocument,
  pageForInput,
  primaryPage,
  type PageKey,
} from "@workspace/scorecard/kind-templates";
import { isSetKind, planCardSet } from "../card-sets/plan";
import { getPackManifest } from "../pack-templates/registry";
import type { ShareCardInput, CardSize } from "../share-card";
import { maxSponsorLogos } from "../share-card/sponsor-limit";
import type { CardThemeLike } from "./tokens";
import type { BoundInput, PackCardData, PackColourMode, PackTokens } from "./types";
import { fieldDefaults, hasLandscapeFormat, resolveTemplate, selectFormatHtml } from "./templates";
import {
  brandDefaultTokens,
  DISPLAY_FONT_FAMILY,
  hasClubColours,
  normaliseBrandHex,
  packNativeSize,
  resolvePackTokens,
  rootStyle,
  stageInk,
  tokensFromCardTheme,
} from "./tokens";
import { applyPackData, bindInput } from "./bind";
import { cardMatchColours } from "./match-vars";
import {
  applyFieldOverrides,
  hideFields,
  hideSlots,
  isEmptyAdjustments,
  photoFor,
  renderFreeLayers,
  type CardAdjustments,
} from "./adjustments";
import {
  cleanupEmptyBadges,
  cleanupEmptyRoles,
  dropEmptyCapNumber,
  dropEmptyFieldBlocks,
  dropEmptyImageBlocks,
  dropEmptyPresentedBy,
  dropEmptyShirtNumber,
  expandRepeats,
  initialsOf,
  limitSponsorTiles,
  resolveSlots,
  selectSponsorVariant,
  substituteFields,
} from "./html-utils";
import { fitNames } from "./name-fit";

/** A card with no pack design: stage colour plus editor layers (Studio U18). */
export const BLANK_PACK_ID = "blank";

/**
 * The colour mode `packId` renders in for this club: `"pack"` when the club
 * switched that pack to "Pack's own look", otherwise `"club"` — except that a
 * brand with no usable colour always gets the pack's own look, so brand-less
 * previews are untouched. The pack id is resolved the way the renderer
 * resolves it (unknown/omitted → the default pack), so the stored key and the
 * rendered design always agree.
 */
export function packColourModeFor(
  data: PackCardData | null | undefined,
  packId?: string | null,
): PackColourMode {
  // A club-only pack (Club Kit) has no "Pack's own look": always club colours.
  if (packId !== BLANK_PACK_ID && getPackManifest(packId).colourMode === "club-only") return "club";
  if (!hasClubColours(data?.brand)) return "pack";
  const id = packId === BLANK_PACK_ID ? BLANK_PACK_ID : getPackManifest(packId).packId;
  return data?.packColourModes?.[id] === "pack" ? "pack" : "club";
}

/**
 * The tokens every pack surface renders with — `PackCard` (Studio previews,
 * create page, share modal, editor canvas) and, through it, the server
 * still/clip harness. Priority: junior > per-card override > theme > brand in
 * "pack's own look"; junior > per-card override > club brand > theme's font and
 * text colour in "club colours".
 */
export function resolveCardTokens({
  theme,
  junior,
  data,
  packId,
}: {
  theme?: CardThemeLike | null;
  junior: boolean;
  data?: PackCardData | null;
  packId?: string | null;
}): PackTokens {
  const mode = packColourModeFor(data, packId);
  return resolvePackTokens({
    brand: brandDefaultTokens(data?.brand, mode),
    theme: tokensFromCardTheme(theme),
    override: sanitisedOverride(data?.tokenOverride),
    junior,
    mode,
  });
}

/**
 * Per-card overrides arrive over the wire to the still harness, and tokens are
 * written unescaped into an inline style — so colours pass the same strict hex
 * gate as brand colours, and the font key is only ever looked up, never
 * emitted.
 */
function sanitisedOverride(o: PackCardData["tokenOverride"]): Partial<PackTokens> | null {
  if (!o) return null;
  const out: Partial<PackTokens> = {};
  const accent = normaliseBrandHex(o.accent);
  const panel = normaliseBrandHex(o.panel);
  if (accent) out.accent = accent;
  if (panel) out.panel = panel;
  const font = o.displayFont;
  if (typeof font === "string" && Object.prototype.hasOwnProperty.call(DISPLAY_FONT_FAMILY, font)) {
    out.displayFont = font;
  }
  return out;
}

/** Field values plus the club's monogram (initials), for library elements. */
/**
 * The server's positive marker that a junior card may show its photo — a junior
 * player's own photo the family allows (ADR-007), or explicitly approved club
 * stock artwork on a carousel. The API verifies stock ownership before review.
 */
function juniorPhotoAllowedOn(input: ShareCardInput): boolean {
  return (input as { juniorPhotoAllowed?: boolean }).juniorPhotoAllowed === true;
}

function withMonogram(values: Record<string, string>): Record<string, string> {
  if (values.clubMonogram || !values.clubName) return values;
  return { ...values, clubMonogram: initialsOf(values.clubName) };
}

/** Bound repeat rows as plain cell maps, for live library elements. */
function rowValues(
  rows: Record<string, Array<{ values: Record<string, string> }>>,
): Record<string, Array<Record<string, string>>> {
  const out: Record<string, Array<Record<string, string>>> = {};
  for (const [key, list] of Object.entries(rows)) out[key] = list.map((r) => r.values);
  return out;
}

/** Each bound repeat row's variant, parallel to `rowValues` (for `rows` layers). */
function rowVariantsOf(
  rows: Record<string, Array<{ variant?: string }>>,
): Record<string, Array<string | undefined>> {
  const out: Record<string, Array<string | undefined>> = {};
  for (const [key, list] of Object.entries(rows)) out[key] = list.map((r) => r.variant);
  return out;
}

/** Where a card's input carries its photo: the player's, or a kind's own photo slot. */
const CARD_PHOTO_SLOTS = ["photo", "teamPhoto", "squadPhoto", "cardPhoto"] as const;

/** Image slots that hold logos (crests, sponsors), never photos. */
const LOGO_SLOT = /^(?:clubLogo|sponsor\d+|weekendSponsor\d+)$|(?:^|\.)(?:logo|crest)$/;

/**
 * A card's bound images for format v2 layers (image tokens, conditions). On
 * a junior card the server hasn't cleared for a photo, only logos are kept:
 * no template token or condition can bring a junior's photo back (ADR-007).
 */
function layerImages(
  images: Record<string, string>,
  kind: string,
  withholdPhotos: boolean,
): Record<string, string> {
  if (!withholdPhotos) return { ...images };
  const logos = new Set(
    (kindFields(kind)?.images ?? []).filter((i) => i.type === "logo").map((i) => i.key),
  );
  return Object.fromEntries(
    Object.entries(images).filter(([key]) => logos.has(key) || LOGO_SLOT.test(key)),
  );
}

/** Apply a pack's club-mode markup swaps (e.g. Sunset's club sky). */
function applyClubSwaps(html: string, packId: string | null | undefined): string {
  const swaps = getPackManifest(packId).clubSwaps;
  if (!swaps) return html;
  let out = html;
  for (const [from, to] of swaps) out = out.split(from).join(to);
  return out;
}

/**
 * Bind an input into its pack template and return native-size, self-contained
 * card HTML. Falls back to the story/shared layout for an unknown size, and to
 * template samples for any field the input does not supply.
 *
 * `packId` selects which registered pack supplies the design; omitted or
 * unknown resolves to {@link DEFAULT_PACK_ID}. Returns `""` when the resolved
 * pack has no design for the input's kind — packs need not cover every kind, so
 * check {@link packSupportsKind} with the same `packId` before routing here.
 */
/**
 * A set input that was never planned (a queue thumbnail, an animated preview)
 * renders as its post's first slide, so a long round never overflows one card.
 * Planned slides carry `density` / `setRole` / `setPage` and pass through.
 */
function firstSlideOf(input: ShareCardInput): ShareCardInput {
  if (!isSetKind(input.kind)) return input;
  const planned = input as { density?: unknown; setRole?: unknown; setPage?: unknown };
  if (planned.density || planned.setRole || planned.setPage) return input;
  const slides = planCardSet(input);
  const first = slides[0]?.input;
  if (!first || (slides.length === 1 && first.kind === input.kind)) return input;
  return first;
}

export function renderPackCard(
  input: ShareCardInput,
  size: CardSize,
  sponsorsOn: boolean,
  tokens: PackTokens,
  junior: boolean,
  data?: PackCardData | null,
  packId?: string | null,
  /** Editor overlay (U15, KTD12). Absent or empty renders byte-identically. */
  adjustments?: CardAdjustments | null,
  /**
   * `page`: the template page to draw (format v2, ADR-011); absent → the
   * kind's primary page, where a v1 document's layers are.
   */
  opts: { animate?: boolean; page?: PageKey } = {},
): string {
  const adj = isEmptyAdjustments(adjustments) ? null : adjustments;
  input = firstSlideOf(input);
  // Junior highlights are always a junior card (juniors palette).
  if (input.kind === "juniorHighlights") junior = true;
  // The page a v2 document draws: the one asked for, else the one this input
  // is (a carousel title, sponsors or day slide). A v1 document has one page,
  // drawn on every slide as it always was.
  const page = opts.page ?? (isDocumentV2(adj) ? pageForInput(input) : undefined);
  const withholdPhotos = junior && !juniorPhotoAllowedOn(input);
  // Club colours vs the pack's own look: drives the stage tint weight and any
  // club-mode markup swaps. ("pack" leaves the output byte-identical.)
  const mode = packColourModeFor(data, packId);
  if (packId === BLANK_PACK_ID) {
    // A blank canvas: the club's stage colour and the editor's layers only
    // (also the base every card kind template renders on, ADR-001).
    const bound = bindInput(input, packId, data?.names);
    // The tenant's logos and sponsors too, for v2 image tokens and conditions.
    const withData: BoundInput = { values: {}, images: { ...bound.images }, rows: {} };
    if (data) applyPackData(withData, data, input.kind);
    const layers = renderFreeLayers(
      adj,
      size,
      opts,
      withMonogram(packFieldValues(input, data, BLANK_PACK_ID)),
      {
        tokens,
        brand: data?.brand,
        junior,
        // A junior card shows a photo only behind the server's positive marker (ADR-007).
        juniorPhotoAllowed: juniorPhotoAllowedOn(input),
        rows: rowValues(bound.rows),
        rowVariants: rowVariantsOf(bound.rows),
        // The card's photo; a v2 document also draws the one the input carries
        // (a player's, a premiership's team photo), as the packs do.
        photoUrl: withholdPhotos
          ? null
          : (data?.photoUrl ??
            (isDocumentV2(adj)
              ? (CARD_PHOTO_SLOTS.map((slot) => withData.images[slot]).find(Boolean) ?? null)
              : null)),
        // The photo placement sliders (the share dialog, a queued draft's photo).
        photoTransform: data?.photoTransform ?? null,
        images: layerImages(withData.images, input.kind, withholdPhotos),
        kind: input.kind,
        page,
        match: cardMatchColours(input, tokens, data?.brand),
      },
    );
    const background = pageBackgroundStyle(adj, input.kind, page);
    return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size, getPackManifest().inkTint, mode)}${background}">${layers}</div>`;
  }
  const template = resolveTemplate(input, packId);
  if (!template) return "";

  // Landscape without a dedicated layout: the square card, scaled to the
  // frame's height and centred on the pack's stage colour (KTD11).
  if (size === "landscape" && !hasLandscapeFormat(template.formats)) {
    const square = renderPackCard(
      input,
      "square",
      sponsorsOn,
      tokens,
      junior,
      data,
      packId,
      adj,
      opts,
    );
    return letterboxLandscape(square, tokens, packId, mode);
  }

  const bound = bindInput(input, packId, data?.names);
  // Overlay tenant data (logo, name, hashtags, sponsors, photo) onto the bound
  // input before defaults are merged, so tenant values win over the samples.
  if (data) applyPackData(bound, data, input.kind);
  // Editor image overrides (e.g. a club-library photo) win over the input and tenant data.
  if (adj?.images) Object.assign(bound.images, adj.images);
  // Editor field overrides win over the input and the tenant overlay.
  const values = applyFieldOverrides({ ...fieldDefaults(template), ...bound.values }, adj);
  // The monogram stand-in for a crest: the tenant's initials unless overridden.
  if (!adj?.fields?.clubMonogram && "clubMonogram" in values && bound.values.clubName) {
    values.clubMonogram = initialsOf(bound.values.clubName);
  }
  // Anything the editor overrode is real content, not a sample to rewrite.
  for (const key of Object.keys(adj?.fields ?? {})) bound.values[key] = values[key];
  // On a data-bearing render, any template SAMPLE still surfacing (a field the
  // input did not bind) speaks as the tenant rather than a generic club:
  // "YOUR CLUB · 2ND INNINGS" → "MANDURAH · 2ND INNINGS". Only default-derived
  // values are touched — anything the input or the tenant overlay bound is
  // real data and must never be rewritten.
  if (data?.brand?.name) {
    const club = data.brand.name.replace(/\s+Cricket Club$/i, "").trim() || data.brand.name;
    for (const key of Object.keys(values)) {
      if (key in bound.values) continue;
      values[key] = values[key].replace(/SAMPLE CLUB|YOUR CLUB|Sample Club|Your Club/g, (t) =>
        t === t.toUpperCase() ? club.toUpperCase() : club,
      );
    }
  }

  // Full-bleed only makes sense once there is an actual photo bound to the hero
  // slot; without one the wrapper would just stretch an initials placeholder
  // across the whole card. Gate on both the placement flag and a resolved photo.
  const photoFullBleed = data?.photoPlacement === "fullBleed" && Boolean(bound.images["photo"]);

  let html = selectFormatHtml(template.formats, size);
  // Club-mode markup swaps run on the template itself, before any field value
  // is substituted, so card text can never be rewritten by them.
  if (mode === "club") html = applyClubSwaps(html, packId);
  html = selectSponsorVariant(html, sponsorsOn);
  // A data-bearing render shows only the sponsors that have a logo: no empty
  // tiles, and with no logos at all the strip gives way to the presenting
  // sponsor's name. Sample previews (no data) keep their placeholder tiles.
  const kindCap = maxSponsorLogos(input.kind);
  const logoCount = [1, 2, 3].filter((n) => bound.images[`sponsor${n}`]).length;
  html = limitSponsorTiles(html, data ? Math.min(kindCap ?? 3, logoCount) : kindCap);
  html = expandRepeats(html, bound.rows, template);
  // Before slots resolve: an optional block whose image never arrived is removed
  // outright rather than rendering an empty framed placeholder.
  html = dropEmptyImageBlocks(html, bound.images);
  html = hideSlots(html, adj);
  const photo = photoFor(adj, size)?.value ?? data?.photoTransform;
  html = resolveSlots(html, bound.images, values, photo, photoFullBleed, adj != null);
  // Drop the "presented by <sponsor>" line entirely when no presenting sponsor
  // resolved (empty value) — must run before substitution while the placeholder
  // is intact. A non-empty sample/tenant value keeps the line.
  if (!values["sponsorPresentedBy"]) html = dropEmptyPresentedBy(html);
  // Same treatment for a debut card that resolved no cap number: drop the line
  // rather than render a bare "CAP" label. Must also run before substitution.
  if (input.kind === "debut" && !values["capNumber"]) {
    html = dropEmptyCapNumber(html);
  }
  // A player with no shirt number this season (or a club with the feature
  // off) shows no badge at all — never a bare "#" or a sample. Any
  // card kind: the badge only exists on player-centric designs.
  if (!values["shirtNumber"]) html = dropEmptyShirtNumber(html);
  html = hideFields(html, adj);
  // Optional text boxes whose field is switched off or empty drop out (ADR-010).
  html = dropEmptyFieldBlocks(html, values);
  html = substituteFields(html, values);
  // Long club and team names shrink to fit, then wrap, instead of "…".
  html = fitNames(html);
  html = cleanupEmptyRoles(html);
  html = cleanupEmptyBadges(html);
  const manifest = getPackManifest(packId);
  const packCtx = { tokens, brand: data?.brand, junior };
  if (manifest.finish) html = manifest.finish(html, packCtx);

  const layers = renderFreeLayers(adj, size, opts, withMonogram(values), {
    tokens,
    brand: data?.brand,
    junior,
    rows: rowValues(bound.rows),
    images: layerImages(bound.images, input.kind, withholdPhotos),
    kind: input.kind,
    page,
    match: cardMatchColours(input, tokens, data?.brand),
  });
  const extra = manifest.rootVars?.(packCtx);
  return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size, manifest.inkTint, mode)}${extra ? `;${extra}` : ""}">${html}${layers}</div>`;
}

/** The editable text fields a design exposes, in template order (editor Content panel). */
/** Bound layout switches, not text an admin edits (a set's row size, a logo badge's visibility). */
const LAYOUT_ONLY_FIELD = /^rowScale$|(?:^|\.)logoDisplay$/;

export function packTextFields(
  input: ShareCardInput,
  packId?: string | null,
): { key: string; label: string }[] {
  // A blank canvas (and every card kind template) offers the kind's live
  // fields from the shared catalogue (KTD4).
  if (packId === BLANK_PACK_ID) {
    return (kindFields(input.kind)?.fields ?? []).filter((f) => !LAYOUT_ONLY_FIELD.test(f.key));
  }
  const template = resolveTemplate(input, packId);
  if (!template) return [];
  return template.fields
    .filter((f) => f.type === "text" && !LAYOUT_ONLY_FIELD.test(f.key))
    .map((f) => ({ key: f.key, label: f.label }));
}

/** What each text field shows before editor overrides: input and tenant data over samples. */
export function packFieldValues(
  input: ShareCardInput,
  data?: PackCardData | null,
  packId?: string | null,
): Record<string, string> {
  // A blank canvas still binds the card's data, for live-stat layers.
  const template = resolveTemplate(input, packId === BLANK_PACK_ID ? null : packId);
  if (!template && packId !== BLANK_PACK_ID) return {};
  const bound = bindInput(input, packId, data?.names);
  if (data) applyPackData(bound, data, input.kind);
  // A kind the reference pack has no design for (a Club Kit-only kind) still
  // binds its own data on the blank base — with no sample defaults to fill in.
  const values = template ? { ...fieldDefaults(template), ...bound.values } : bound.values;
  // The template editor's sample text for fields this card kind has no value
  // for (a match data block on a team list design), so it can be seen.
  if (data?.sampleValues)
    for (const [key, value] of Object.entries(data.sampleValues))
      if (!values[key]) values[key] = value;
  return values;
}

/**
 * The page's own background colour, as extra root styles (`;background:…;color:…`),
 * or "" for a page on the club's stage colour. Text with no colour of its own
 * reads dark on a light page and light on a dark one.
 */
export function pageBackgroundStyle(adj: unknown, kind: string, page?: PageKey): string {
  if (!isDocumentV2(adj)) return "";
  const background = normaliseDocument(adj, kind).pages[page ?? primaryPage(kind)]?.background;
  if (!isPageBackground(background)) return "";
  return `;background:${background};color:${pageInk(background)}`;
}

/** The text colour that reads on a page background: dark on light, light on dark. */
export function pageInk(background: string): string {
  if (background.startsWith("var(")) {
    // The club colour has its own contrasting ink; the panels and stage are dark.
    return background.includes("--gold") ? "var(--accent-ink, #111111)" : "#FFFFFF";
  }
  let hex = background.slice(1);
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.6 ? "#16181C" : "#FFFFFF";
}

/** Wrap a rendered square card in a 1200×630 frame, scaled and centred. */
function letterboxLandscape(
  squareHtml: string,
  tokens: PackTokens,
  packId: string | null | undefined,
  mode: PackColourMode,
): string {
  const frame = packNativeSize("landscape");
  const inner = packNativeSize("square");
  const scale = frame.h / inner.h;
  const left = Math.round((frame.w - inner.w * scale) / 2);
  const ink = stageInk(tokens, getPackManifest(packId).inkTint, mode);
  const frameStyle = [
    "position:relative",
    `width:${frame.w}px`,
    `height:${frame.h}px`,
    "overflow:hidden",
    `background:radial-gradient(circle at 50% 50%, ${tokens.panel} 0%, ${ink} 72%)`,
  ].join(";");
  const innerStyle = [
    "position:absolute",
    "top:0",
    `left:${left}px`,
    `width:${inner.w}px`,
    `height:${inner.h}px`,
    `transform:scale(${scale})`,
    "transform-origin:top left",
  ].join(";");
  return `<div class="pack-card-root pack-landscape-fallback" style="${frameStyle}"><div style="${innerStyle}">${squareHtml}</div></div>`;
}
