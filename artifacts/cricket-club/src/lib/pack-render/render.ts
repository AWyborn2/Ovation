/**
 * Pack renderer — public entry point. Composes template resolution, input
 * binding, the html transforms and the token root wrapper into a native-size,
 * self-contained card html string.
 */

import { getPackManifest } from "../pack-templates/registry";
import type { ShareCardInput, CardSize } from "../share-card";
import type { PackCardData, PackTokens } from "./types";
import { fieldDefaults, hasLandscapeFormat, resolveTemplate, selectFormatHtml } from "./templates";
import { packNativeSize, rootStyle, stageInk } from "./tokens";
import { applyPackData, bindInput } from "./bind";
import {
  cleanupEmptyRoles,
  dropEmptyCapNumber,
  dropEmptyImageBlocks,
  dropEmptyPresentedBy,
  expandRepeats,
  resolveSlots,
  selectSponsorVariant,
  substituteFields,
} from "./html-utils";

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
export function renderPackCard(
  input: ShareCardInput,
  size: CardSize,
  sponsorsOn: boolean,
  tokens: PackTokens,
  junior: boolean,
  data?: PackCardData | null,
  packId?: string | null,
): string {
  const template = resolveTemplate(input, packId);
  if (!template) return "";

  // Landscape without a dedicated layout: the square card, scaled to the
  // frame's height and centred on the pack's stage colour (KTD11).
  if (size === "landscape" && !hasLandscapeFormat(template.formats)) {
    const square = renderPackCard(input, "square", sponsorsOn, tokens, junior, data, packId);
    return letterboxLandscape(square, tokens, packId);
  }

  const bound = bindInput(input);
  // Overlay tenant data (logo, name, hashtags, sponsors, photo) onto the bound
  // input before defaults are merged, so tenant values win over the samples.
  if (data) applyPackData(bound, data, input.kind);
  const values = { ...fieldDefaults(template), ...bound.values };
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
  html = selectSponsorVariant(html, sponsorsOn);
  html = expandRepeats(html, bound.rows, template);
  // Before slots resolve: an optional block whose image never arrived is removed
  // outright rather than rendering an empty framed placeholder.
  html = dropEmptyImageBlocks(html, bound.images);
  html = resolveSlots(html, bound.images, values, data?.photoTransform, photoFullBleed);
  // Drop the "presented by <sponsor>" line entirely when no presenting sponsor
  // resolved (empty value) — must run before substitution while the placeholder
  // is intact. A non-empty sample/tenant value keeps the line.
  if (!values["sponsorPresentedBy"]) html = dropEmptyPresentedBy(html);
  // Same treatment for a debut card that resolved no cap number: drop the line
  // rather than render a bare "CAP" label. Must also run before substitution.
  if (input.kind === "debut" && !values["capNumber"]) {
    html = dropEmptyCapNumber(html);
  }
  html = substituteFields(html, values);
  html = cleanupEmptyRoles(html);

  return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size, getPackManifest(packId).inkTint)}">${html}</div>`;
}

/** Wrap a rendered square card in a 1200×630 frame, scaled and centred. */
function letterboxLandscape(
  squareHtml: string,
  tokens: PackTokens,
  packId?: string | null,
): string {
  const frame = packNativeSize("landscape");
  const inner = packNativeSize("square");
  const scale = frame.h / inner.h;
  const left = Math.round((frame.w - inner.w * scale) / 2);
  const ink = stageInk(tokens, getPackManifest(packId).inkTint);
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
