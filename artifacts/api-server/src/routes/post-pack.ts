import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import { db, socialDraftsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { harnessOriginFromHeaders } from "../lib/card-video-renderer";
import { objectUrl, photoStore } from "../lib/photo-store";
import { enabledSizes, renderDraftSlides } from "../lib/draft-render";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";

export { setStillRenderer, type CardSize } from "../lib/draft-render";

/**
 * `POST /social-drafts/:id/post-pack` — everything needed to share one card
 * (Social Studio R7, KTD9): a PNG per enabled format rendered through the
 * still harness with the club's branding, the draft's caption, and a zip of
 * both for desktop download.
 */
const router: IRouter = Router();

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
    const store = photoStore();
    try {
      const slides = await renderDraftSlides(
        draft,
        readQueuedCarousel(input) ? [readQueuedCarousel(input)!.size] : await enabledSizes(tenantId),
        harnessOriginFromHeaders(req.headers),
        req.log,
      );
      const rendered = [];
      for (const s of slides) {
        const path = await store.write(s.png, "image/png");
        rendered.push({ ...s, url: objectUrl(path) });
      }

      const caption = draft.caption ?? "";
      const zip = new JSZip();
      for (const r of rendered) {
        const n = r.of > 1 ? `-${r.page}of${r.of}` : "";
        zip.file(`${kind}-${r.size}${n}.png`, r.png);
      }
      zip.file("caption.txt", caption);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const zipPath = await store.write(zipBuffer, "application/zip");

      res.json({
        images: rendered.map((r) => ({
          size: r.size,
          url: r.url,
          ...(r.of > 1 ? { page: r.page, of: r.of } : {}),
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
