import {
  landscapeSummary,
  planCardSet,
  type CardSetOptions,
  type SetInput,
} from "@workspace/scorecard";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, socialDraftsTable, type SocialDraftRow } from "@workspace/db";
import {
  expandSetSlides,
  isSetDocument,
  mapCarouselSlides,
  planTemplateSlides,
  setPageRenderDocument,
  type DraftLayoutWarnings,
  type LayerDocument,
  type LayoutWarning,
} from "@workspace/scorecard/kind-templates";
import { env } from "../config";
import { ensureSettings } from "./social-cards-helpers";
import { getTenantBrand } from "./tenant-brand";
import { cardSponsors } from "@workspace/scorecard/card-sponsors";
import { loadActiveSponsors } from "./active-sponsors";
import { renderCardStill } from "./card-video-renderer";
import { isAutoPhoto, resolveDraftPack } from "./draft-enrich";
import { loadCardNames } from "./card-content/names";
import {
  readQueuedCarousel,
  resolveActivePackId,
  queuedSlideAdjustments,
  carouselPackId,
  carouselSlideData,
} from "@workspace/scorecard/queued-carousel";

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
) => Promise<{ buffer: Buffer; contentType: string; warnings?: LayoutWarning[] }>;

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
// can't starve other renders or exhaust its memory. Two lanes: card renders
// (posts, packs, layout checks) always go before template fit checks (L2-B),
// so a fit check never delays a post.
type QueuedJob = { run: () => Promise<unknown>; settle: (p: Promise<unknown>) => void };
const renderLane: QueuedJob[] = [];
const fitLane: QueuedJob[] = [];
let rendering = false;

function pump(): void {
  if (rendering) return;
  const job = renderLane.shift() ?? fitLane.shift();
  if (!job) return;
  rendering = true;
  const done = Promise.resolve().then(job.run);
  job.settle(done);
  void done
    .catch(() => undefined)
    .finally(() => {
      rendering = false;
      pump();
    });
}

function enqueue<T>(lane: QueuedJob[], job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    lane.push({ run: job, settle: (p) => (p as Promise<T>).then(resolve, reject) });
    pump();
  });
}

function serialised<T>(job: () => Promise<T>): Promise<T> {
  return enqueue(renderLane, job);
}

/** A card render on the shared browser, ahead of any waiting fit check (exported for tests). */
export const serialisedRender = serialised;

/** A template fit check on the shared browser, after every waiting card render (L2-B). */
export function serialisedFitCheck<T>(job: () => Promise<T>): Promise<T> {
  return enqueue(fitLane, job);
}

export type RenderedSlide = {
  size: CardSize;
  png: Buffer;
  page: number;
  of: number;
  /** Layout warnings from this render (card kind templates, KTD9/KTD13). */
  warnings: LayoutWarning[];
};

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
  if ("weekendCarousel" in input && !carousel)
    throw new Error("Invalid saved carousel; cannot render its slides.");
  if (carousel) {
    const rendered: RenderedSlide[] = [];
    // Drawn with a set design (carousel set editor plan): each slide by its page.
    const set =
      carousel.version === 3 && isSetDocument(draft.adjustments) ? draft.adjustments : null;
    if (set) {
      const mapped = mapCarouselSlides(set, carousel.slides);
      const byId = new Map(carousel.slides.map((s) => [s.id, s]));
      for (const size of sizes) {
        for (const [i, slide] of mapped.slides.entries()) {
          const stored = byId.get(slide.key)!;
          const { buffer, warnings = [] } = await serialised(() =>
            renderer(
              slide.input,
              {
                size,
                packId: carouselPackId(carousel),
                data: carouselSlideData(carousel, stored),
                junior: stored.junior,
                sponsorsOn: stored.sponsorsOn,
                strictImages: true,
                adjustments: setPageRenderDocument(set, slide.page),
              },
              harnessOrigin,
            ),
          );
          rendered.push({ size, png: buffer, page: i + 1, of: mapped.slides.length, warnings });
        }
      }
      return rendered;
    }
    for (const size of sizes) {
      for (const [i, slide] of carousel.slides.entries()) {
        const { buffer, warnings = [] } = await serialised(() =>
          renderer(
            slide.input,
            {
              size,
              packId: carouselPackId(carousel),
              data: slide.data,
              junior: slide.junior,
              sponsorsOn: slide.sponsorsOn,
              strictImages: true,
              // A templated (version 3) set draws every slide from its one
              // assembled document; each slide picks its page from its input.
              adjustments:
                carousel.version === 3
                  ? (draft.adjustments ?? null)
                  : queuedSlideAdjustments(slide, size),
            },
            harnessOrigin,
          ),
        );
        rendered.push({ size, png: buffer, page: i + 1, of: carousel.slides.length, warnings });
      }
    }
    return rendered;
  }
  const kind = typeof input.kind === "string" ? input.kind : "card";
  const junior = draft.sourceMatchIsJunior || input.junior === true;
  const [settings, brand, sponsors, clubPack, names] = await Promise.all([
    ensureSettings(tenantId),
    getTenantBrand(tenantId),
    loadActiveSponsors(tenantId, log),
    // The pack the club has set for this card type: the Studio preview and
    // editor fall back to it when the draft carries no pack of its own, so
    // the post pack must too (not the renderer's default pack).
    draft.packId || draft.templateVersion !== null
      ? Promise.resolve(null)
      : resolveDraftPack(tenantId, kind),
    // The club's short names and crests, as the Studio preview has them (ADR-010 P1).
    loadCardNames(tenantId, {
      onCentralError: (err) => log.warn({ err }, "card names: central read failed"),
    }),
  ]);
  // A card kind template draft renders its own document on the blank base
  // (ADR-001); a pack draft renders its pack.
  const templated = draft.templateVersion !== null;
  // A hidden legacy pack (P9) on a saved draft renders as Club Kit.
  const packId = templated ? "blank" : resolveActivePackId(draft.packId ?? clubPack);
  // "Pack's own look" choices, as the Studio preview passes them; any other
  // pack renders in club colours.
  const modes = Object.fromEntries(
    Object.entries((settings.packColourModes ?? {}) as Record<string, string>).filter(
      ([, mode]) => mode === "pack",
    ),
  );

  const sponsorsOn = settings.sponsorsEnabled;
  // The same rule the Studio preview uses: a team list's own sponsor, and on a
  // card about one player that player's sponsors (player sponsors).
  const strip = cardSponsors(sponsors, {
    kind,
    grade: typeof input.grade === "string" ? input.grade : null,
    playerId: junior ? null : draft.subjectPlayerId,
  });
  const shortName = brand.shortName;
  // The same tenant payload the Studio preview passes (lib/pack-card-data.ts):
  // without it the pack's sample literals would render instead of the club.
  const data = {
    brand: {
      name: brand.name,
      tagline: brand.tagline ?? null,
      logoUrl: brand.logoUrl ?? null,
      // The club's ground photo, behind card designs ({{groundPhoto}}).
      ...(brand.heroImages?.cards ? { groundPhotoUrl: brand.heroImages.cards } : {}),
      primaryColour: brand.primaryColour ?? null,
      backgroundColour: brand.backgroundColour ?? null,
      juniorsColour: brand.juniorsColour ?? null,
    },
    hashtag: settings.clubHashtag || (shortName ? `#${shortName.replace(/\s+/g, "")}` : ""),
    sponsors: sponsorsOn ? strip.sponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl })) : [],
    presentingSponsorName: sponsorsOn ? strip.presentingName : null,
    // The player's own sponsors → the `{{playerSponsor…}}` template fields.
    ...(sponsorsOn && strip.playerSponsors.length
      ? {
          playerSponsors: strip.playerSponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl })),
        }
      : {}),
    // A junior card shows a photo only behind the engines' positive marker: a junior
    // player's own photo the family allows (ADR-007). Nothing else reaches it.
    photoUrl: junior && input.juniorPhotoAllowed !== true ? null : draft.photoUrl,
    // The photo's focus box (photo focus areas): frames crop to it.
    ...(draft.photoFocus ? { photoFocus: draft.photoFocus } : {}),
    // Sourced photo layers' own photos (photo layer sources): senior cards
    // only, and only while the draft's photo is automatic (an admin's pick
    // shows on every photo layer).
    ...(!junior && draft.layerPhotos && isAutoPhoto(draft.photoSource)
      ? { layerPhotos: draft.layerPhotos }
      : {}),
    photoPlacement: "contained",
    ...(Object.keys(modes).length ? { packColourModes: modes } : {}),
    ...(Object.keys(names).length ? { names } : {}),
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
  // A templated carousel is one document on every slide (KTD6).
  const adjustmentsFor = (key: string) =>
    templated || key === "single" ? rootAdj : (rootAdj?.slides?.[key] ?? null);

  const rendered: RenderedSlide[] = [];
  // A list drawn with a set design (Round Team Lists, carousel set editor plan):
  // its cover and a slide per team on the set's pages, in the design's order.
  const set = templated && isSetDocument(draft.adjustments) ? draft.adjustments : null;
  if (set) {
    const items = planCardSet(input as SetInput, { ...setOptions, cover: true }).map((s) => ({
      key: s.key,
      slot: s.role === "detail" || s.role === "single" ? ("team" as const) : ("cover" as const),
      input: s.input as Record<string, unknown>,
    }));
    const slides = expandSetSlides(set, items, { sponsors: data.sponsors, junior });
    for (const size of sizes) {
      for (const [i, slide] of slides.entries()) {
        const slideJunior = junior || slide.input.junior === true;
        const slideAllowed = slide.input.juniorPhotoAllowed === true;
        const slideData = slideJunior && !slideAllowed ? { ...data, photoUrl: null } : data;
        const { buffer, warnings } = await serialised(() =>
          renderer(
            slide.input,
            {
              size,
              sponsorsOn,
              junior: slideJunior,
              theme: null,
              data: slideData,
              packId,
              adjustments: setPageRenderDocument(set, slide.page),
            },
            harnessOrigin,
          ),
        );
        rendered.push({
          size,
          png: buffer,
          page: i + 1,
          of: slides.length,
          warnings: warnings ?? [],
        });
      }
    }
    return rendered;
  }
  for (const size of sizes) {
    // A templated list spills by its rows layer's capacity (KTD13).
    const templatePlan = templated
      ? planTemplateSlides(input, (rootAdj ?? {}) as LayerDocument, size)
      : null;
    const sizeWarnings: LayoutWarning[] = templatePlan?.warning ? [templatePlan.warning] : [];
    const slides = templatePlan
      ? templatePlan.slides
      : size === "landscape"
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
      const slideAllowed =
        (slide.input as { juniorPhotoAllowed?: boolean }).juniorPhotoAllowed === true;
      const slideData = slideJunior && !slideAllowed ? { ...data, photoUrl: null } : data;
      const { buffer, warnings } = await serialised(() =>
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
      rendered.push({
        size,
        png: buffer,
        page: slide.page,
        of: slide.of,
        // The size-level warning (too many slides) rides on the first slide.
        warnings: [...(slide.page === 1 ? sizeWarnings : []), ...(warnings ?? [])],
      });
    }
  }
  return rendered;
}

/** Layout warnings per size from rendered slides (every size in `sizes` gets an entry). */
export function layoutWarningsFrom(
  slides: RenderedSlide[],
  sizes: CardSize[],
): DraftLayoutWarnings {
  const out: DraftLayoutWarnings = {};
  for (const size of sizes)
    out[size] = slides.filter((s) => s.size === size).flatMap((s) => s.warnings);
  return out;
}

/** Whether headless renders can run here (a test renderer, or a configured harness). */
export function canRenderHeadless(): boolean {
  return stillRendererOverridden() || !!env.RENDER_HARNESS_URL() || !!env.RENDER_HARNESS_ORIGIN();
}

/** What one layout check found, and how many images it rendered. */
export type LayoutCheck = { warnings: DraftLayoutWarnings; renders: number; stored: boolean };

/**
 * Render a templated draft at every enabled size and store its layout
 * warnings (KTD10). A full check replaces the stored warnings, so a size the
 * club has since turned off can't keep the draft blocked. The result is only
 * stored if the draft is unchanged since it was read — an apply, edit or data
 * refresh during the render leaves it pending for the next sweep, so a stale
 * clean result can never clear a design nobody checked.
 */
export async function checkDraftLayout(draft: SocialDraftRow, log: Logger): Promise<LayoutCheck> {
  const sizes = await enabledSizes(draft.tenantId);
  const slides = await renderDraftSlides(draft, sizes, null, log);
  const warnings = layoutWarningsFrom(slides, sizes);
  const updated = await db
    .update(socialDraftsTable)
    .set({ layoutWarnings: warnings, layoutCheckPending: false })
    .where(
      and(
        eq(socialDraftsTable.id, draft.id),
        eq(socialDraftsTable.layoutCheckPending, true),
        draft.templateVersion === null
          ? isNull(socialDraftsTable.templateVersion)
          : eq(socialDraftsTable.templateVersion, draft.templateVersion),
        sql`${socialDraftsTable.adjustments} is not distinct from ${JSON.stringify(draft.adjustments ?? null)}::jsonb`,
        sql`${socialDraftsTable.cardInput} is not distinct from ${JSON.stringify(draft.cardInput ?? null)}::jsonb`,
      ),
    )
    .returning({ id: socialDraftsTable.id });
  return { warnings, renders: slides.length, stored: updated.length > 0 };
}

/** How many layout checks one sweep runs per club, so a backlog can't stall it. */
export const LAYOUT_CHECKS_PER_SWEEP = 20;

/**
 * How many images one club's layout checks may render per sweep. Renders
 * share one headless browser across clubs, so this — not the draft count —
 * keeps one club's long lists or repeated applies from delaying everyone.
 */
export const LAYOUT_RENDERS_PER_SWEEP = 60;

/**
 * Run the layout checks templated drafts still owe, oldest first (ADR-003).
 * A draft whose check fails stays pending — and so stays out of automation —
 * until a later sweep succeeds. Without a render harness nothing runs and the
 * drafts stay pending (fail closed). Returns how many were checked.
 */
export async function runPendingLayoutChecks(
  tenantId: number,
  log: Logger,
  limit = LAYOUT_CHECKS_PER_SWEEP,
  renderBudget = LAYOUT_RENDERS_PER_SWEEP,
): Promise<number> {
  const pending = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.layoutCheckPending, true),
        inArray(socialDraftsTable.status, ["awaiting_review", "ready"]),
      ),
    )
    .orderBy(asc(socialDraftsTable.createdAt))
    .limit(limit);
  if (pending.length === 0) return 0;
  if (!canRenderHeadless()) {
    log.warn(
      { tenantId, pending: pending.length },
      "layout checks skipped: no render harness configured",
    );
    return 0;
  }
  let checked = 0;
  let renders = 0;
  for (const draft of pending) {
    if (renders >= renderBudget) break;
    try {
      const result = await checkDraftLayout(draft, log);
      renders += result.renders;
      if (result.stored) checked += 1;
    } catch (err) {
      log.warn(
        { err, tenantId, draftId: draft.id },
        "layout check failed; draft stays out of automation",
      );
    }
  }
  return checked;
}
