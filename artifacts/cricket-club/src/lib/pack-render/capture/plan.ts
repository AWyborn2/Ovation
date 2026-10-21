/**
 * The capture plan (ADR-011 §5, task T4.3): every template page a pack draws,
 * with the branches it renders, and the input each capture renders. Built
 * from the pack's own registration, so a design added to a pack is captured
 * without touching the converter. Hidden packs are planned by their real id:
 * the capture renders them as themselves, never as Club Kit (P9). Dev and CI
 * builds only (see `./index.ts`).
 */

import {
  CONTENT_PRESETS,
  type ContentKind,
  type ContentPreset,
} from "@workspace/scorecard/card-content";
import { isCarouselPackId } from "@workspace/scorecard/queued-carousel";
import {
  fieldMarker,
  type CaptureContent,
  type CaptureDetail,
  type CaptureRender,
  type CaptureSize,
  type CaptureVariant,
  type ColourMode,
  type SentinelPaletteId,
} from "@workspace/scorecard/pack-capture";
import { isSetKind, planCardSet } from "../../card-sets/plan";
import { getPackManifest } from "../../pack-templates/registry";
import { dayCapacity } from "../../pack-templates/content-layouts";
import type { ShareCardInput } from "../../share-card";
import { packFieldValues, renderPackCard, resolveCardTokens } from "../render";
import { resolveTemplate } from "../templates";
import type { PackCardData, PackTokens } from "../types";
import { worstCaseCard, type PageKey } from "@workspace/scorecard/kind-templates";
import {
  SENTINEL_ROWS,
  contentPageInput,
  pageContent,
  paletteBrand,
  revoicedSample,
  sentinelData,
  sentinelImage,
  sentinelTexts,
} from "./sentinels";

/** The kinds a carousel set and its single card are built from (ADR-010). */
const CONTENT_KIND_PAGES: Record<ContentKind, ReadonlyArray<{ page: string; slide: boolean }>> = {
  matchDay: [
    { page: "fixture", slide: false },
    { page: "fixture", slide: true },
    { page: "title", slide: true },
    { page: "day", slide: true },
    { page: "sponsors", slide: true },
  ],
  // The Results set uses the Match Summary template; its single card is a match summary.
  results: [
    { page: "result", slide: true },
    { page: "day", slide: true },
  ],
  matchSummary: [
    { page: "result", slide: false },
    { page: "result", slide: true },
    { page: "day", slide: true },
  ],
  teamList: [
    { page: "team", slide: false },
    { page: "team", slide: true },
  ],
};

const isContentKind = (kind: string): kind is ContentKind =>
  Object.prototype.hasOwnProperty.call(CONTENT_KIND_PAGES, kind);

/** A template page before its presets and branches are expanded. */
interface PageSpec {
  kind: string;
  page: string;
  design: string;
  slide: boolean;
  role?: string;
  /** The design is one of several for its kind and is asked for by name. */
  named: boolean;
  presets: ReadonlyArray<ContentPreset | undefined>;
  junior: boolean;
}

const FULL_RENDER = { content: "sentinel", palette: "A", detail: "full" } as const;
const COLOUR_RENDER = { content: "sentinel", palette: "B", detail: "colours" } as const;
const BOX_RENDER = { content: "worst", palette: "A", detail: "boxes" } as const;

function slug(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function pageSpecs(packId: string): PageSpec[] {
  const manifest = getPackManifest(packId);
  const specs: PageSpec[] = [];
  const byKind = new Map<string, number>();
  for (const d of manifest.designs) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);

  for (const d of manifest.designs) {
    const several = (byKind.get(d.kind) ?? 0) > 1;
    const role = d.categoryPreset ?? d.role;
    if (isContentKind(d.kind)) {
      // The single card of a content kind; its carousel pages follow below.
      const single = CONTENT_KIND_PAGES[d.kind].find((p) => !p.slide);
      if (!single || d.role === "cover") continue;
      specs.push({
        kind: d.kind,
        page: single.page,
        design: d.designKey,
        slide: false,
        named: several,
        presets: d.kind === "matchDay" ? [undefined] : CONTENT_PRESETS,
        junior: false,
      });
      continue;
    }
    specs.push({
      kind: d.kind,
      page: "card",
      design: d.designKey,
      slide: false,
      ...(role ? { role } : {}),
      named: several && !role,
      presets: [undefined],
      junior: false,
    });
  }

  if (isCarouselPackId(packId)) {
    for (const kind of Object.keys(CONTENT_KIND_PAGES) as ContentKind[]) {
      for (const { page, slide } of CONTENT_KIND_PAGES[kind]) {
        if (!slide) continue;
        specs.push({
          kind,
          page,
          design: `carousel-${page}`,
          slide: true,
          named: false,
          presets: CONTENT_PRESETS,
          junior: page === "day",
        });
      }
    }
  }
  return specs;
}

function variantId(
  spec: PageSpec,
  preset: ContentPreset | undefined,
  photo: boolean,
  sponsorsOn: boolean,
) {
  return [
    spec.kind,
    spec.page,
    ...(spec.slide ? ["slide"] : []),
    ...(spec.role ? [slug(spec.role)] : []),
    ...(spec.named ? [slug(spec.design)] : []),
    ...(preset ? [preset] : []),
    ...(photo ? [] : ["no-photo"]),
    ...(sponsorsOn ? [] : ["no-sponsors"]),
  ].join(".");
}

type SpecFields = Pick<
  CaptureVariant,
  | "kind"
  | "page"
  | "design"
  | "named"
  | "slide"
  | "role"
  | "preset"
  | "photo"
  | "sponsorsOn"
  | "junior"
>;

/** The sentinel input for a page spec, before tenant data. */
function sentinelInput(packId: string, spec: SpecFields): Record<string, unknown> {
  const texts = sentinelTexts();
  if (isContentKind(spec.kind)) {
    const page = pageContent(spec.kind, spec.page, texts, SENTINEL_ROWS);
    const input = contentPageInput(page, spec.preset, { slide: spec.slide, photo: spec.photo });
    return spec.named ? { ...input, design: spec.design } : input;
  }
  const sample = revoicedSample(spec.kind as ShareCardInput["kind"], texts, { photo: spec.photo });
  return firstPlannedSlide(withRole(sample, spec), spec.role === "cover");
}

/** The most rows each of a design's repeats lays out at a size: worst case fills them. */
function worstRows(packId: string, spec: SpecFields, size: CaptureSize): Record<string, number> {
  if (isContentKind(spec.kind))
    return {
      dayRows: dayCapacity(packId, spec.kind, size, spec.preset ?? "full"),
      sponsors: 12,
      players: 12,
    };
  const probe = revoicedSample(spec.kind as ShareCardInput["kind"], sentinelTexts(), {
    photo: spec.photo,
  });
  const template = resolveTemplate(withRole(probe, spec) as unknown as ShareCardInput, packId);
  return Object.fromEntries((template?.repeats ?? []).map((r) => [r.key, r.maxRows]));
}

/**
 * The worst-case render for a page spec: the fit check's content
 * (`worstCaseCard`), rows at the pack layout's capacity, in a sentinel palette.
 */
function worstRender(
  packId: string,
  spec: SpecFields,
  size: CaptureSize,
  palette: SentinelPaletteId,
  colourMode: ColourMode,
): { input: Record<string, unknown>; data: PackCardData } {
  const card = worstCaseCard(
    spec.kind,
    {
      page: spec.page as PageKey,
      contentKind: spec.kind,
      ...(spec.preset ? { preset: spec.preset } : {}),
      photo: spec.photo,
      sponsors: spec.sponsorsOn ? "max" : "none",
      junior: spec.junior,
    },
    { rows: worstRows(packId, spec, size), image: (name) => sentinelImage(`worst.${name}`) },
  );
  // A single card is not a carousel slide.
  const { carouselContent: _slide, ...single } = card.input;
  let input = spec.slide ? card.input : single;
  if (isContentKind(spec.kind)) input = spec.named ? { ...input, design: spec.design } : input;
  else input = firstPlannedSlide(withRole(input, spec), spec.role === "cover");
  return {
    input,
    data: {
      ...card.data,
      brand: { ...card.data.brand, ...paletteBrand(palette) },
      packColourModes: { [packId]: colourMode },
    },
  };
}

function withRole(
  input: Record<string, unknown>,
  spec: { role?: string; named?: boolean; design: string },
): Record<string, unknown> {
  if (spec.role === "cover") return { ...input, setRole: "cover" };
  if (spec.role) return { ...input, category: spec.role };
  return spec.named ? { ...input, design: spec.design } : input;
}

/**
 * A set kind renders its planned slides: the cover for a cover design, else
 * the first everyday slide (what the renderer draws for an unplanned input).
 */
function firstPlannedSlide(input: Record<string, unknown>, cover: boolean) {
  if (!isSetKind(String(input.kind))) return input;
  const slides = planCardSet(input as unknown as ShareCardInput);
  const pick = cover
    ? slides.find((s) => s.role === "cover")
    : slides.find((s) => s.role !== "cover");
  return (pick?.input as unknown as Record<string, unknown>) ?? input;
}

/**
 * Every variant a pack captures. A design with a photo slot gets a no-photo
 * branch, one with both sponsor blocks a no-sponsors branch, each at the
 * standard preset (or none): enough to tell a `showWhen` from a layout.
 */
export function captureVariants(packId: string): CaptureVariant[] {
  if (getPackManifest(packId).packId !== packId) throw new Error(`Unknown pack: ${packId}`);
  const out: CaptureVariant[] = [];
  for (const spec of pageSpecs(packId)) {
    const base = { ...spec, preset: undefined, photo: true };
    const html = (photo: boolean, sponsorsOn: boolean) =>
      htmlFor(packId, { ...base, photo, sponsorsOn });
    const withPhoto = html(true, true);
    if (!withPhoto) continue;
    const photoBranch = html(false, true) !== withPhoto;
    const sponsorBranch = html(true, false) !== withPhoto;
    for (const preset of spec.presets) {
      const variant = (photo: boolean, sponsorsOn: boolean, renders: CaptureVariant["renders"]) =>
        out.push({
          id: variantId(spec, preset, photo, sponsorsOn),
          kind: spec.kind,
          page: spec.page,
          design: spec.design,
          ...(spec.named ? { named: true } : {}),
          slide: spec.slide,
          ...(spec.role ? { role: spec.role } : {}),
          ...(preset ? { preset } : {}),
          photo,
          sponsorsOn,
          junior: spec.junior,
          renders,
        });
      const defaultPreset = preset === undefined || preset === "standard";
      variant(true, true, [
        FULL_RENDER,
        ...(defaultPreset ? [COLOUR_RENDER] : []),
        ...(preset === undefined || preset === "full" ? [BOX_RENDER] : []),
      ]);
      if (!defaultPreset) continue;
      if (photoBranch) variant(false, true, [FULL_RENDER]);
      if (sponsorBranch) variant(true, false, [FULL_RENDER]);
    }
  }
  return out;
}

function htmlFor(
  packId: string,
  spec: PageSpec & { preset: undefined; photo: boolean; sponsorsOn: boolean },
): string {
  const render = buildRender(packId, spec, "sentinel", "A", "full", "story", "club");
  return renderWith(packId, render, "story");
}

/** Bound layout switches that sit inside style attributes: never replaced by a marker. */
const LAYOUT_ONLY_FIELD = /^rowScale$|(?:^|\.)logoDisplay$/;

/** The slide the renderer draws for an unplanned set input (its first). */
function firstSlideOf(input: ShareCardInput): ShareCardInput {
  if (!isSetKind(input.kind)) return input;
  const planned = input as { density?: unknown; setRole?: unknown; setPage?: unknown };
  if (planned.density || planned.setRole || planned.setPage) return input;
  return planCardSet(input)[0]?.input ?? input;
}

/** A capture's card before it is mounted: its html, and what its fields showed. */
export interface PreparedCard {
  input: ShareCardInput;
  data: PackCardData;
  junior: boolean;
  tokens: PackTokens;
  html: string;
  /** Each text field's bound value, before markers. */
  fields: Record<string, string>;
  /** The marker each non-empty field showed instead (sentinel content). */
  markers: Record<string, string>;
}

/**
 * Render a capture's input to card html (no DOM). Sentinel content shows
 * every non-empty text field as its marker, through the editor's field
 * overrides: emptiness decides the same blocks as a real render, so a field
 * the preset hides still drops out.
 */
export function prepareCard(
  packId: string,
  render: CaptureRender,
  size: CaptureSize,
): PreparedCard {
  const data = render.data as PackCardData;
  const input = firstSlideOf(render.input as unknown as ShareCardInput);
  const junior = render.junior || input.kind === "juniorHighlights";
  const fields = packFieldValues(input, data, packId);
  const markers: Record<string, string> = {};
  if (render.markFields)
    for (const [key, value] of Object.entries(fields))
      if (value.trim() && !LAYOUT_ONLY_FIELD.test(key)) markers[key] = fieldMarker(key);
  const tokens = resolveCardTokens({ theme: null, junior, data, packId });
  const html = renderPackCard(
    input,
    size,
    render.sponsorsOn,
    tokens,
    junior,
    data,
    packId,
    Object.keys(markers).length ? { fields: markers } : null,
  );
  return { input, data, junior, tokens, html, fields, markers };
}

/** A capture's card html (no DOM): the plan's branch probe. */
export function renderWith(packId: string, render: CaptureRender, size: CaptureSize): string {
  return prepareCard(packId, render, size).html;
}

function buildRender(
  packId: string,
  spec: SpecFields,
  content: CaptureContent,
  palette: SentinelPaletteId,
  detail: CaptureDetail,
  size: CaptureSize,
  colourMode: ColourMode,
): CaptureRender {
  const worst = content === "worst" ? worstRender(packId, spec, size, palette, colourMode) : null;
  return {
    input: worst?.input ?? sentinelInput(packId, spec),
    data: (worst?.data ??
      sentinelData(packId, { palette, photo: spec.photo, colourMode })) as Record<string, unknown>,
    sponsorsOn: spec.sponsorsOn,
    junior: spec.junior,
    markFields: content === "sentinel",
    detail,
  };
}

/** What `capture` renders for one of a variant's renders at one size. */
export function captureRender(
  packId: string,
  variant: CaptureVariant,
  render: CaptureVariant["renders"][number],
  size: CaptureSize,
  colourMode: ColourMode = "club",
): CaptureRender {
  return buildRender(
    packId,
    variant,
    render.content,
    render.palette,
    render.detail,
    size,
    colourMode,
  );
}
