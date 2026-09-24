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

/**
 * `POST /social-drafts/:id/post-pack` — everything needed to share one card
 * (Social Studio R7, KTD9): a PNG per enabled format rendered through the
 * still harness with the club's branding, the draft's caption, and a zip of
 * both for desktop download.
 */
const router: IRouter = Router();

export type CardSize = "square" | "portrait" | "story";

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
    const [settings, brand, sponsors] = await Promise.all([
      ensureSettings(tenantId),
      getTenantBrand(tenantId),
      loadActiveSponsors(tenantId, req.log),
    ]);
    const sizes: CardSize[] = [
      ...(settings.sizeSquare ? (["square"] as const) : []),
      ...(settings.sizePortrait ? (["portrait"] as const) : []),
      ...(settings.sizeStory ? (["story"] as const) : []),
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
            .map((s) => ({ name: s.name, logoUrl: s.logoUrl }))
        : [],
      presentingSponsorName: sponsorsOn
        ? (sponsors.find((s) => s.isPresenting)?.name ?? null)
        : null,
      // Junior cards never carry a photo (KTD15).
      photoUrl: junior ? null : draft.photoUrl,
      photoPlacement: "contained",
    };

    const origin = harnessOriginFromHeaders(req.headers);
    const store = photoStore();
    try {
      const rendered: Array<{ size: CardSize; png: Buffer; url: string }> = [];
      for (const size of sizes) {
        const { buffer } = await serialised(() =>
          renderer(
            input,
            { size, sponsorsOn, junior, theme: null, data, packId: draft.packId ?? null },
            origin,
          ),
        );
        const path = await store.write(buffer, "image/png");
        rendered.push({ size, png: buffer, url: objectUrl(path) });
      }

      const caption = draft.caption ?? "";
      const zip = new JSZip();
      for (const r of rendered) zip.file(`${kind}-${r.size}.png`, r.png);
      zip.file("caption.txt", caption);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const zipPath = await store.write(zipBuffer, "application/zip");

      res.json({
        images: rendered.map((r) => ({ size: r.size, url: r.url })),
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
