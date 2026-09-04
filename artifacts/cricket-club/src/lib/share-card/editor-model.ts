// Custom-layer editor model: builds the ordered built-in layer list for the
// standard card body (asset preload + per-kind geometry, capturing draw
// closures at natural coordinates), the custom image/shape/sticker/text layers
// a saved layout appends, and applyLayout which merges a saved layout onto the
// built-ins.
import type { CardLayoutLayer } from "@workspace/api-client-react";
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import { resolveTextField, type TemplateContext } from "../card-template";
import { seasonLabel } from "../season-label";
import { getSticker } from "../sticker-library";
import { countValue } from "./animation";
import {
  drawBackground,
  drawCircularImage,
  drawFooter,
  drawImageContain,
  drawImageCoverFocal,
  drawPill,
  drawRibbon,
  drawSectionTitle,
  drawSponsors,
  drawStatTile,
  iconSvgString,
  loadImage,
  svgToDataUrl,
} from "./draw-primitives";
import { CARD_FONT, extraFontStack } from "./fonts";
import { hasLayerEffects, type PxRect, type RenderLayer } from "./layers";
import { fitFontSize, fmt, headlineFor, wrapText } from "./text";
import { defaultHashtag, type Palette } from "./theme";
import type { PhotoPlacement, PhotoTransform, RenderOptions, ShareCardInput } from "./types";

// Shared asset preload for the standard body (theme bg, player photo, club logo).
// Mirrors the inline loading the renderer used before the layer refactor so the
// editor (computeCardLayers) and the renderer build from identical inputs.
type CardAssets = {
  bgImg: HTMLImageElement | null;
  featureImg: HTMLImageElement | null;
  photoImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  // An admin-uploaded full-bleed background image stored on the Background
  // layer (saved layout). When present it replaces the theme background.
  customBg: { img: HTMLImageElement; focalX: number; focalY: number; zoom: number } | null;
};

export const loadCardAssets = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<CardAssets> => {
  const bgImg = opts.theme?.backgroundImageUrl
    ? await loadImage(opts.theme.backgroundImageUrl).catch(() => null)
    : null;
  // The Background layer may carry an uploaded image (url/focal/zoom) in the
  // saved layout. Geometry is never persisted for it (locked full-bleed), only
  // the image fields, so we draw it cover-focal across the whole card.
  const savedBg = opts.layout?.find(
    (l) => l.kind === "element" && l.id === "background" && !!l.url,
  );
  const customBgImg = savedBg?.url ? await loadImage(savedBg.url).catch(() => null) : null;
  const customBg = customBgImg
    ? {
        img: customBgImg,
        focalX: savedBg!.focalX ?? 0.5,
        focalY: savedBg!.focalY ?? 0.5,
        zoom: savedBg!.zoom ?? 1,
      }
    : null;
  const placement: PhotoPlacement = opts.photoPlacement ?? "headshot";
  const photoUrl =
    opts.photoUrl !== undefined ? opts.photoUrl : "photoUrl" in input ? input.photoUrl : null;
  const loadedPhoto = photoUrl ? await loadImage(photoUrl).catch(() => null) : null;
  const featureImg = placement === "feature" ? loadedPhoto : null;
  const photoImg = placement === "feature" ? null : loadedPhoto;
  const logoSrc = opts.theme?.logoUrl || opts.brand?.logoUrl || DEFAULT_BRAND.logoUrl || "";
  const logoImg = logoSrc ? await loadImage(logoSrc).catch(() => null) : null;
  return { bgImg, featureImg, photoImg, logoImg, customBg };
};

// Synchronous header draw using a preloaded logo (mirrors the async drawHeader
// success + fallback branches exactly so the layer output is pixel-identical).
const drawHeaderWith = (
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  scale: number,
  p: Palette,
  brand?: ClubBrand | null,
) => {
  const pad = Math.round(80 * scale);
  const topY = Math.round(80 * scale);
  const clubName = (brand?.name ?? DEFAULT_BRAND.name).toUpperCase();
  if (logo) {
    const logoH = Math.round(110 * scale);
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, pad, topY, logoW, logoH);
    ctx.fillStyle = p.textLight;
    ctx.font = `700 ${Math.round(26 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(clubName, pad + logoW + Math.round(28 * scale), topY + Math.round(14 * scale));
    ctx.fillStyle = p.textMuted;
    ctx.font = `500 ${Math.round(17 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillText(
      "HONOUR BOARD",
      pad + logoW + Math.round(28 * scale),
      topY + Math.round(54 * scale),
    );
  } else {
    ctx.fillStyle = p.textLight;
    ctx.font = `700 ${Math.round(36 * scale)}px Georgia, serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(clubName, pad, topY + Math.round(10 * scale));
  }
};

// Build the ordered built-in layer list for a standard card. Pure layout: it
// measures with an offscreen ctx (`m`) and captures closures; the caller runs
// drawLayers. Geometry mirrors the pre-refactor renderShareCard exactly.
export const buildLayers = (
  input: ShareCardInput,
  opts: RenderOptions,
  p: Palette,
  W: number,
  H: number,
  scale: number,
  assets: CardAssets,
): RenderLayer[] => {
  const { bgImg, featureImg, photoImg, logoImg, customBg } = assets;
  // Priority for the full-bleed background: an admin-uploaded custom image wins,
  // then a feature-placement hero photo, then the theme texture. The custom and
  // feature images both use the "hero" scrim so foreground text stays legible.
  const heroImg = customBg?.img ?? featureImg ?? bgImg;
  const heroFeature = !!(customBg || featureImg);
  const heroTransform: PhotoTransform | null | undefined = customBg
    ? { focalX: customBg.focalX, focalY: customBg.focalY, zoom: customBg.zoom }
    : featureImg
      ? opts.photoTransform
      : undefined;
  const GOLD = p.accent;
  const GOLD_SOFT = p.accentSoft;
  const TEXT_LIGHT = p.textLight;
  const TEXT_MUTED = p.textMuted;

  const mc = document.createElement("canvas");
  mc.width = W;
  mc.height = H;
  const m = mc.getContext("2d")!;

  const layers: RenderLayer[] = [];
  const add = (
    l: Omit<RenderLayer, "z" | "rect" | "hidden" | "drawsAtNatural"> & {
      hidden?: boolean;
      drawsAtNatural?: boolean;
    },
  ) => {
    layers.push({
      ...l,
      // Every selectable element gets resize handles (task requirement: any
      // element is resizable); non-selectable chrome (background) stays fixed.
      resizable: l.selectable,
      rect: { ...l.natural },
      z: layers.length,
      hidden: l.hidden ?? false,
      drawsAtNatural: l.drawsAtNatural ?? true,
    });
  };

  // The built-in headshot photo layer: carries a mutable photoTransform that the
  // editor (via applyLayout) can override for focal-point repositioning + zoom.
  const addPhoto = (natural: PxRect, ringWidth: number) => {
    const layer: RenderLayer = {
      id: "photo",
      editKind: "element",
      label: "Photo",
      natural,
      rect: { ...natural },
      vAnchor: "top",
      z: layers.length,
      hidden: false,
      selectable: true,
      resizable: true,
      drawsAtNatural: true,
      photoTransform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      draw: (ctx) =>
        drawCircularImage(
          ctx,
          photoImg!,
          natural.x + natural.w / 2,
          natural.y + natural.h / 2,
          natural.w / 2,
          GOLD,
          ringWidth,
          layer.photoTransform,
        ),
    };
    layers.push(layer);
  };

  // --- Background -----------------------------------------------------------
  add({
    id: "background",
    editKind: "element",
    // When a full-bleed hero/feature photo backs the card, label it as such so
    // admins can find it in the layer list and apply effects (tone/gradient/mask).
    label: featureImg ? "Feature photo" : "Background",
    natural: { x: 0, y: 0, w: W, h: H },
    vAnchor: "top",
    selectable: false,
    resizable: false,
    draw: (ctx) => drawBackground(ctx, W, H, p, heroImg, heroFeature, heroTransform),
  });

  // --- Header ---------------------------------------------------------------
  const pad = Math.round(80 * scale);
  const topY = Math.round(80 * scale);
  const logoH = Math.round(110 * scale);
  const headerEnd = logoImg ? topY + logoH + Math.round(40 * scale) : topY + Math.round(80 * scale);
  add({
    id: "header",
    editKind: "element",
    label: "Club header",
    natural: {
      x: pad,
      y: topY,
      w: W - pad * 2,
      h: logoImg ? logoH : Math.round(80 * scale),
    },
    vAnchor: "top",
    selectable: true,
    resizable: false,
    draw: (ctx) => drawHeaderWith(ctx, logoImg, scale, p, opts.brand),
  });

  // --- Headline ribbon ------------------------------------------------------
  const ribbonH = Math.round(60 * scale);
  const headline = headlineFor(input);
  add({
    id: "ribbon",
    editKind: "element",
    label: "Headline ribbon",
    natural: { x: pad, y: headerEnd, w: W - pad * 2, h: ribbonH },
    vAnchor: "top",
    selectable: true,
    resizable: false,
    draw: (ctx) => {
      drawRibbon(ctx, W, headerEnd, headline, scale, p);
    },
  });
  const ribbonEnd = headerEnd + ribbonH + Math.round(40 * scale);

  // --- Sponsors (bottom chrome; only when present) --------------------------
  const sponsors = opts.sponsors ?? [];
  let sponsorsTop: number;
  if (sponsors.length > 0) {
    const stripH = Math.round(110 * scale);
    const stripY = H - stripH - Math.round(40 * scale);
    sponsorsTop = stripY - Math.round(20 * scale);
    add({
      id: "sponsors",
      editKind: "element",
      label: "Sponsors",
      natural: {
        x: Math.round(56 * scale),
        y: stripY,
        w: W - Math.round(112 * scale),
        h: stripH,
      },
      vAnchor: "bottom",
      selectable: true,
      resizable: false,
      draw: async (ctx) => {
        await drawSponsors(ctx, W, H, sponsors, scale, p);
      },
    });
  } else {
    sponsorsTop = H - Math.round(70 * scale);
  }

  const bodyTop = ribbonEnd;
  const bodyBottom = sponsorsTop;

  // --- Per-kind body --------------------------------------------------------
  if (input.kind === "milestone") {
    const tierIndex = input.tierIndex;
    const tierLabel = input.tierLabel;
    const playerName = input.playerName;
    const currentValue = input.currentValue;
    const milestoneLabel = input.milestoneLabel;
    const threshold = input.threshold;

    const badgeR = Math.round(130 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(30 * scale);
    add({
      id: "badge",
      editKind: "element",
      label: "Badge",
      natural: { x: W / 2 - badgeR, y: badgeCy - badgeR, w: badgeR * 2, h: badgeR * 2 },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: async (ctx) => {
        if (photoImg) {
          drawCircularImage(ctx, photoImg, W / 2, badgeCy, badgeR, GOLD, Math.round(6 * scale));
          const miniR = Math.round(46 * scale);
          const miniCx = W / 2 + badgeR * 0.72;
          const miniCy = badgeCy + badgeR * 0.72;
          ctx.beginPath();
          ctx.arc(miniCx, miniCy, miniR, 0, Math.PI * 2);
          ctx.fillStyle = p.bgDark;
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = Math.round(3 * scale);
          ctx.stroke();
          try {
            const svg = iconSvgString(tierIndex, GOLD, 256, 1.75);
            const iconImg = await loadImage(svgToDataUrl(svg));
            const iconSize = Math.round(52 * scale);
            ctx.drawImage(
              iconImg,
              miniCx - iconSize / 2,
              miniCy - iconSize / 2,
              iconSize,
              iconSize,
            );
          } catch {}
        } else {
          ctx.beginPath();
          ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = GOLD_SOFT;
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 4;
          ctx.stroke();
          try {
            const svg = iconSvgString(tierIndex, GOLD, 256, 1.75);
            const iconImg = await loadImage(svgToDataUrl(svg));
            const iconSize = Math.round(150 * scale);
            ctx.drawImage(
              iconImg,
              W / 2 - iconSize / 2,
              badgeCy - iconSize / 2,
              iconSize,
              iconSize,
            );
          } catch {}
        }
      },
    });

    let y = badgeCy + badgeR + Math.round(28 * scale);
    const pillTop = y;
    const pillSide = Math.round(24 * scale);
    const pillMaxW = W - Math.round(160 * scale);
    const pillFp = fitFontSize(
      m,
      tierLabel.toUpperCase(),
      pillMaxW - pillSide * 2,
      800,
      Math.round(22 * scale),
      CARD_FONT,
    );
    m.font = `800 ${pillFp}px ${CARD_FONT}`;
    const pillW = Math.min(pillMaxW, m.measureText(tierLabel.toUpperCase()).width + pillSide * 2);
    const pillH = Math.round(46 * scale);
    add({
      id: "tier",
      editKind: "element",
      label: "Tier pill",
      natural: { x: W / 2 - pillW / 2, y: pillTop, w: pillW, h: pillH },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        drawPill(ctx, W / 2, pillTop, tierLabel, scale, p, true);
      },
    });
    y = pillTop + pillH + Math.round(30 * scale);

    const mPad = Math.round(100 * scale);
    const nameUpper = playerName.toUpperCase();
    const namePx = fitFontSize(m, nameUpper, W - mPad * 2, 900, Math.round(64 * scale), CARD_FONT);
    const lineH = Math.round(namePx * 1.08);
    const nameLines = wrapText(m, nameUpper, W - mPad * 2);
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: mPad, y: nameTop, w: W - mPad * 2, h: nameLines.length * lineH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const px = fitFontSize(
          ctx,
          nameUpper,
          W - mPad * 2,
          900,
          Math.round(64 * scale),
          CARD_FONT,
        );
        const lh = Math.round(px * 1.08);
        const lines = wrapText(ctx, nameUpper, W - mPad * 2);
        lines.forEach((line, i) => ctx.fillText(line, W / 2, nameTop + i * lh));
      },
    });
    y = nameTop + nameLines.length * lineH + Math.round(28 * scale);

    const tileW = Math.min(W - mPad * 2, Math.round(640 * scale));
    const tileH = Math.round(190 * scale);
    const tileTop = y;
    add({
      id: "value",
      editKind: "element",
      label: "Value tile",
      natural: { x: W / 2 - tileW / 2, y: tileTop, w: tileW, h: tileH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) =>
        drawStatTile(
          ctx,
          W / 2 - tileW / 2,
          tileTop,
          tileW,
          tileH,
          currentValue,
          milestoneLabel,
          scale,
          p,
          true,
        ),
      drawCount: (ctx, frac) =>
        drawStatTile(
          ctx,
          W / 2 - tileW / 2,
          tileTop,
          tileW,
          tileH,
          countValue(currentValue, frac),
          milestoneLabel,
          scale,
          p,
          true,
        ),
    });
    y = tileTop + tileH + Math.round(28 * scale);

    if (threshold && threshold > 0) {
      const capTop = y;
      add({
        id: "threshold",
        editKind: "element",
        label: "Threshold caption",
        natural: { x: mPad, y: capTop, w: W - mPad * 2, h: Math.round(30 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_MUTED;
          ctx.font = `500 ${Math.round(24 * scale)}px ${CARD_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(
            `Past the ${fmt(threshold)} ${milestoneLabel.toLowerCase()} mark`,
            W / 2,
            capTop,
          );
        },
      });
    }
  } else if (input.kind === "player") {
    const playerName = input.playerName;
    const gradesPlayed = input.gradesPlayed;
    const allStats = input.stats;
    const padP = Math.round(100 * scale);
    let y = bodyTop + Math.round(24 * scale);
    if (photoImg) {
      const r = Math.round(140 * scale);
      const cy = y + r;
      addPhoto({ x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 }, Math.round(6 * scale));
      y = cy + r + Math.round(30 * scale);
    }
    const nameUpper = playerName.toUpperCase();
    const namePx = fitFontSize(m, nameUpper, W - padP * 2, 900, Math.round(78 * scale), CARD_FONT);
    const nameLines = wrapText(m, nameUpper, W - padP * 2);
    const lineH = Math.round(namePx * 1.05);
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: padP, y: nameTop, w: W - padP * 2, h: nameLines.length * lineH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const px = fitFontSize(
          ctx,
          nameUpper,
          W - padP * 2,
          900,
          Math.round(78 * scale),
          CARD_FONT,
        );
        const lh = Math.round(px * 1.05);
        const lines = wrapText(ctx, nameUpper, W - padP * 2);
        lines.forEach((l, i) => ctx.fillText(l, W / 2, nameTop + i * lh));
      },
    });
    y = nameTop + nameLines.length * lineH + Math.round(20 * scale);

    if (gradesPlayed) {
      const pillTop = y;
      const pillSide = Math.round(24 * scale);
      const pillMaxW = W - Math.round(160 * scale);
      const pillFp = fitFontSize(
        m,
        gradesPlayed.toUpperCase(),
        pillMaxW - pillSide * 2,
        800,
        Math.round(22 * scale),
        CARD_FONT,
      );
      m.font = `800 ${pillFp}px ${CARD_FONT}`;
      const pillW = Math.min(
        pillMaxW,
        m.measureText(gradesPlayed.toUpperCase()).width + pillSide * 2,
      );
      const pillH = Math.round(46 * scale);
      add({
        id: "grades",
        editKind: "element",
        label: "Grades pill",
        natural: { x: W / 2 - pillW / 2, y: pillTop, w: pillW, h: pillH },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          drawPill(ctx, W / 2, pillTop, gradesPlayed, scale, p);
        },
      });
      y = pillTop + pillH + Math.round(34 * scale);
    }

    let stats = allStats.slice(0, 6);
    if (stats.length > 0) {
      const titleTop = y;
      add({
        id: "statsTitle",
        editKind: "element",
        label: "Statistics title",
        natural: { x: padP, y: titleTop, w: W - padP * 2, h: Math.round(30 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          drawSectionTitle(ctx, padP, titleTop, "Career Statistics", scale, p);
        },
      });
      y = titleTop + Math.round(30 * scale) + Math.round(22 * scale);
      const cols = 2;
      const gridGap = Math.round(20 * scale);
      const gridW = W - padP * 2;
      const tileW = (gridW - gridGap * (cols - 1)) / cols;
      const maxGridH = bodyBottom - y - Math.round(20 * scale);
      const minTileH = Math.round(78 * scale);
      while (stats.length > 2) {
        const rows = Math.ceil(stats.length / cols);
        if (rows * minTileH + gridGap * (rows - 1) <= maxGridH) break;
        stats = stats.slice(0, stats.length - 2);
      }
      const rows = Math.ceil(stats.length / cols);
      const tileH = Math.max(
        minTileH,
        Math.min(Math.round(150 * scale), (maxGridH - gridGap * (rows - 1)) / rows),
      );
      stats.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const tx = padP + col * (tileW + gridGap);
        const ty = y + row * (tileH + gridGap);
        add({
          id: `stat:${i}`,
          editKind: "element",
          label: `Stat: ${s.label}`,
          natural: { x: tx, y: ty, w: tileW, h: tileH },
          vAnchor: "top",
          selectable: true,
          resizable: true,
          numeric: true,
          draw: (ctx) => drawStatTile(ctx, tx, ty, tileW, tileH, s.value, s.label, scale, p, false),
          drawCount: (ctx, frac) =>
            drawStatTile(
              ctx,
              tx,
              ty,
              tileW,
              tileH,
              countValue(s.value, frac),
              s.label,
              scale,
              p,
              false,
            ),
        });
      });
    }
  } else if (input.kind === "record") {
    const title = input.title;
    const playerName = input.playerName;
    const value = input.value;
    const grade = input.grade;
    let y = bodyTop + Math.round(30 * scale);
    if (photoImg) {
      const r = Math.round(70 * scale);
      const cy = y + r;
      addPhoto({ x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 }, Math.round(4 * scale));
      y = cy + r + Math.round(24 * scale);
    }
    const titleTop = y;
    add({
      id: "title",
      editKind: "element",
      label: "Title",
      natural: {
        x: Math.round(80 * scale),
        y: titleTop,
        w: W - Math.round(160 * scale),
        h: Math.round(40 * scale),
      },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.font = `800 ${Math.round(28 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title.toUpperCase(), W / 2, titleTop);
      },
    });
    y = titleTop + Math.round(60 * scale);
    const valueTop = y;
    const drawRecordValue = (ctx: CanvasRenderingContext2D, v: string | number) => {
      ctx.fillStyle = TEXT_LIGHT;
      ctx.font = `900 ${Math.round(180 * scale)}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(fmt(v)), W / 2, valueTop);
    };
    add({
      id: "value",
      editKind: "element",
      label: "Value",
      natural: { x: 0, y: valueTop, w: W, h: Math.round(180 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) => drawRecordValue(ctx, value),
      drawCount: (ctx, frac) => drawRecordValue(ctx, countValue(value, frac)),
    });
    y = valueTop + Math.round(200 * scale);
    m.font = `700 ${Math.round(48 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(m, playerName.toUpperCase(), W - Math.round(160 * scale));
    const nameTop = y;
    const nameBlockH =
      nameLines.length * Math.round(56 * scale) + (grade ? Math.round(46 * scale) : 0);
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: {
        x: Math.round(80 * scale),
        y: nameTop,
        w: W - Math.round(160 * scale),
        h: nameBlockH,
      },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.font = `700 ${Math.round(48 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, playerName.toUpperCase(), W - Math.round(160 * scale));
        lines.forEach((l, i) => ctx.fillText(l, W / 2, nameTop + i * Math.round(56 * scale)));
        if (grade) {
          ctx.fillStyle = TEXT_MUTED;
          ctx.font = `600 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
          ctx.fillText(
            grade.toUpperCase(),
            W / 2,
            nameTop + lines.length * Math.round(56 * scale) + Math.round(20 * scale),
          );
        }
      },
    });
  } else if (input.kind === "gradeLeader") {
    const grade = input.grade;
    const category = input.category;
    const playerName = input.playerName;
    const value = input.value;
    let y = bodyTop + Math.round(40 * scale);
    if (photoImg) {
      const r = Math.round(70 * scale);
      const cy = y + r;
      add({
        id: "photo",
        editKind: "element",
        label: "Photo",
        natural: { x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 },
        vAnchor: "top",
        selectable: true,
        resizable: true,
        draw: (ctx) => drawCircularImage(ctx, photoImg, W / 2, cy, r, GOLD, Math.round(4 * scale)),
      });
      y = cy + r + Math.round(24 * scale);
    }
    const titleTop = y;
    add({
      id: "title",
      editKind: "element",
      label: "Title",
      natural: {
        x: Math.round(80 * scale),
        y: titleTop,
        w: W - Math.round(160 * scale),
        h: Math.round(40 * scale),
      },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.font = `800 ${Math.round(28 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${grade.toUpperCase()} • LEADING ${category.toUpperCase()}`, W / 2, titleTop);
      },
    });
    y = titleTop + Math.round(80 * scale);
    m.font = `700 ${Math.round(68 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(m, playerName.toUpperCase(), W - Math.round(160 * scale));
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: {
        x: Math.round(80 * scale),
        y: nameTop,
        w: W - Math.round(160 * scale),
        h: nameLines.length * Math.round(76 * scale),
      },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.font = `700 ${Math.round(68 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, playerName.toUpperCase(), W - Math.round(160 * scale));
        lines.forEach((l, i) => ctx.fillText(l, W / 2, nameTop + i * Math.round(76 * scale)));
      },
    });
    y = nameTop + nameLines.length * Math.round(76 * scale) + Math.round(40 * scale);
    const valueTop = y;
    const drawLeaderValue = (ctx: CanvasRenderingContext2D, v: string | number) => {
      ctx.fillStyle = GOLD;
      ctx.font = `900 ${Math.round(150 * scale)}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(fmt(v)), W / 2, valueTop);
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(category.toUpperCase(), W / 2, valueTop + Math.round(170 * scale));
    };
    add({
      id: "value",
      editKind: "element",
      label: "Value",
      natural: { x: 0, y: valueTop, w: W, h: Math.round(200 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) => drawLeaderValue(ctx, value),
      drawCount: (ctx, frac) => drawLeaderValue(ctx, countValue(value, frac)),
    });
  } else if (input.kind === "premiership") {
    const grade = input.grade;
    const year = input.year;
    const competition = input.competition;
    const result = input.result;
    const mom = input.mom;

    const badgeR = Math.round(110 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(20 * scale);
    add({
      id: "badge",
      editKind: "element",
      label: "Trophy badge",
      natural: { x: W / 2 - badgeR, y: badgeCy - badgeR, w: badgeR * 2, h: badgeR * 2 },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: async (ctx) => {
        ctx.beginPath();
        ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = GOLD_SOFT;
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 4;
        ctx.stroke();
        try {
          const svg = iconSvgString(1, GOLD, 256, 1.75);
          const iconImg = await loadImage(svgToDataUrl(svg));
          const iconSize = Math.round(120 * scale);
          ctx.drawImage(iconImg, W / 2 - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
        } catch {}
      },
    });
    let y = badgeCy + badgeR + Math.round(28 * scale);
    const premTop = y;
    add({
      id: "premiers",
      editKind: "element",
      label: "Premiers heading",
      natural: { x: 0, y: premTop, w: W, h: Math.round(110 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.font = `800 ${Math.round(110 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("PREMIERS", W / 2, premTop);
      },
    });
    y = premTop + Math.round(130 * scale);
    const gsTop = y;
    add({
      id: "gradeSeason",
      editKind: "element",
      label: "Grade • Season",
      natural: { x: 0, y: gsTop, w: W, h: Math.round(52 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.font = `700 ${Math.round(52 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${grade.toUpperCase()} • ${seasonLabel(year)}`, W / 2, gsTop);
      },
    });
    y = gsTop + Math.round(64 * scale);
    m.font = `600 ${Math.round(24 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    const compLines = wrapText(m, competition, W - Math.round(200 * scale));
    const compTop = y;
    add({
      id: "competition",
      editKind: "element",
      label: "Competition",
      natural: {
        x: Math.round(100 * scale),
        y: compTop,
        w: W - Math.round(200 * scale),
        h: compLines.length * Math.round(32 * scale),
      },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_MUTED;
        ctx.font = `600 ${Math.round(24 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, competition, W - Math.round(200 * scale));
        lines.forEach((l, i) => ctx.fillText(l, W / 2, compTop + i * Math.round(32 * scale)));
      },
    });
    y = compTop + compLines.length * Math.round(32 * scale) + Math.round(16 * scale);
    if (result) {
      m.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      const resLines = wrapText(m, result, W - Math.round(220 * scale));
      const resTop = y;
      add({
        id: "result",
        editKind: "element",
        label: "Result",
        natural: {
          x: Math.round(110 * scale),
          y: resTop,
          w: W - Math.round(220 * scale),
          h: resLines.length * Math.round(30 * scale),
        },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_LIGHT;
          ctx.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const lines = wrapText(ctx, result, W - Math.round(220 * scale));
          lines.forEach((l, i) => ctx.fillText(l, W / 2, resTop + i * Math.round(30 * scale)));
        },
      });
      y = resTop + resLines.length * Math.round(30 * scale) + Math.round(12 * scale);
    }
    if (mom) {
      const momTop = y;
      add({
        id: "mom",
        editKind: "element",
        label: "Player of the match",
        natural: {
          x: Math.round(80 * scale),
          y: momTop,
          w: W - Math.round(160 * scale),
          h: Math.round(30 * scale),
        },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = GOLD;
          ctx.font = `700 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(`PLAYER OF THE MATCH: ${mom.toUpperCase()}`, W / 2, momTop);
        },
      });
    }
  } else if (input.kind === "debut" || input.kind === "century" || input.kind === "fiveFor") {
    const playerName = input.playerName;
    const matchSubtitle = (opponent?: string | null, round?: number | null): string => {
      const parts: string[] = [];
      if (opponent) parts.push(`vs ${opponent}`);
      if (round != null) parts.push(`Round ${round}`);
      return parts.join(" • ");
    };
    let badgeLabel = "";
    let bigValue = "";
    let caption = "";
    let subtitle = "";
    let tileLabel = "";
    let iconIndex = 4;
    if (input.kind === "debut") {
      badgeLabel =
        input.capNumber != null ? `${input.grade} Cap #${input.capNumber}` : `${input.grade} Debut`;
      bigValue = "DEBUT";
      caption = `First game for the ${input.grade} side`;
      const debutParts: string[] = [];
      const matchPart = matchSubtitle(input.opponent, input.round);
      if (matchPart) debutParts.push(matchPart);
      if (input.season) debutParts.push(input.season);
      subtitle = debutParts.join(" • ");
      tileLabel = input.grade;
      iconIndex = 4;
    } else if (input.kind === "century") {
      badgeLabel = "Century";
      bigValue = `${input.runs}${input.notOut ? "*" : ""}`;
      caption =
        input.balls != null
          ? `${input.runs}${input.notOut ? " not out" : ""} off ${input.balls} balls`
          : `${input.runs}${input.notOut ? " not out" : ""} runs`;
      subtitle = matchSubtitle(input.opponent, input.round);
      tileLabel = "Runs";
      iconIndex = 1;
    } else {
      badgeLabel = "Five-Wicket Haul";
      bigValue = input.figures ?? `${input.wickets}/-`;
      caption =
        input.overs != null
          ? `${input.wickets} wickets off ${input.overs} overs`
          : `${input.wickets} wickets`;
      subtitle = matchSubtitle(input.opponent, input.round);
      tileLabel = "Figures";
      iconIndex = 2;
    }

    const badgeR = Math.round(130 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(30 * scale);
    add({
      id: "badge",
      editKind: "element",
      label: "Badge",
      natural: { x: W / 2 - badgeR, y: badgeCy - badgeR, w: badgeR * 2, h: badgeR * 2 },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: async (ctx) => {
        if (photoImg) {
          drawCircularImage(ctx, photoImg, W / 2, badgeCy, badgeR, GOLD, Math.round(6 * scale));
          const miniR = Math.round(46 * scale);
          const miniCx = W / 2 + badgeR * 0.72;
          const miniCy = badgeCy + badgeR * 0.72;
          ctx.beginPath();
          ctx.arc(miniCx, miniCy, miniR, 0, Math.PI * 2);
          ctx.fillStyle = p.bgDark;
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = Math.round(3 * scale);
          ctx.stroke();
          try {
            const svg = iconSvgString(iconIndex, GOLD, 256, 1.75);
            const iconImg = await loadImage(svgToDataUrl(svg));
            const iconSize = Math.round(52 * scale);
            ctx.drawImage(
              iconImg,
              miniCx - iconSize / 2,
              miniCy - iconSize / 2,
              iconSize,
              iconSize,
            );
          } catch {}
        } else {
          ctx.beginPath();
          ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = GOLD_SOFT;
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 4;
          ctx.stroke();
          try {
            const svg = iconSvgString(iconIndex, GOLD, 256, 1.75);
            const iconImg = await loadImage(svgToDataUrl(svg));
            const iconSize = Math.round(150 * scale);
            ctx.drawImage(
              iconImg,
              W / 2 - iconSize / 2,
              badgeCy - iconSize / 2,
              iconSize,
              iconSize,
            );
          } catch {}
        }
      },
    });

    let y = badgeCy + badgeR + Math.round(26 * scale);
    const pillTop = y;
    const pillSide = Math.round(24 * scale);
    const pillMaxW = W - Math.round(160 * scale);
    const pillFp = fitFontSize(
      m,
      badgeLabel.toUpperCase(),
      pillMaxW - pillSide * 2,
      800,
      Math.round(22 * scale),
      CARD_FONT,
    );
    m.font = `800 ${pillFp}px ${CARD_FONT}`;
    const pillW = Math.min(pillMaxW, m.measureText(badgeLabel.toUpperCase()).width + pillSide * 2);
    const pillH = Math.round(46 * scale);
    add({
      id: "badgeLabel",
      editKind: "element",
      label: "Badge label",
      natural: { x: W / 2 - pillW / 2, y: pillTop, w: pillW, h: pillH },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        drawPill(ctx, W / 2, pillTop, badgeLabel, scale, p, true);
      },
    });
    y = pillTop + pillH + Math.round(28 * scale);

    const hPad = Math.round(100 * scale);
    const nameUpper = playerName.toUpperCase();
    const namePx = fitFontSize(m, nameUpper, W - hPad * 2, 900, Math.round(60 * scale), CARD_FONT);
    const lineH = Math.round(namePx * 1.08);
    const nameLines = wrapText(m, nameUpper, W - hPad * 2);
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: hPad, y: nameTop, w: W - hPad * 2, h: nameLines.length * lineH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const px = fitFontSize(
          ctx,
          nameUpper,
          W - hPad * 2,
          900,
          Math.round(60 * scale),
          CARD_FONT,
        );
        const lh = Math.round(px * 1.08);
        const lines = wrapText(ctx, nameUpper, W - hPad * 2);
        lines.forEach((line, i) => ctx.fillText(line, W / 2, nameTop + i * lh));
      },
    });
    y = nameTop + nameLines.length * lineH + Math.round(26 * scale);

    const tileW = Math.min(W - hPad * 2, Math.round(560 * scale));
    const tileH = Math.round(200 * scale);
    const tileTop = y;
    add({
      id: "value",
      editKind: "element",
      label: "Value tile",
      natural: { x: W / 2 - tileW / 2, y: tileTop, w: tileW, h: tileH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) =>
        drawStatTile(
          ctx,
          W / 2 - tileW / 2,
          tileTop,
          tileW,
          tileH,
          bigValue,
          tileLabel,
          scale,
          p,
          true,
        ),
      drawCount: (ctx, frac) =>
        drawStatTile(
          ctx,
          W / 2 - tileW / 2,
          tileTop,
          tileW,
          tileH,
          countValue(bigValue, frac),
          tileLabel,
          scale,
          p,
          true,
        ),
    });
    y = tileTop + tileH + Math.round(28 * scale);

    if (caption) {
      const capTop = y;
      add({
        id: "caption",
        editKind: "element",
        label: "Caption",
        natural: { x: hPad, y: capTop, w: W - hPad * 2, h: Math.round(32 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_LIGHT;
          ctx.font = `600 ${Math.round(26 * scale)}px ${CARD_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(caption, W / 2, capTop);
        },
      });
      y = capTop + Math.round(40 * scale);
    }
    if (subtitle) {
      const subTop = y;
      add({
        id: "subtitle",
        editKind: "element",
        label: "Subtitle",
        natural: { x: hPad, y: subTop, w: W - hPad * 2, h: Math.round(28 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_MUTED;
          ctx.font = `500 ${Math.round(23 * scale)}px ${CARD_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(subtitle, W / 2, subTop);
        },
      });
    }
  }

  // --- Footer (always last so it sits on top) -------------------------------
  add({
    id: "footer",
    editKind: "element",
    label: "Footer",
    natural: { x: 0, y: H - Math.round(48 * scale), w: W, h: Math.round(28 * scale) },
    vAnchor: "bottom",
    selectable: true,
    resizable: false,
    draw: (ctx) =>
      drawFooter(
        ctx,
        W,
        H,
        opts.clubUrl ?? "",
        opts.hashtag ?? defaultHashtag(opts.brand),
        scale,
        p,
      ),
  });

  return layers;
};

// Convert a saved layer's normalised rect (fractions of 1080) into pixels at the
// current size, honouring the vertical anchor.
const savedRectToPx = (s: CardLayoutLayer, H: number): PxRect => {
  const x = (s.x ?? 0) * 1080;
  const w = (s.w ?? 0.2) * 1080;
  const h = (s.h ?? 0.1) * 1080;
  const yTop = (s.y ?? 0) * 1080;
  const y = (s.vAnchor ?? "top") === "bottom" ? H - yTop : yTop;
  return { x, y, w, h };
};

// Build a custom (image/sticker/text) layer from a saved entry. These draw
// directly within their rect (drawsAtNatural = false).
const buildCustomLayer = (
  s: CardLayoutLayer,
  H: number,
  z: number,
  input: ShareCardInput,
  tplCtx: TemplateContext,
): RenderLayer => {
  const rect = savedRectToPx(s, H);
  const label =
    s.kind === "image"
      ? "Image"
      : s.kind === "sticker"
        ? "Shape"
        : s.kind === "libsticker"
          ? (getSticker(s.assetId)?.name ?? "Sticker")
          : "Text";
  return {
    id: s.id,
    editKind: s.kind,
    label,
    natural: { ...rect },
    rect,
    vAnchor: (s.vAnchor ?? "top") as "top" | "bottom",
    z,
    hidden: s.hidden ?? false,
    selectable: true,
    resizable: true,
    drawsAtNatural: false,
    ...(hasLayerEffects(s.effects) ? { effects: s.effects } : {}),
    draw: (ctx) => {
      if (s.kind === "image") return drawCustomImage(ctx, s, rect);
      if (s.kind === "libsticker") return drawCustomLibSticker(ctx, s, rect, input, tplCtx);
      if (s.kind === "sticker") drawCustomSticker(ctx, s, rect);
      else drawCustomText(ctx, s, rect);
      return undefined;
    },
  };
};

const drawCustomImage = async (ctx: CanvasRenderingContext2D, s: CardLayoutLayer, r: PxRect) => {
  if (!s.url) return;
  const img = await loadImage(s.url).catch(() => null);
  if (!img) return;
  const focalX = s.focalX ?? 0.5;
  const focalY = s.focalY ?? 0.5;
  const zoom = s.zoom ?? 1;
  ctx.save();
  if (s.shape === "circle") {
    const rad = Math.min(r.w, r.h) / 2;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawImageCoverFocal(ctx, img, cx - rad, cy - rad, rad * 2, rad * 2, focalX, focalY, zoom);
  } else if (s.fit === "contain") {
    drawImageContain(ctx, img, r.x, r.y, r.w, r.h);
  } else {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.closePath();
    ctx.clip();
    drawImageCoverFocal(ctx, img, r.x, r.y, r.w, r.h, focalX, focalY, zoom);
  }
  ctx.restore();
};

const drawCustomSticker = (ctx: CanvasRenderingContext2D, s: CardLayoutLayer, r: PxRect) => {
  ctx.fillStyle = s.color || "#FBAC27";
  if (s.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.shape === "line") {
    const th = Math.max(2, (s.radius ?? 0.008) * 1080);
    ctx.fillRect(r.x, r.y + r.h / 2 - th / 2, r.w, th);
  } else {
    const rad = (s.radius ?? 0) * r.w;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    ctx.fill();
  }
};

// Draw a built-in library sticker. The asset's own canvas draw fn recolours to
// `color`; data-bound badges auto-fill their text from a card field (falling
// back to a manual override or the asset's default label).
const drawCustomLibSticker = async (
  ctx: CanvasRenderingContext2D,
  s: CardLayoutLayer,
  r: PxRect,
  input: ShareCardInput,
  tplCtx: TemplateContext,
) => {
  const asset = getSticker(s.assetId);
  if (!asset) return;
  let text = asset.defaultText ?? "";
  if (asset.dataBound && s.field) {
    const resolved = resolveTextField(input, s.field, tplCtx);
    if (resolved) text = resolved;
    else if (s.text) text = s.text;
  } else if (s.text) {
    text = s.text;
  }
  const color = s.color || "#FBAC27";
  await asset.draw(ctx, r.x, r.y, r.w, r.h, { color, text });
};

const drawCustomText = (ctx: CanvasRenderingContext2D, s: CardLayoutLayer, r: PxRect) => {
  const px = Math.max(8, (s.fontSize ?? 0.05) * 1080);
  const family =
    extraFontStack(s.fontFamily) ??
    (s.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : CARD_FONT);
  ctx.font = `${s.fontWeight ?? 700} ${px}px ${family}`;
  ctx.fillStyle = s.color || "#F5F2E8";
  ctx.textBaseline = "top";
  const align = s.align ?? "center";
  ctx.textAlign = align;
  let text = s.text ?? "";
  if (s.uppercase) text = text.toUpperCase();
  const lines = wrapText(ctx, text, r.w);
  const lineH = px * 1.15;
  const tx = align === "center" ? r.x + r.w / 2 : align === "right" ? r.x + r.w : r.x;
  lines.forEach((ln, i) => ctx.fillText(ln, tx, r.y + i * lineH));
};

// Apply a saved layout to the freshly built built-in layers: override matching
// `element` rects/z/hidden in place and append custom layers.
export const applyLayout = (
  builtins: RenderLayer[],
  saved: CardLayoutLayer[],
  H: number,
  input: ShareCardInput,
  tplCtx: TemplateContext,
): RenderLayer[] => {
  const byId = new Map(builtins.map((l) => [l.id, l]));
  const customs: RenderLayer[] = [];
  for (const s of saved) {
    if (s.kind === "element") {
      const l = byId.get(s.id);
      if (!l) continue;
      if (
        typeof s.x === "number" &&
        typeof s.y === "number" &&
        typeof s.w === "number" &&
        typeof s.h === "number"
      ) {
        l.rect = savedRectToPx(s, H);
      }
      if (typeof s.z === "number") l.z = s.z;
      if (typeof s.hidden === "boolean") l.hidden = s.hidden;
      if (hasLayerEffects(s.effects)) l.effects = s.effects;
      if (l.photoTransform) {
        l.photoTransform = {
          focalX: typeof s.focalX === "number" ? s.focalX : l.photoTransform.focalX,
          focalY: typeof s.focalY === "number" ? s.focalY : l.photoTransform.focalY,
          zoom: typeof s.zoom === "number" ? s.zoom : l.photoTransform.zoom,
        };
      }
    } else {
      const z = typeof s.z === "number" ? s.z : builtins.length + customs.length;
      customs.push(buildCustomLayer(s, H, z, input, tplCtx));
    }
  }
  return [...builtins, ...customs];
};
