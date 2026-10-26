/**
 * A look's Match Summary template (plan 2026-10-23, M2, M9, M11): the look's
 * Summary component drawn at square, portrait and landscape in both sentinel
 * palettes, captured, then mapped and merged by the pack converter's own
 * `convertKind`, exactly as a code-built pack is.
 */
import type { Page } from "puppeteer-core";
import type { TemplateDocumentV2, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import type { CaptureVariant } from "@workspace/scorecard/pack-capture";
import { convertKind, type KindConversion, type VariantCaptures } from "../pack-convert/convert";
import { captureMounted, mount, type CardFormat } from "./capture";
import type { MatchLook } from "./looks";
import { markFields, sentinelImage, sentinelRows, worstProps, type Palette } from "./sentinels";
import { renderComponent, type OvationMatch } from "./source";

export const FORMATS: CardFormat[] = ["square", "portrait", "landscape"];
const PALETTES: Palette[] = ["A", "B"];

const VARIANT: CaptureVariant = {
  id: "matchSummary.result",
  kind: "matchSummary",
  page: "result",
  design: "summary",
  slide: false,
  photo: true,
  sponsorsOn: true,
  junior: false,
  renders: [
    { content: "sentinel", palette: "A", detail: "full" },
    { content: "sentinel", palette: "B", detail: "full" },
  ],
};

/** The Summary's props for a capture: long real values in a palette, the photo slot behind. */
export function summaryProps(
  format: CardFormat,
  palette: Palette,
  look?: MatchLook,
): Record<string, unknown> {
  return {
    ...worstProps(palette),
    ...look?.props,
    format,
    background: sentinelImage("photo", "#3a5a40"),
  };
}

/**
 * Capture a look's Summary at every size in both palettes. It's drawn with
 * long real values, so it lays out as a real match does (a marker's length
 * would move a grid's columns), and each value is put back as its marker.
 */
export async function captureLook(
  page: Page,
  ds: OvationMatch,
  look: MatchLook,
): Promise<VariantCaptures> {
  const captures: VariantCaptures["captures"] = [];
  for (const format of FORMATS)
    for (const palette of PALETTES) {
      await mount(
        page,
        renderComponent(ds, look.component, summaryProps(format, palette, look)),
        format,
      );
      const capture = await captureMounted(page, {
        packId: look.slug,
        format,
        palette,
        rows: sentinelRows(look.rowStyle),
        mark: markFields,
      });
      captures.push({
        size: format,
        content: "sentinel",
        palette,
        detail: "full",
        render: null,
        capture,
      });
    }
  return { variant: VARIANT, captures };
}

/**
 * A look's template document: the captures converted, and the photo moved to
 * the back (the design's stage draws it first).
 */
export function convertLook(files: VariantCaptures, look?: MatchLook): KindConversion {
  const conv = convertKind([files], "matchSummary");
  if (!conv) throw new Error("the look drew no Match Summary page");
  // The title reads club v opposition (the club is the home side, M9), not batting order.
  const document = JSON.parse(
    JSON.stringify(conv.document).replace(
      /\{\{innings1\.short\}\}( v(?:s)? )\{\{innings2\.short\}\}/g,
      "{{club.short}}$1{{opposition.short}}",
    ),
  ) as TemplateDocumentV2;
  withinLimits(document.pages.result?.layers ?? []);
  for (const layer of document.pages.result?.layers ?? []) {
    const text = layer as { kind: string; content?: string };
    const swap = text.kind === "text" && text.content ? look?.text?.[text.content] : undefined;
    if (!swap) continue;
    text.content = swap;
    // The box spans the frame, centred where it was, and the text shrinks to fit it.
    for (const box of Object.values(layer.geometry)) {
      if (!box) continue;
      const centre = box.x + box.w / 2;
      box.w = 76;
      box.x = +(centre - 38).toFixed(2);
    }
    (layer as { fit?: object }).fit = { minScale: 0.5 };
  }
  const json = JSON.stringify(document);
  if (json.includes("var(--mt-")) document.palettes = [...(document.palettes ?? []), "match"];
  return { ...conv, document };
}

/** The format's limits on a style: a gradient's stops and each list of shadows. */
const MAX_STOPS = 8;
const MAX_SHADOWS = 4;

/**
 * Trim what the format can't hold: a gradient with more than eight stops
 * keeps eight spread along it (its first and last included), and a list of
 * more than four shadows its first four (Panel's chrome bevels).
 */
export function withinLimits(layers: TemplateLayerV2[]): void {
  for (const layer of layers) {
    const style = layer.style as Record<string, unknown> | undefined;
    if (style) {
      for (const key of ["fill", "textFill"]) {
        const g = style[key] as { stops?: unknown[] } | undefined;
        if (g && Array.isArray(g.stops) && g.stops.length > MAX_STOPS) {
          const n = g.stops.length;
          g.stops = Array.from(
            { length: MAX_STOPS },
            (_, i) => g.stops![Math.round((i * (n - 1)) / (MAX_STOPS - 1))],
          );
        }
      }
      for (const key of ["boxShadow", "textShadow", "dropShadow"]) {
        const list = style[key];
        if (Array.isArray(list) && list.length > MAX_SHADOWS)
          style[key] = list.slice(0, MAX_SHADOWS);
      }
    }
    if (layer.kind === "group") withinLimits(layer.children);
  }
}
