// Pack ("Broadcast Dark") Match Summary renderers — square / portrait / story.
import { drawFooter, drawImageContain, drawSponsors, loadImage } from "../draw-primitives";
import { ellipsize, wrapText } from "../text";
import { defaultHashtag, rgba, type Palette } from "../theme";
import type {
  MatchSummaryInnings,
  MatchSummaryTeam,
  RenderOptions,
  ShareCardInput,
} from "../types";

// ===========================================================================
// Pack renderers — Match Summary designs (square / portrait / story)
// ---------------------------------------------------------------------------
// Three canvas-rendered match summary card variants registered as "pack"
// templates. They share a visual language (dark gradient, accent glow, team
// crests, innings breakdowns) but adapt density and spacing to the canvas size.
// The primary font is Roboto Condensed (loaded via card-fonts.ts).
// ===========================================================================

const PACK_FONT = "'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";
const PACK_FONT_SERIF = "Georgia, 'Times New Roman', serif";

// Shared helper: draw the dark gradient background + accent glow + inset border
// common to all three pack variants.
const drawPackBackground = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: Palette,
  clubPrimary: string,
) => {
  // Dark gradient base
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.bgPanel);
  bg.addColorStop(0.5, p.bgDark);
  bg.addColorStop(1, p.bgDark);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Club primary colour as a subtle radial glow at top
  const glow = ctx.createRadialGradient(W / 2, H * 0.06, 0, W / 2, H * 0.06, W * 0.9);
  glow.addColorStop(0, rgba(clubPrimary, 0.12));
  glow.addColorStop(1, rgba(clubPrimary, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Thin accent-coloured inset border
  const inset = Math.round(W * 0.022);
  ctx.strokeStyle = rgba(p.accent, 0.45);
  ctx.lineWidth = Math.max(3, Math.round(W * 0.004));
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
};

// Shared helper: draw a team crest (circular logo with white bg, or initials
// chip fallback). Mirrors the pattern from renderMatchSummaryCard.
const drawPackTeamCrest = async (
  ctx: CanvasRenderingContext2D,
  team: MatchSummaryTeam,
  cx: number,
  cy: number,
  r: number,
  scale: number,
) => {
  if (team.logoUrl) {
    try {
      const img = await loadImage(team.logoUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.clip();
      drawImageContain(ctx, img, cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = team.primaryColor;
      ctx.lineWidth = Math.round(4 * scale);
      ctx.stroke();
      return;
    } catch {
      // fall through to initials chip
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = team.primaryColor;
  ctx.fill();
  ctx.strokeStyle = rgba("#ffffff", 0.35);
  ctx.lineWidth = Math.round(3 * scale);
  ctx.stroke();
  const initials = (team.shortName || team.name)
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  ctx.fillStyle = team.textColor;
  ctx.font = `800 ${Math.round(r * 0.7)}px ${PACK_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials || "?", cx, cy);
};

// Shared helper: draw a single innings block for the pack cards.
const drawPackInningsBlock = (
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  inn: MatchSummaryInnings,
  team: MatchSummaryTeam,
  scale: number,
  p: Palette,
  maxPerformers: number,
) => {
  const radius = Math.round(14 * scale);
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, radius);
  ctx.fillStyle = rgba(p.textLight, 0.05);
  ctx.fill();
  ctx.strokeStyle = rgba(p.textLight, 0.1);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Team-coloured header bar
  const hb = Math.round(50 * scale);
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, hb, [radius, radius, 0, 0]);
  ctx.fillStyle = team.primaryColor;
  ctx.fill();
  const shortName = (team.shortName || team.name).toUpperCase();
  ctx.fillStyle = team.textColor;
  ctx.font = `700 ${Math.round(24 * scale)}px ${PACK_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(shortName, bx + Math.round(20 * scale), by + hb / 2);
  ctx.textAlign = "right";
  ctx.fillText(
    `${inn.totalRuns}/${inn.wickets}${inn.declared ? "d" : ""}  (${inn.overs})`,
    bx + bw - Math.round(20 * scale),
    by + hb / 2,
  );

  // Batting / bowling columns below the header
  const colTop = by + hb + Math.round(14 * scale);
  const colBottom = by + bh - Math.round(12 * scale);
  const midX = bx + bw / 2;
  const leftLabelX = bx + Math.round(20 * scale);
  const rightLabelX = midX + Math.round(16 * scale);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(14 * scale)}px ${PACK_FONT}`;
  ctx.fillStyle = p.accent;
  ctx.fillText("BATTING", leftLabelX, colTop);
  ctx.fillText("BOWLING", rightLabelX, colTop);

  const ry = colTop + Math.round(24 * scale);
  const rowH = Math.round(30 * scale);
  const maxRows = Math.min(maxPerformers, Math.max(0, Math.floor((colBottom - ry) / rowH)));
  if (maxRows === 0) return;
  const nameFont = `500 ${Math.round(17 * scale)}px ${PACK_FONT}`;
  const valFont = `700 ${Math.round(17 * scale)}px ${PACK_FONT}`;
  const leftValX = midX - Math.round(18 * scale);
  const rightValX = bx + bw - Math.round(20 * scale);
  const batters = inn.topBatters.slice(0, maxRows);
  const bowlers = inn.topBowlers.slice(0, maxRows);
  for (let i = 0; i < maxRows; i++) {
    const yy = ry + i * rowH;
    const b = batters[i];
    if (b) {
      ctx.font = valFont;
      const bv = `${b.runs}${b.notOut ? "*" : ""}${b.balls != null ? ` (${b.balls})` : ""}`;
      const bvW = ctx.measureText(bv).width;
      ctx.font = nameFont;
      ctx.textAlign = "left";
      ctx.fillStyle = p.textLight;
      ctx.fillText(
        ellipsize(ctx, b.name, leftValX - leftLabelX - bvW - Math.round(12 * scale)),
        leftLabelX,
        yy,
      );
      ctx.font = valFont;
      ctx.textAlign = "right";
      ctx.fillStyle = p.accent;
      ctx.fillText(bv, leftValX, yy);
    }
    const w = bowlers[i];
    if (w) {
      ctx.font = valFont;
      const wv = `${w.wickets}/${w.runs} (${w.overs})`;
      const wvW = ctx.measureText(wv).width;
      ctx.font = nameFont;
      ctx.textAlign = "left";
      ctx.fillStyle = p.textLight;
      ctx.fillText(
        ellipsize(ctx, w.name, rightValX - rightLabelX - wvW - Math.round(12 * scale)),
        rightLabelX,
        yy,
      );
      ctx.font = valFont;
      ctx.textAlign = "right";
      ctx.fillStyle = p.accent;
      ctx.fillText(wv, rightValX, yy);
    }
  }
};

// Shared helper: draw the result banner at the bottom of a pack card.
const drawPackResultBanner = (
  ctx: CanvasRenderingContext2D,
  W: number,
  bannerY: number,
  bannerH: number,
  padX: number,
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  scale: number,
  p: Palette,
) => {
  const winnerTeam =
    input.resultWinner === "club"
      ? input.club
      : input.resultWinner === "opposition"
        ? input.opposition
        : null;
  ctx.beginPath();
  ctx.roundRect(padX, bannerY, W - padX * 2, bannerH, Math.round(12 * scale));
  ctx.fillStyle = winnerTeam ? winnerTeam.primaryColor : p.accent;
  ctx.fill();
  ctx.fillStyle = winnerTeam ? winnerTeam.textColor : p.bgDark;
  ctx.font = `700 ${Math.round(26 * scale)}px ${PACK_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const resLines = wrapText(ctx, input.result.toUpperCase(), W - padX * 2 - Math.round(48 * scale));
  const resLineH = Math.round(32 * scale);
  const resStart = bannerY + bannerH / 2 - ((resLines.length - 1) * resLineH) / 2;
  resLines.forEach((l, i) => ctx.fillText(l, W / 2, resStart + i * resLineH));
};

// ---- Pack Match Summary (unified renderer) ---------------------------------
type PackMatchSummaryLayout = {
  topPad: number;
  eyebrowFont: number;
  eyebrowGap: number;
  titleFont: number;
  titleLineH: number;
  titleGap: number;
  typeFont: number;
  typeGap: number;
  metaFont: number;
  metaGap: number;
  crestPreGap: number;
  crestR: number;
  vsGap: number;
  vsFont: number;
  labelFont: number;
  labelGapAbove: number;
  labelGapBelow: number;
  resultH: number;
  contentGap: number;
  blockGap: number;
  inningsGap: number;
  performers: number;
  scoreBoxes?: boolean;
};

const PACK_LAYOUTS: Record<string, PackMatchSummaryLayout> = {
  square: {
    topPad: 48,
    eyebrowFont: 18,
    eyebrowGap: 28,
    titleFont: 40,
    titleLineH: 46,
    titleGap: 4,
    typeFont: 20,
    typeGap: 26,
    metaFont: 18,
    metaGap: 28,
    crestPreGap: 6,
    crestR: 44,
    vsGap: 96,
    vsFont: 30,
    labelFont: 18,
    labelGapAbove: 8,
    labelGapBelow: 32,
    resultH: 68,
    contentGap: 16,
    blockGap: 12,
    inningsGap: 14,
    performers: 2,
  },
  portrait: {
    topPad: 56,
    eyebrowFont: 20,
    eyebrowGap: 32,
    titleFont: 48,
    titleLineH: 54,
    titleGap: 6,
    typeFont: 22,
    typeGap: 30,
    metaFont: 20,
    metaGap: 34,
    crestPreGap: 10,
    crestR: 56,
    vsGap: 110,
    vsFont: 34,
    labelFont: 20,
    labelGapAbove: 10,
    labelGapBelow: 38,
    resultH: 76,
    contentGap: 18,
    blockGap: 14,
    inningsGap: 16,
    performers: 3,
  },
  story: {
    topPad: 72,
    eyebrowFont: 22,
    eyebrowGap: 36,
    titleFont: 56,
    titleLineH: 64,
    titleGap: 8,
    typeFont: 26,
    typeGap: 36,
    metaFont: 22,
    metaGap: 40,
    crestPreGap: 14,
    crestR: 64,
    vsGap: 130,
    vsFont: 40,
    labelFont: 22,
    labelGapAbove: 12,
    labelGapBelow: 42,
    resultH: 88,
    contentGap: 20,
    blockGap: 16,
    inningsGap: 20,
    performers: 3,
    scoreBoxes: true,
  },
};

const renderPackMatchSummary = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  opts: RenderOptions,
  p: Palette,
  L: PackMatchSummaryLayout,
) => {
  drawPackBackground(ctx, W, H, p, input.club.primaryColor);

  const sponsors = opts.sponsors ?? [];
  const sponsorsTop = await drawSponsors(ctx, W, H, sponsors, scale, p);
  drawFooter(ctx, W, H, opts.clubUrl ?? "", opts.hashtag ?? defaultHashtag(opts.brand), scale, p);

  const padX = Math.round(56 * scale);
  let y = Math.round(L.topPad * scale);

  if (input.junior) {
    ctx.fillStyle = "#FBAC27";
    ctx.font = `700 ${Math.round(L.eyebrowFont * scale)}px ${PACK_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("JUNIOR MATCH", W / 2, y);
    y += Math.round(L.eyebrowGap * scale);
  }

  ctx.fillStyle = p.textLight;
  ctx.font = `700 ${Math.round(L.titleFont * scale)}px ${PACK_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const titleLines = wrapText(ctx, input.matchTitle, W - padX * 2);
  const titleLineH = Math.round(L.titleLineH * scale);
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * titleLineH));
  y += titleLines.length * titleLineH + Math.round(L.titleGap * scale);

  if (input.matchType) {
    ctx.fillStyle = p.accent;
    ctx.font = `600 ${Math.round(L.typeFont * scale)}px ${PACK_FONT}`;
    ctx.fillText(input.matchType, W / 2, y);
    y += Math.round(L.typeGap * scale);
  }

  const meta = [input.date, input.venue].filter(Boolean).join("   |   ");
  if (meta) {
    ctx.fillStyle = p.textMuted;
    ctx.font = `400 ${Math.round(L.metaFont * scale)}px ${PACK_FONT}`;
    ctx.fillText(meta, W / 2, y);
    y += Math.round(L.metaGap * scale);
  }

  y += Math.round(L.crestPreGap * scale);
  const crestR = Math.round(L.crestR * scale);
  const vsGap = Math.round(L.vsGap * scale);
  const crestCy = y + crestR;
  const leftCx = W / 2 - vsGap;
  const rightCx = W / 2 + vsGap;
  await drawPackTeamCrest(ctx, input.club, leftCx, crestCy, crestR, scale);
  await drawPackTeamCrest(ctx, input.opposition, rightCx, crestCy, crestR, scale);
  ctx.fillStyle = p.accent;
  ctx.font = `700 ${Math.round(L.vsFont * scale)}px ${PACK_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", W / 2, crestCy);

  ctx.fillStyle = p.textLight;
  ctx.font = `600 ${Math.round(L.labelFont * scale)}px ${PACK_FONT}`;
  ctx.textBaseline = "top";
  const shortOf = (t: MatchSummaryTeam) => (t.shortName || t.name).toUpperCase();
  const crestLabelY = crestCy + crestR + Math.round(L.labelGapAbove * scale);
  ctx.fillText(shortOf(input.club), leftCx, crestLabelY);
  ctx.fillText(shortOf(input.opposition), rightCx, crestLabelY);
  y = crestLabelY + Math.round(L.labelGapBelow * scale);

  const teamOf = (key: "club" | "opposition") => (key === "club" ? input.club : input.opposition);

  if (L.scoreBoxes) {
    const teamScoreText = (key: "club" | "opposition") =>
      input.innings
        .filter((i) => i.teamKey === key)
        .map((i) => `${i.totalRuns}/${i.wickets}${i.declared ? "d" : ""}`)
        .join(" & ");
    const boxGap = Math.round(20 * scale);
    const boxW = (W - padX * 2 - boxGap) / 2;
    const boxH = Math.round(100 * scale);
    (["club", "opposition"] as const).forEach((key, i) => {
      const team = teamOf(key);
      const x = padX + i * (boxW + boxGap);
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, Math.round(12 * scale));
      ctx.fillStyle = rgba(team.primaryColor, 0.18);
      ctx.fill();
      ctx.strokeStyle = rgba(team.primaryColor, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = team.primaryColor;
      ctx.fillRect(
        x,
        y + Math.round(14 * scale),
        Math.round(6 * scale),
        boxH - Math.round(28 * scale),
      );
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = p.textMuted;
      ctx.font = `600 ${Math.round(20 * scale)}px ${PACK_FONT}`;
      ctx.fillText(shortOf(team), x + Math.round(24 * scale), y + Math.round(18 * scale));
      ctx.fillStyle = p.textLight;
      ctx.font = `700 ${Math.round(36 * scale)}px ${PACK_FONT_SERIF}`;
      ctx.fillText(
        teamScoreText(key) || "—",
        x + Math.round(24 * scale),
        y + Math.round(50 * scale),
      );
    });
    y += boxH + Math.round(28 * scale);
  }

  const resultBannerH = Math.round(L.resultH * scale);
  const contentBottom = sponsorsTop - Math.round(L.contentGap * scale);
  const resultBannerY = contentBottom - resultBannerH;
  drawPackResultBanner(ctx, W, resultBannerY, resultBannerH, padX, input, scale, p);

  const innings = input.innings.slice(0, 4);
  const n = innings.length;
  if (n > 0) {
    const inningsAreaTop = y;
    const inningsAreaBottom = resultBannerY - Math.round(L.inningsGap * scale);
    const blockGap = Math.round(L.blockGap * scale);
    const areaH = Math.max(0, inningsAreaBottom - inningsAreaTop);
    const blockH = (areaH - blockGap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const inn = innings[i];
      const by = inningsAreaTop + i * (blockH + blockGap);
      drawPackInningsBlock(
        ctx,
        padX,
        by,
        W - padX * 2,
        blockH,
        inn,
        teamOf(inn.teamKey),
        scale,
        p,
        L.performers,
      );
    }
  }
};

type PackVariantRenderer = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  opts: RenderOptions,
  p: Palette,
) => Promise<void>;

export const renderPackSquareMatchSummary: PackVariantRenderer = (
  ctx,
  W,
  H,
  scale,
  input,
  opts,
  p,
) => renderPackMatchSummary(ctx, W, H, scale, input, opts, p, PACK_LAYOUTS.square);
export const renderPackPortraitMatchSummary: PackVariantRenderer = (
  ctx,
  W,
  H,
  scale,
  input,
  opts,
  p,
) => renderPackMatchSummary(ctx, W, H, scale, input, opts, p, PACK_LAYOUTS.portrait);
export const renderPackStoryMatchSummary: PackVariantRenderer = (
  ctx,
  W,
  H,
  scale,
  input,
  opts,
  p,
) => renderPackMatchSummary(ctx, W, H, scale, input, opts, p, PACK_LAYOUTS.story);
