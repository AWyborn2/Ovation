import sharp from "sharp";
import type { SocialDraftRow } from "@workspace/db";
import { env } from "../../config";
import { objectUrl, photoStore } from "../photo-store";
import { renderDraftCaption } from "../draft-enrich";
import { enabledSizes, renderDraftSlides, stillRendererOverridden } from "../draft-render";
import { DestinationError, type Platform, type PostType, type PreparedPost } from "./destination";

/**
 * Turn a draft into the images and caption one publication needs (plan
 * 2026-10-06-001 U4, KTD7–KTD9). Rendered at publish time, so a correction
 * that lands after scheduling still goes out corrected (R9, AE6):
 *
 *  - feed posts use the club's portrait size when it is on, else square;
 *    Stories use the story size; landscape is never published;
 *  - every image is an sRGB JPEG under 8 MB (Instagram takes JPEG only) at an
 *    unguessable object path, served from the public origin Meta can reach;
 *  - a list card that splits into a set publishes as one carousel/album or a
 *    run of stories, up to ten images;
 *  - captions: an edited draft's own caption on both platforms; otherwise the
 *    stored (Instagram) caption, and the Facebook template for Facebook.
 *    Stories carry none.
 */

export const MAX_IMAGES = 10;
const MAX_BYTES = 8 * 1024 * 1024;

type Logger = Parameters<typeof renderDraftSlides>[3];

export type PreparedMedia = { post: PreparedPost; imagePaths: string[] };

export class MediaConfigError extends DestinationError {
  constructor(message: string) {
    super("permanent", message);
  }
}

/** The public origin Meta fetches images from. */
function publicOrigin(): string {
  const origin = env.SOCIAL_PUBLIC_ORIGIN();
  if (!origin) throw new MediaConfigError("SOCIAL_PUBLIC_ORIGIN is not set");
  return origin.replace(/\/$/, "");
}

/** Headless renders need a harness origin: there is no request to borrow one from. */
function harnessOrigin(): string | null {
  if (stillRendererOverridden()) return null;
  if (!env.RENDER_HARNESS_URL() && !env.RENDER_HARNESS_ORIGIN()) {
    throw new MediaConfigError("RENDER_HARNESS_ORIGIN is not set, so cards can't render");
  }
  return null;
}

export async function toJpeg(png: Buffer): Promise<Buffer> {
  for (const quality of [90, 80, 70]) {
    const out = await sharp(png)
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({ quality, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (out.length <= MAX_BYTES) return out;
  }
  throw new DestinationError("permanent", "The card image is too large for Meta (over 8 MB).");
}

export async function captionFor(
  draft: SocialDraftRow,
  platform: Platform,
  postType: PostType,
): Promise<string | null> {
  if (postType === "story") return null;
  if (draft.editedAt || platform === "instagram") return draft.caption ?? "";
  return renderDraftCaption(
    draft.tenantId,
    draft.engine,
    (draft.cardInput ?? {}) as Record<string, unknown>,
    draft.appPath,
    draft.sourceKey,
    "facebook",
  );
}

export async function prepareMedia(
  draft: SocialDraftRow,
  platform: Platform,
  postType: PostType,
  log: Logger,
): Promise<PreparedMedia> {
  const origin = publicOrigin();
  const harness = harnessOrigin();
  const sizes = await enabledSizes(draft.tenantId);
  const size = postType === "story" ? "story" : sizes.includes("portrait") ? "portrait" : "square";

  const slides = await renderDraftSlides(draft, [size], harness, log);
  if (slides.length === 0) throw new DestinationError("permanent", "The card rendered nothing.");
  if (slides.length > MAX_IMAGES) {
    throw new DestinationError(
      "permanent",
      `This card splits into ${slides.length} images; Meta allows at most ${MAX_IMAGES}.`,
    );
  }

  const store = photoStore();
  const imagePaths: string[] = [];
  const imageUrls: string[] = [];
  try {
    for (const slide of slides) {
      const path = await store.write(await toJpeg(slide.png), "image/jpeg");
      imagePaths.push(path);
      imageUrls.push(`${origin}${objectUrl(path)}`);
    }
  } catch (err) {
    await removeImages(imagePaths);
    throw err;
  }
  return {
    post: { platform, postType, imageUrls, caption: await captionFor(draft, platform, postType) },
    imagePaths,
  };
}

/** Delete stored images once a publication is done with them (KTD7). Best-effort. */
export async function removeImages(paths: string[]): Promise<void> {
  const store = photoStore();
  for (const p of paths) {
    try {
      await store.remove(p);
    } catch {
      // A leftover image is harmless; never fail a publication over cleanup.
    }
  }
}
