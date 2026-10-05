import {
  landscapeSummary,
  planCardSet,
  type CardSetOptions,
  type SetInput,
} from "@workspace/scorecard";
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import { db, socialDraftsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { ensureSettings } from "../lib/social-cards-helpers";
import { getTenantBrand } from "../lib/tenant-brand";
import { loadActiveSponsors } from "../lib/active-sponsors";
import { harnessOriginFromHeaders, renderCardStill } from "../lib/card-video-renderer";
import { objectUrl, photoStore } from "../lib/photo-store";
import { resolveDraftPack } from "../lib/draft-enrich";

/**
 * `POST /social-drafts/:id/post-pack` — everything needed to share one card
 * (Social Studio R7, KTD9): a PNG per enabled format rendered through the
 * still harness with the club's branding, the draft's caption, and a zip of
 * both for desktop download.
 */
const router: IRouter = Router();

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

router.post(
  "/social-drafts/:id/post-pack",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const tenantId = getTenantId(req);
    const [draft] = await db
      .select()
      .from(socialDraftsTable)
      .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)));
    if (!draft) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const input = (draft.cardInput ?? {}) as Record<string, unknown>;
    const kind = typeof input.kind === "string" ? input.kind : "card";
    const junior = draft.sourceMatchIsJunior || input.junior === true;
    const [settings, brand, sponsors, clubPack] = await Promise.all([
      ensureSettings(tenantId),
      getTenantBrand(tenantId),
      loadActiveSponsors(tenantId, req.log),
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
    const sizes: CardSize[] = [
      ...(settings.sizeSquare ? (["square"] as const) : []),
      ...(settings.sizePortrait ? (["portrait"] as const) : []),
      ...(settings.sizeStory ? (["story"] as const) : []),
      ...(settings.sizeLandscape ? (["landscape"] as const) : []),
    ];
    if (sizes.length === 0) sizes.push("square");

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
      presentingSponsorName: sponsorsOn
        ? (sponsors.find((s) => s.isPresenting)?.name ?? null)
        : null,
      // Junior cards never carry a photo (KTD15).
      photoUrl: junior ? null : draft.photoUrl,
      photoPlacement: "contained",
      ...(Object.keys(modes).length ? { packColourModes: modes } : {}),
    };

    const origin = harnessOriginFromHeaders(req.headers);
    const store = photoStore();
    try {
      // A list card that outgrows one card posts as a balanced set (cover +
      // detail slides); every other card is a single slide. Landscape stays a
      // single summary card.
      const rootAdj = (draft.adjustments ?? null) as {
        set?: CardSetOptions;
        slides?: Record<string, unknown>;
      } | null;
      const setOptions = (rootAdj?.set ?? {}) as CardSetOptions;
      // The editor's edits: the card's own for a single card (and the
      // landscape summary), each slide's own for a set.
      const adjustmentsFor = (key: string) =>
        key === "single" ? rootAdj : (rootAdj?.slides?.[key] ?? null);
      const rendered: Array<{
        size: CardSize;
        png: Buffer;
        url: string;
        page?: number;
        of?: number;
      }> = [];
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
              origin,
            ),
          );
          const path = await store.write(buffer, "image/png");
          rendered.push({
            size,
            png: buffer,
            url: objectUrl(path),
            ...(slide.of > 1 ? { page: slide.page, of: slide.of } : {}),
          });
        }
      }

      const caption = draft.caption ?? "";
      const zip = new JSZip();
      for (const r of rendered) {
        const n = r.of ? `-${r.page}of${r.of}` : "";
        zip.file(`${kind}-${r.size}${n}.png`, r.png);
      }
      zip.file("caption.txt", caption);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const zipPath = await store.write(zipBuffer, "application/zip");

      res.json({
        images: rendered.map((r) => ({
          size: r.size,
          url: r.url,
          ...(r.of ? { page: r.page, of: r.of } : {}),
        })),
        caption,
        zipUrl: objectUrl(zipPath),
      });
    } catch (err) {
      req.log.error({ err, draftId: id }, "post pack render failed");
      const detail = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Post pack failed: ${detail}` });
    }
  },
);

export default router;
