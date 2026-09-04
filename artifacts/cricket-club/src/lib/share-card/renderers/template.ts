// "Bring your own" template renderer: a flattened background (image / GIF /
// video) plus data-bound text + photo slots, drawn frame-aware so the still PNG
// (t = 1, motion "none") and the animation path share one code path.
import type { CardTemplate } from "@workspace/api-client-react";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { resolveTextField, resolvePhotoField, type TemplateContext } from "../../card-template";
import { applyCountUp, clamp01, easeOutBack, easeOutCubic } from "../animation";
import {
  drawImageContain,
  drawImageCoverFocal,
  drawSourceCover,
  drawSponsorsSync,
  loadImage,
} from "../draw-primitives";
import { extraFontStack } from "../fonts";
import { wrapText } from "../text";
import { defaultHashtag, type Palette } from "../theme";
import {
  DEFAULT_PHOTO_TRANSFORM,
  type CardSponsor,
  type MotionPreset,
  type RenderOptions,
  type ShareCardInput,
} from "../types";

// A template background ready to draw. Stills/GIFs come back as an <img>;
// videos come back as a <video> (drawImage reads its current frame).
type TemplateBgSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  video?: HTMLVideoElement;
};

// Load a template background. For "video" kind: when `play` is true the element
// loops in real time (animation/export); otherwise it is seeked to a poster
// frame for the still PNG. Images and GIFs load as an <img> either way.
export const loadTemplateBg = async (
  template: CardTemplate,
  play: boolean,
): Promise<TemplateBgSource | null> => {
  // Layer templates (source="layers") carry no background image.
  if (!template.backgroundImageUrl) return null;
  const bgUrl = template.backgroundImageUrl;
  const kind = template.backgroundKind ?? "image";
  if (kind === "video") {
    return await new Promise<TemplateBgSource | null>((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = "auto";
      const ok = () =>
        resolve({
          source: video,
          width: video.videoWidth || template.bgWidth || 1080,
          height: video.videoHeight || template.bgHeight || 1080,
          video,
        });
      video.onerror = () => resolve(null);
      if (play) {
        video.oncanplay = () => {
          void video.play().then(ok).catch(ok);
        };
      } else {
        video.onloadeddata = () => {
          video.onseeked = () => ok();
          try {
            video.currentTime = Math.min(0.1, (video.duration || 1) * 0.1);
          } catch {
            ok();
          }
        };
      }
      video.src = bgUrl;
    });
  }
  const img = await loadImage(bgUrl).catch(() => null);
  if (!img) return null;
  return {
    source: img,
    width: img.naturalWidth || template.bgWidth || 1080,
    height: img.naturalHeight || template.bgHeight || 1080,
  };
};

// Preload sponsor logos (up to 4) into a cache so the sponsor strip can be
// drawn synchronously every animation frame.
export const loadSponsorLogos = async (
  sponsors: CardSponsor[],
): Promise<Map<string, HTMLImageElement>> => {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    sponsors.slice(0, 4).map(async (s) => {
      const img = await loadImage(s.logoUrl).catch(() => null);
      if (img) map.set(s.logoUrl, img);
    }),
  );
  return map;
};

// Synchronous, frame-aware template renderer shared by the still PNG path
// (motion "none", t = 1) and the animation path. Draws the background (cover),
// then each data-bound slot honouring the motion preset at progress `t` (0-1).
export const drawTemplateFrame = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: ShareCardInput,
  template: CardTemplate,
  opts: RenderOptions,
  p: Palette,
  bg: TemplateBgSource | null,
  photoImg: HTMLImageElement | null,
  logos: Map<string, HTMLImageElement>,
  motion: MotionPreset,
  t: number,
  speed: number = 1,
) => {
  const tctx: TemplateContext = {
    clubName: opts.brand?.name ?? DEFAULT_BRAND.name,
    clubUrl: opts.clubUrl ?? "",
    hashtag: opts.hashtag ?? defaultHashtag(opts.brand),
    photoUrl: opts.photoUrl,
  };

  // Cover transform of the background into the target frame.
  const iw = template.bgWidth || 1080;
  const ih = template.bgHeight || 1080;
  const cover = Math.max(W / iw, H / ih);
  const drawnW = iw * cover;
  const drawnH = ih * cover;
  const offX = (W - drawnW) / 2;
  const offY = (H - drawnH) / 2;
  const toX = (fx: number) => offX + fx * drawnW;
  const toY = (fy: number) => offY + fy * drawnH;

  if (bg) {
    drawSourceCover(ctx, bg.source, bg.width, bg.height, 0, 0, W, H);
  } else {
    // Background failed to load: fall back to a flat panel so slots are legible.
    ctx.fillStyle = p.bgDark;
    ctx.fillRect(0, 0, W, H);
  }

  const slots = template.slots;
  slots.forEach((slot, i) => {
    const cx = toX(slot.x);
    const cy = toY(slot.y);
    const cw = slot.w * drawnW;
    const ch = slot.h * drawnH;

    // Per-slot entrance progress. fadeIn/slideUp move as one block (no spread);
    // popIn/wipe/countUp spread a little, stagger spreads more. Window + spread
    // shrink with speed so faster = snappier. Motion "none" shows everything.
    const spread =
      (motion === "stagger"
        ? 0.55
        : motion === "popIn" || motion === "wipe" || motion === "countUp"
          ? 0.3
          : motion === "slideUp" || motion === "fadeIn"
            ? 0
            : 0) / speed;
    const win = 0.6 / speed;
    const start = slots.length > 1 ? (i / slots.length) * spread : 0;
    const localRaw = clamp01((t - start) / win);
    const local = easeOutCubic(localRaw);
    const alpha = motion === "none" ? 1 : local;
    if (alpha <= 0) return;

    ctx.save();
    if (motion === "popIn") {
      const s = easeOutBack(localRaw);
      const ccx = cx + cw / 2;
      const ccy = cy + ch / 2;
      ctx.globalAlpha = local;
      ctx.translate(ccx, ccy);
      ctx.scale(s, s);
      ctx.translate(-ccx, -ccy);
    } else if (motion === "wipe") {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.rect(cx, cy, Math.max(1, cw * local), ch);
      ctx.clip();
    } else {
      ctx.globalAlpha = alpha;
      if (motion === "slideUp" || motion === "stagger") ctx.translate(0, (1 - local) * 0.06 * H);
    }

    if (slot.type === "photo") {
      const url = resolvePhotoField(input, tctx);
      if (url && photoImg) {
        const tr = opts.photoTransform ?? DEFAULT_PHOTO_TRANSFORM;
        if (slot.shape === "circle") {
          const r = Math.min(cw, ch) / 2;
          const ccx = cx + cw / 2;
          const ccy = cy + ch / 2;
          ctx.beginPath();
          ctx.arc(ccx, ccy, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          drawImageCoverFocal(
            ctx,
            photoImg,
            ccx - r,
            ccy - r,
            r * 2,
            r * 2,
            tr.focalX,
            tr.focalY,
            tr.zoom,
          );
        } else if (slot.photoFit === "contain") {
          drawImageContain(ctx, photoImg, cx, cy, cw, ch);
        } else {
          ctx.beginPath();
          ctx.rect(cx, cy, cw, ch);
          ctx.closePath();
          ctx.clip();
          drawImageCoverFocal(ctx, photoImg, cx, cy, cw, ch, tr.focalX, tr.focalY, tr.zoom);
        }
      }
      ctx.restore();
      return;
    }

    // Text slot.
    let text = resolveTextField(input, slot.field, tctx);
    if (!text) {
      ctx.restore();
      return;
    }
    if (motion === "countUp") text = applyCountUp(text, local);
    if (slot.uppercase) text = text.toUpperCase();
    const fontPx = Math.max(8, (slot.fontSize ?? 0.05) * drawnH);
    const family =
      extraFontStack(slot.fontFamily) ??
      (slot.fontFamily === "serif"
        ? "Georgia, 'Times New Roman', serif"
        : "'Helvetica Neue', Arial, sans-serif");
    const weight = slot.fontWeight ?? 700;
    ctx.font = `${weight} ${fontPx}px ${family}`;
    ctx.fillStyle = slot.color || p.textLight;
    ctx.textBaseline = "middle";
    const align = slot.align ?? "left";
    ctx.textAlign = align;
    const lines = wrapText(ctx, text, cw);
    const lineH = fontPx * 1.15;
    const totalH = lines.length * lineH;
    let ty = cy + ch / 2 - totalH / 2 + lineH / 2;
    const tx = align === "center" ? cx + cw / 2 : align === "right" ? cx + cw : cx;
    for (const line of lines) {
      ctx.fillText(line, tx, ty);
      ty += lineH;
    }
    ctx.restore();
  });

  // Sponsors strip still overlays the bottom when enabled.
  drawSponsorsSync(ctx, W, H, opts.sponsors ?? [], scale, p, logos);
};

// Still template render: preload assets, then draw the final (motion "none")
// frame. Keeps byte-for-byte parity with the previous still output.
export const renderTemplateCard = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: ShareCardInput,
  template: CardTemplate,
  opts: RenderOptions,
  p: Palette,
) => {
  const tctx: TemplateContext = {
    clubName: opts.brand?.name ?? DEFAULT_BRAND.name,
    clubUrl: opts.clubUrl ?? "",
    hashtag: opts.hashtag ?? defaultHashtag(opts.brand),
    photoUrl: opts.photoUrl,
  };
  const bg = await loadTemplateBg(template, false);
  const purl = resolvePhotoField(input, tctx);
  const photoImg = purl ? await loadImage(purl).catch(() => null) : null;
  const logos = await loadSponsorLogos(opts.sponsors ?? []);
  drawTemplateFrame(ctx, W, H, scale, input, template, opts, p, bg, photoImg, logos, "none", 1);
  bg?.video?.remove();
};
