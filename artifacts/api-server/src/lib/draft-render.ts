import {
  landscapeSummary,
  planCardSet,
  type CardSetOptions,
  type SetInput,
} from "@workspace/scorecard";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, socialDraftsTable, type SocialDraftRow } from "@workspace/db";
import {
  mergeRenderedWarnings,
  planTemplateSlides,
  type DraftLayoutWarnings,
  type LayerDocument,
  type LayoutWarning,
} from "@workspace/scorecard/kind-templates";
import { env } from "../config";
import { ensureSettings } from "./social-cards-helpers";
import { getTenantBrand } from "./tenant-brand";
import { loadActiveSponsors } from "./active-sponsors";
import { renderCardStill } from "./card-video-renderer";
import { resolveDraftPack } from "./draft-enrich";

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
// can't starve other renders or exhaust its memory.
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

const sponsorApplies = (cardKinds: string[] | null | undefined, kind: string) =>
  !cardKinds || cardKinds.length === 0 || cardKinds.includes(kind);

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
  const kind = typeof input.kind === "string" ? input.kind : "card";
  const junior = draft.sourceMatchIsJunior || input.junior === true;
  const [settings, brand, sponsors, clubPack] = await Promise.all([
    ensureSettings(tenantId),
    getTenantBrand(tenantId),
    loadActiveSponsors(tenantId, log),
    // The pack the club has set for this card type: the Studio preview and
    // editor fall back to it when the draft carries no pack of its own, so
    // the post pack must too (not the renderer's default pack).
    draft.packId || draft.templateVersion !== null
      ? Promise.resolve(null)
      : resolveDraftPack(tenantId, kind),
  ]);
  // A card kind template draft renders its own document on the blank base
  // (ADR-001); a pack draft renders its pack.
  const templated = draft.templateVersion !== null;
  const packId = templated ? "blank" : (draft.packId ?? clubPack);
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
  // A templated carousel is one document on every slide (KTD6).
  const adjustmentsFor = (key: string) =>
    templated || key === "single" ? rootAdj : (rootAdj?.slides?.[key] ?? null);

  const rendered: RenderedSlide[] = [];
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
      const slideData = slideJunior ? { ...data, photoUrl: null } : data;
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

/**
 * Render a templated draft at every enabled size and store its layout
 * warnings (KTD10): the sizes rendered replace their previous entries and the
 * pending check clears. Returns the warnings found.
 */
export async function checkDraftLayout(
  draft: SocialDraftRow,
  log: Logger,
): Promise<DraftLayoutWarnings> {
  const sizes = await enabledSizes(draft.tenantId);
  const slides = await renderDraftSlides(draft, sizes, null, log);
  const warnings = layoutWarningsFrom(slides, sizes);
  await db
    .update(socialDraftsTable)
    .set({
      layoutWarnings: mergeRenderedWarnings(
        draft.layoutWarnings as DraftLayoutWarnings | null,
        warnings,
      ),
      layoutCheckPending: false,
    })
    .where(eq(socialDraftsTable.id, draft.id));
  return warnings;
}

/** How many layout checks one sweep runs per club, so a backlog can't stall it. */
export const LAYOUT_CHECKS_PER_SWEEP = 20;

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
  for (const draft of pending) {
    try {
      await checkDraftLayout(draft, log);
      checked += 1;
    } catch (err) {
      log.warn(
        { err, tenantId, draftId: draft.id },
        "layout check failed; draft stays out of automation",
      );
    }
  }
  return checked;
}
