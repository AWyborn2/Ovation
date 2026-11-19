import { juniorSafeCarousel, juniorSafeDesign } from "./junior-stock-photos";
import { loadWithheldJuniorNames, redactDraftRow } from "./junior-name-redaction";
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
  isDocumentV2,
  isSetDocument,
  mapCarouselSlides,
  normaliseDocument,
  pageForInput,
  planTemplateSlides,
  setPageRenderDocument,
  sizesWithLayers,
  TEMPLATE_SIZE_ORDER,
  type DraftLayoutWarnings,
  type LayerDocument,
  type LayoutWarning,
  type PageKey,
} from "@workspace/scorecard/kind-templates";
import { env } from "../config";
import { ensureSettings } from "./social-cards-helpers";
import { getTenantBrand } from "./tenant-brand";
import { cardSponsors } from "@workspace/scorecard/card-sponsors";
import { loadActiveSponsors } from "./active-sponsors";
import {
  BACKGROUND_BOOT_TIMEOUT_MS,
  renderCardStill,
  type StillLimits,
} from "./card-video-renderer";
import { LAYOUT_CHECK_MAX_ATTEMPTS, layoutCheckErrorText } from "./layout-check-state";
import { isAutoPhoto, resolveDraftPack } from "./draft-enrich";
import { loadCardNames } from "./card-content/names";
import {
  readQueuedCarousel,
  resolveActivePackId,
  queuedSlideAdjustments,
  carouselPackId,
  carouselSlideData,
  carouselTemplateKind,
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
  limits?: StillLimits,
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

/** A club's size switches (its social settings row, or the part of it sizes need). */
export type SizeSwitches = {
  sizeSquare: boolean;
  sizePortrait: boolean;
  sizeStory: boolean;
  sizeLandscape: boolean;
};

/** The sizes a club's switches turn on, in a fixed order (square if none). */
export function clubSizes(settings: SizeSwitches): CardSize[] {
  const sizes: CardSize[] = [
    ...(settings.sizeSquare ? (["square"] as const) : []),
    ...(settings.sizePortrait ? (["portrait"] as const) : []),
    ...(settings.sizeStory ? (["story"] as const) : []),
    ...(settings.sizeLandscape ? (["landscape"] as const) : []),
  ];
  return sizes.length ? sizes : ["square"];
}

/** The sizes the club has switched on, in a fixed order (square if none). */
export async function enabledSizes(tenantId: number): Promise<CardSize[]> {
  return clubSizes(await ensureSettings(tenantId));
}

/** What `draftSizes` reads from a draft. */
export type DraftDesign = Pick<SocialDraftRow, "cardInput" | "adjustments" | "templateVersion">;

/** The sizes every one of `pages` that has layers puts a layer on (none when no page has any). */
function pagesCoverage(pages: readonly LayerDocument[]): CardSize[] {
  const drawn = pages.filter((p) => Array.isArray(p.layers) && p.layers.length > 0);
  if (drawn.length === 0) return [];
  return TEMPLATE_SIZE_ORDER.filter((size) =>
    drawn.every((p) => sizesWithLayers(p).includes(size)),
  );
}

/**
 * The sizes a layer document covers: a flat (v1) document is one page; a
 * page-based (v2) one is read for the pages `inputs` draw, chosen as the
 * renderer chooses them.
 */
function layerDocumentCoverage(
  doc: unknown,
  kind: string,
  inputs: readonly Record<string, unknown>[],
): CardSize[] {
  const normalised = normaliseDocument(doc, kind);
  if (!isDocumentV2(doc)) return pagesCoverage(Object.values(normalised.pages).filter((p) => !!p));
  const pages = new Set<PageKey>(
    inputs.map((input) =>
      pageForInput({ ...input, kind: typeof input.kind === "string" ? input.kind : kind }),
    ),
  );
  return pagesCoverage([...pages].map((page) => normalised.pages[page] ?? { layers: [] }));
}

/**
 * The sizes a draft's design draws (portrait and story sizes plan, Stage 1),
 * read from its document, never guessed: a templated card's layer document
 * (for the page it draws), a set design's pages (every page with layers, as
 * the library's coverage reads them), a templated carousel's pages for its
 * slides. A pack-based draft or carousel (before the template library)
 * covers all four, and so does a document no size can be read from: it
 * renders as it does today.
 */
export function designSizes(draft: DraftDesign): CardSize[] {
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  const kind = typeof input.kind === "string" ? input.kind : "card";
  const carousel = readQueuedCarousel(input);
  let covered: CardSize[];
  if (carousel) {
    if (carousel.version !== 3) return [...TEMPLATE_SIZE_ORDER];
    covered = isSetDocument(draft.adjustments)
      ? pagesCoverage(draft.adjustments.pages)
      : layerDocumentCoverage(
          draft.adjustments,
          carouselTemplateKind(carousel.setType),
          carousel.slides.map((s) => s.input as unknown as Record<string, unknown>),
        );
  } else {
    if (draft.templateVersion === null) return [...TEMPLATE_SIZE_ORDER];
    covered = isSetDocument(draft.adjustments)
      ? pagesCoverage(draft.adjustments.pages)
      : layerDocumentCoverage(draft.adjustments, kind, [input]);
  }
  return covered.length ? covered : [...TEMPLATE_SIZE_ORDER];
}

/**
 * The size a design posts to the feed at: portrait when it covers portrait
 * and either the club has portrait on or the design has no square; otherwise
 * square. That is today's rule for every four-size design. Null when the
 * design has neither, so it has no feed size.
 */
export function feedSize(design: readonly CardSize[], settings: SizeSwitches): CardSize | null {
  if (design.includes("portrait") && (settings.sizePortrait || !design.includes("square")))
    return "portrait";
  return design.includes("square") ? "square" : null;
}

/**
 * What the sizes are for. Posting, layout checks and emails (`post`) follow
 * the club's switches; a download (`download`: the post pack) keeps a
 * design's own older size even when the club has switched it off (D3).
 */
export type SizeUse = "post" | "download";

/**
 * The sizes to render a draft at (portrait and story sizes plan, Stage 1):
 * the club's enabled sizes narrowed to the sizes the draft's design covers,
 * never empty, so no design renders a size it has no boxes on.
 *
 *  - `post`: the narrowed sizes; when the design covers none of the club's
 *    sizes, its feed size, else its own sizes.
 *  - `download`: a queued carousel's own saved size whatever the switches
 *    (as today); otherwise the narrowed sizes, else the design's own sizes.
 *
 * A four-size design (every stored design, pack-based or templated) gets
 * exactly the club's enabled sizes, as before.
 */
export function draftSizes(
  draft: DraftDesign,
  settings: SizeSwitches,
  use: SizeUse = "post",
): CardSize[] {
  if (use === "download") {
    const carousel = readQueuedCarousel(draft.cardInput ?? {});
    if (carousel) return [carousel.size];
  }
  const design = designSizes(draft);
  const narrowed = clubSizes(settings).filter((size) => design.includes(size));
  if (narrowed.length) return narrowed;
  const feed = use === "post" ? feedSize(design, settings) : null;
  return feed ? [feed] : design;
}

/**
 * What a render is for. A post (the default: posts, post packs, emails, Meta
 * publishing) waits for every image and fails rather than draw a blank tile
 * (round 6). A layout check only measures whether the text fits its boxes,
 * which no image changes, so it draws whatever loads: a missing photo or logo
 * must not leave the draft "Checking layout" forever (retest 7). It also runs
 * in the background, so it gets one try per sweep with longer waits.
 */
export type RenderPurpose = "post" | "layoutCheck";

/** Still limits for a layout check: one try (the sweep retries), longer waits. */
export const LAYOUT_CHECK_STILL_LIMITS: StillLimits = {
  attempts: 1,
  attemptTimeoutMs: 120_000,
  bootTimeoutMs: BACKGROUND_BOOT_TIMEOUT_MS,
};

export async function renderDraftSlides(
  saved: SocialDraftRow,
  sizes: CardSize[],
  harnessOrigin: string | null,
  log: Logger,
  purpose: RenderPurpose = "post",
): Promise<RenderedSlide[]> {
  const tenantId = saved.tenantId;
  const strict = purpose !== "layoutCheck";
  const limits = purpose === "layoutCheck" ? LAYOUT_CHECK_STILL_LIMITS : undefined;
  // A junior who is private now is withheld now, whenever the draft was built
  // (fails closed, round 3 retest P0 2).
  saved = redactDraftRow(saved, await loadWithheldJuniorNames(tenantId));
  // A junior card or set posts no club library photo in its design that isn't
  // approved junior stock, whenever the draft was made (fails closed, ADR-007).
  const safe = await juniorSafeDesign(tenantId, saved, saved.adjustments);
  const draft: SocialDraftRow = safe.removed
    ? { ...saved, adjustments: safe.design as SocialDraftRow["adjustments"] }
    : saved;
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  const read = readQueuedCarousel(input);
  if ("weekendCarousel" in input && !read)
    throw new Error("Invalid saved carousel; cannot render its slides.");
  // A junior set posts no cover or sponsors photo that isn't approved junior
  // stock, whenever the draft was made (fails closed, ADR-007).
  const carousel = read ? await juniorSafeCarousel(tenantId, input, read) : null;
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
                strictImages: strict,
                adjustments: setPageRenderDocument(set, slide.page),
              },
              harnessOrigin,
              limits,
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
              strictImages: strict,
              // A templated (version 3) set draws every slide from its one
              // assembled document; each slide picks its page from its input.
              adjustments:
                carousel.version === 3
                  ? (draft.adjustments ?? null)
                  : queuedSlideAdjustments(slide, size),
            },
            harnessOrigin,
            limits,
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
              // Every post and post pack waits for each image and fails rather
              // than draw a blank logo or photo, as a carousel does (round 6).
              // A layout check doesn't (see RenderPurpose).
              strictImages: strict,
              junior: slideJunior,
              theme: null,
              data: slideData,
              packId,
              adjustments: setPageRenderDocument(set, slide.page),
            },
            harnessOrigin,
            limits,
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
            strictImages: strict,
            junior: slideJunior,
            theme: null,
            data: slideData,
            packId,
            adjustments: adjustmentsFor(slide.key),
          },
          harnessOrigin,
          limits,
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
 * SQL for "the draft is unchanged since `draft` was read": the same pending
 * check, design, template version and card data. A write guarded by it can
 * never land on a draft an apply, edit or data refresh changed meanwhile.
 */
function unchangedSince(draft: SocialDraftRow) {
  return and(
    eq(socialDraftsTable.id, draft.id),
    eq(socialDraftsTable.layoutCheckPending, true),
    draft.templateVersion === null
      ? isNull(socialDraftsTable.templateVersion)
      : eq(socialDraftsTable.templateVersion, draft.templateVersion),
    sql`${socialDraftsTable.adjustments} is not distinct from ${JSON.stringify(draft.adjustments ?? null)}::jsonb`,
    sql`${socialDraftsTable.cardInput} is not distinct from ${JSON.stringify(draft.cardInput ?? null)}::jsonb`,
  );
}

/**
 * Render a templated draft at every enabled size its design covers
 * (`draftSizes`) and store its layout
 * warnings (KTD10). A full check replaces the stored warnings, so a size the
 * club has since turned off can't keep the draft blocked. The result is only
 * stored if the draft is unchanged since it was read — an apply, edit or data
 * refresh during the render leaves it pending for the next sweep, so a stale
 * clean result can never clear a design nobody checked. The render draws
 * whatever images load (see RenderPurpose).
 */
export async function checkDraftLayout(draft: SocialDraftRow, log: Logger): Promise<LayoutCheck> {
  // Only the enabled sizes the design draws: a size it lacks gets no entry,
  // so a blank size can't hold the draft out of automation (Stage 1).
  const sizes = draftSizes(draft, await ensureSettings(draft.tenantId));
  const slides = await renderDraftSlides(draft, sizes, null, log, "layoutCheck");
  const warnings = layoutWarningsFrom(slides, sizes);
  const updated = await db
    .update(socialDraftsTable)
    .set({
      layoutWarnings: warnings,
      layoutCheckPending: false,
      layoutCheckFailed: false,
      layoutCheckError: null,
    })
    .where(unchangedSince(draft))
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
 * How long one club's layout checks may run per sweep before the rest wait
 * for the next one. Each render has its own time limits; this keeps a few
 * slow drafts from holding up the club's auto-posting and every other club's
 * sweep behind it.
 */
export const LAYOUT_CHECK_SWEEP_BUDGET_MS = 5 * 60_000;

/** What one sweep's layout checks did. */
export type LayoutCheckRun = {
  /** Checks that ran and stored their result. */
  checked: number;
  /** Tries that failed this sweep (the draft stays pending). */
  failed: number;
  /** Drafts that gave up this sweep: "check failed, needs a look". */
  gaveUp: number;
};

/**
 * Run the layout checks templated drafts still owe (ADR-003). The least
 * recently tried go first (never tried first, then oldest), so a draft that
 * keeps failing can't hold the front of the line and starve newer drafts.
 * Each try is counted before it renders, so even a render that takes the
 * process down counts. A failed try leaves the draft pending (out of
 * automation); after LAYOUT_CHECK_MAX_ATTEMPTS tries it is marked failed:
 * still pending, still out of automation, shown in the queue as needing a
 * look, and not tried again until an edit, apply or data refresh resets it.
 * Without a render harness nothing runs and nothing is counted (fail closed).
 */
export async function runPendingLayoutChecks(
  tenantId: number,
  log: Logger,
  limit = LAYOUT_CHECKS_PER_SWEEP,
  renderBudget = LAYOUT_RENDERS_PER_SWEEP,
  timeBudgetMs = LAYOUT_CHECK_SWEEP_BUDGET_MS,
): Promise<LayoutCheckRun> {
  const run: LayoutCheckRun = { checked: 0, failed: 0, gaveUp: 0 };
  const pending = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.layoutCheckPending, true),
        eq(socialDraftsTable.layoutCheckFailed, false),
        inArray(socialDraftsTable.status, ["awaiting_review", "ready"]),
      ),
    )
    .orderBy(
      sql`${socialDraftsTable.layoutCheckLastTriedAt} asc nulls first`,
      asc(socialDraftsTable.createdAt),
      asc(socialDraftsTable.id),
    )
    .limit(limit);
  if (pending.length === 0) return run;
  if (!canRenderHeadless()) {
    log.warn(
      { tenantId, pending: pending.length },
      "layout checks skipped: no render harness configured",
    );
    return run;
  }
  const started = Date.now();
  let renders = 0;
  for (const [i, draft] of pending.entries()) {
    if (renders >= renderBudget) break;
    if (Date.now() - started >= timeBudgetMs) {
      log.warn(
        { tenantId, waiting: pending.length - i },
        "layout checks: this sweep's time is spent; the rest wait for the next one",
      );
      break;
    }
    // Count the try first. A draft changed since it was read isn't counted
    // (its tries were just reset) and is left for the next sweep.
    const [counted] = await db
      .update(socialDraftsTable)
      .set({
        layoutCheckAttempts: sql`${socialDraftsTable.layoutCheckAttempts} + 1`,
        layoutCheckLastTriedAt: new Date(),
      })
      .where(and(unchangedSince(draft), eq(socialDraftsTable.layoutCheckFailed, false)))
      .returning({ attempts: socialDraftsTable.layoutCheckAttempts });
    if (!counted) continue;
    try {
      const result = await checkDraftLayout(draft, log);
      renders += result.renders;
      if (result.stored) run.checked += 1;
    } catch (err) {
      // A failed render still used the browser: count it against the budget.
      renders += 1;
      run.failed += 1;
      const gaveUp = counted.attempts >= LAYOUT_CHECK_MAX_ATTEMPTS;
      const [marked] = await db
        .update(socialDraftsTable)
        .set({
          layoutCheckError: layoutCheckErrorText(err),
          ...(gaveUp ? { layoutCheckFailed: true } : {}),
        })
        .where(unchangedSince(draft))
        .returning({ id: socialDraftsTable.id });
      if (gaveUp && marked) run.gaveUp += 1;
      log.warn(
        {
          err,
          tenantId,
          draftId: draft.id,
          attempt: counted.attempts,
          of: LAYOUT_CHECK_MAX_ATTEMPTS,
        },
        gaveUp
          ? "layout check failed for the last time; the draft needs a look and stays out of automation"
          : "layout check failed; draft stays out of automation",
      );
    }
  }
  return run;
}
