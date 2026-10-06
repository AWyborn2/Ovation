/**
 * Pack renderer — public entry point. Composes template resolution, input
 * binding, the html transforms and the token root wrapper into a native-size,
 * self-contained card html string.
 */

import { isSetKind, planCardSet } from "../card-sets/plan";
import { getPackManifest } from "../pack-templates/registry";
import type { ShareCardInput, CardSize } from "../share-card";
import { maxSponsorLogos } from "../share-card/sponsor-limit";
import type { CardThemeLike } from "./tokens";
import type { PackCardData, PackColourMode, PackTokens } from "./types";
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
  dropEmptyImageBlocks,
  dropEmptyPresentedBy,
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
  opts: { animate?: boolean } = {},
): string {
  const adj = isEmptyAdjustments(adjustments) ? null : adjustments;
  input = firstSlideOf(input);
  // Junior highlights are always a junior card (juniors palette).
  if (input.kind === "juniorHighlights") junior = true;
  // Club colours vs the pack's own look: drives the stage tint weight and any
  // club-mode markup swaps. ("pack" leaves the output byte-identical.)
  const mode = packColourModeFor(data, packId);
  if (packId === BLANK_PACK_ID) {
    // A blank canvas: the club's stage colour and the editor's layers only.
    const layers = renderFreeLayers(adj, size, opts, withMonogram(packFieldValues(input, data)), {
      tokens,
      brand: data?.brand,
      junior,
      rows: rowValues(bindInput(input).rows),
    });
    return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size, getPackManifest().inkTint, mode)}">${layers}</div>`;
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

  const bound = bindInput(input);
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
  html = hideFields(html, adj);
  html = substituteFields(html, values);
  // Long club and team names shrink to fit, then wrap, instead of "…".
  html = fitNames(html);
  html = cleanupEmptyRoles(html);
  html = cleanupEmptyBadges(html);

  const layers = renderFreeLayers(adj, size, opts, withMonogram(values), {
    tokens,
    brand: data?.brand,
    junior,
    rows: rowValues(bound.rows),
  });
  const manifest = getPackManifest(packId);
  const extra = manifest.rootVars?.({ tokens, brand: data?.brand, junior });
  return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size, manifest.inkTint, mode)}${extra ? `;${extra}` : ""}">${html}${layers}</div>`;
}

/** The editable text fields a design exposes, in template order (editor Content panel). */
/** Bound layout switches, not text an admin edits (a set's row size, a logo badge's visibility). */
const LAYOUT_ONLY_FIELD = /^rowScale$|(?:^|\.)logoDisplay$/;

export function packTextFields(
  input: ShareCardInput,
  packId?: string | null,
): { key: string; label: string }[] {
  if (packId === BLANK_PACK_ID) return [];
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
  if (!template) return {};
  const bound = bindInput(input);
  if (data) applyPackData(bound, data, input.kind);
  return { ...fieldDefaults(template), ...bound.values };
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
