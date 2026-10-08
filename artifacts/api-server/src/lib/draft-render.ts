import {
  landscapeSummary,
  planCardSet,
  type CardSetOptions,
  type SetInput,
} from "@workspace/scorecard";
import type { SocialDraftRow } from "@workspace/db";
import { ensureSettings } from "./social-cards-helpers";
import { getTenantBrand } from "./tenant-brand";
import { loadActiveSponsors } from "./active-sponsors";
import { renderCardStill } from "./card-video-renderer";
import { resolveDraftPack } from "./draft-enrich";
import { readQueuedCarousel, queuedSlideAdjustments, carouselPackId } from "@workspace/scorecard/queued-carousel";

/**
 * Render a draft's slides at a size, exactly as the Studio preview shows them
 * (Social Studio R7, KTD9): the club's brand, sponsors, pack and colour mode,
 * the editor's adjustments, and a list card split into a balanced set. Shared
 * by the post pack (PNGs to share by hand) and Meta publishing (JPEGs Meta
 * fetches, plan 2026-10-06-001 U4).
 */

export type CardSize = "square" | "portrait" | "story" | "landscape";

type StillRenderer = (
  input: unknown,
  options: unknown,
  harnessOrigin?: string | null,
) => Promise<{ buffer: Buffer; contentType: string }>;

let renderer: StillRenderer = renderCardStill;

/** Test seam: CI has no Chromium, so tests swap the still renderer. */
export function setStillRenderer(fn: StillRenderer | null): void {
  renderer = fn ?? renderCardStill;
}

/** Whether a test has swapped the renderer (headless config checks skip then). */
export function stillRendererOverridden(): boolean {
  return renderer !== renderCardStill;
}

// Renders share one headless browser; run them one at a time so a post pack
// can't starve other renders or exhaust its memory.
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

const sponsorApplies = (cardKinds: string[] | null | undefined, kind: string) =>
  !cardKinds || cardKinds.length === 0 || cardKinds.includes(kind);

export type RenderedSlide = { size: CardSize; png: Buffer; page: number; of: number };

type Logger = Parameters<typeof loadActiveSponsors>[1];

/** The sizes the club has switched on, in a fixed order (square if none). */
export async function enabledSizes(tenantId: number): Promise<CardSize[]> {
  const settings = await ensureSettings(tenantId);
  const sizes: CardSize[] = [
    ...(settings.sizeSquare ? (["square"] as const) : []),
    ...(settings.sizePortrait ? (["portrait"] as const) : []),
    ...(settings.sizeStory ? (["story"] as const) : []),
    ...(settings.sizeLandscape ? (["landscape"] as const) : []),
  ];
  return sizes.length ? sizes : ["square"];
}

export async function renderDraftSlides(
  draft: SocialDraftRow,
  sizes: CardSize[],
  harnessOrigin: string | null,
  log: Logger,
): Promise<RenderedSlide[]> {
  const tenantId = draft.tenantId;
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  const carousel = readQueuedCarousel(input);
  if ("weekendCarousel" in input && !carousel) throw new Error("Invalid saved carousel; cannot render its slides.");
  if (carousel) {
    const rendered: RenderedSlide[] = [];
    for (const size of sizes) {
      for (const [i, slide] of carousel.slides.entries()) {
        const { buffer } = await serialised(() => renderer(slide.input, {
          size, packId: carouselPackId(carousel), data: slide.data, junior: slide.junior,
          sponsorsOn: slide.sponsorsOn, strictImages: true,
          adjustments: queuedSlideAdjustments(slide, size),
        }, harnessOrigin));
        rendered.push({ size, png: buffer, page: i + 1, of: carousel.slides.length });
      }
    }
    return rendered;
  }
  const kind = typeof input.kind === "string" ? input.kind : "card";
  const junior = draft.sourceMatchIsJunior || input.junior === true;
  const [settings, brand, sponsors, clubPack] = await Promise.all([
    ensureSettings(tenantId),
    getTenantBrand(tenantId),
    loadActiveSponsors(tenantId, log),
    // The pack the club has set for this card type: the Studio preview and
    // editor fall back to it when the draft carries no pack of its own, so
    // the post pack must too (not the renderer's default pack).
    draft.packId ? Promise.resolve(null) : resolveDraftPack(tenantId, kind),
  ]);
  const packId = draft.packId ?? clubPack;
  // "Pack's own look" choices, as the Studio preview passes them; any other
  // pack renders in club colours.
  const modes = Object.fromEntries(
    Object.entries((settings.packColourModes ?? {}) as Record<string, string>).filter(
      ([, mode]) => mode === "pack",
    ),
  );

  const sponsorsOn = settings.sponsorsEnabled;
  const shortName = brand.shortName;
  // The same tenant payload the Studio preview passes (lib/pack-card-data.ts):
  // without it the pack's sample literals would render instead of the club.
  const data = {
    brand: {
      name: brand.name,
      tagline: brand.tagline ?? null,
      logoUrl: brand.logoUrl ?? null,
      primaryColour: brand.primaryColour ?? null,
      backgroundColour: brand.backgroundColour ?? null,
      juniorsColour: brand.juniorsColour ?? null,
    },
    hashtag: settings.clubHashtag || (shortName ? `#${shortName.replace(/\s+/g, "")}` : ""),
    sponsors: sponsorsOn
      ? sponsors
          .filter((s) => sponsorApplies(s.cardKinds, kind))
          // The presenting (headline) sponsor's logo leads the strip.
          .sort((a, b) => Number(!!b.isPresenting) - Number(!!a.isPresenting))
          .map((s) => ({ name: s.name, logoUrl: s.logoUrl }))
      : [],
    presentingSponsorName: sponsorsOn ? (sponsors.find((s) => s.isPresenting)?.name ?? null) : null,
    // Junior cards never carry a photo (KTD15).
    photoUrl: junior ? null : draft.photoUrl,
    photoPlacement: "contained",
    ...(Object.keys(modes).length ? { packColourModes: modes } : {}),
  };

  // A list card that outgrows one card posts as a balanced set (cover +
  // detail slides); every other card is a single slide. Landscape stays a
  // single summary card.
  const rootAdj = (draft.adjustments ?? null) as {
    set?: CardSetOptions;
    slides?: Record<string, unknown>;
  } | null;
  const setOptions = (rootAdj?.set ?? {}) as CardSetOptions;
  // The editor's edits: the card's own for a single card (and the landscape
  // summary), each slide's own for a set.
  const adjustmentsFor = (key: string) =>
    key === "single" ? rootAdj : (rootAdj?.slides?.[key] ?? null);

  const rendered: RenderedSlide[] = [];
  for (const size of sizes) {
    const slides =
      size === "landscape"
        ? [
            {
              key: "single",
              input: landscapeSummary(input as SetInput, setOptions),
              page: 1,
              of: 1,
            },
          ]
        : planCardSet(input as SetInput, setOptions);
    for (const slide of slides) {
      const slideJunior = junior || (slide.input as SetInput).junior === true;
      const slideData = slideJunior ? { ...data, photoUrl: null } : data;
      const { buffer } = await serialised(() =>
        renderer(
          slide.input,
          {
            size,
            sponsorsOn,
            junior: slideJunior,
            theme: null,
            data: slideData,
            packId,
            adjustments: adjustmentsFor(slide.key),
          },
          harnessOrigin,
        ),
      );
      rendered.push({ size, png: buffer, page: slide.page, of: slide.of });
    }
  }
  return rendered;
}
