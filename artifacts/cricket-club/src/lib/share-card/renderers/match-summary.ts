// The bespoke two-innings Match Summary scorecard (the built-in, non-pack
// design). Painted onto the single "scorecard" base layer by compose.ts.
import { drawFooter, drawImageContain, drawSponsors, loadImage } from "../draw-primitives";
import { ellipsize, wrapText } from "../text";
import { defaultHashtag, rgba, type Palette } from "../theme";
import type {
  MatchSummaryInnings,
  MatchSummaryTeam,
  RenderOptions,
  ShareCardInput,
} from "../types";

// Self-contained renderer for the two-innings Match Summary scorecard tile.
// Owns its own dark stadium background and team-coloured chrome (so it bypasses
// the standard header/ribbon flow), but still overlays the sponsor strip and
// club footer at the bottom. Adapts across square / portrait / story sizes.
export const renderMatchSummaryCard = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  opts: RenderOptions,
  p: Palette,
) => {
  const isStory = opts.size === "story";
  const sans = "'Helvetica Neue', Arial, sans-serif";
  const serif = "Georgia, 'Times New Roman', serif";
  const padX = Math.round(64 * scale);

  // --- Background: dark stadium gradient + accent glow ---------------------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.bgPanel);
  bg.addColorStop(0.5, p.bgDark);
  bg.addColorStop(1, p.bgDark);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.08, 0, W / 2, H * 0.08, W * 0.85);
  glow.addColorStop(0, rgba(p.accent, 0.1));
  glow.addColorStop(1, rgba(p.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const inset = Math.round(W * 0.022);
  ctx.strokeStyle = rgba(p.accent, 0.45);
  ctx.lineWidth = Math.max(3, Math.round(W * 0.004));
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

  // --- Sponsor strip + footer (drawn first; content stays above) -----------
  const sponsors = opts.sponsors ?? [];
  const sponsorsTop = await drawSponsors(ctx, W, H, sponsors, scale, p);
  drawFooter(ctx, W, H, opts.clubUrl ?? "", opts.hashtag ?? defaultHashtag(opts.brand), scale, p);

  const teamOf = (key: "club" | "opposition") => (key === "club" ? input.club : input.opposition);
  const shortOf = (t: MatchSummaryTeam) => (t.shortName || t.name).toUpperCase();
  const teamScoreText = (key: "club" | "opposition") =>
    input.innings
      .filter((i) => i.teamKey === key)
      .map((i) => `${i.totalRuns}/${i.wickets}${i.declared ? "d" : ""}`)
      .join(" & ");

  // --- Team crest: white-backed logo, else a coloured initials chip --------
  const drawTeamCrest = async (team: MatchSummaryTeam, cx: number, cy: number, r: number) => {
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
    ctx.font = `800 ${Math.round(r * 0.7)}px ${sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials || "?", cx, cy);
  };

  // --- One innings block: team-coloured header bar + batting/bowling cols ---
  const drawInningsBlock = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    inn: MatchSummaryInnings,
    team: MatchSummaryTeam,
  ) => {
    const radius = Math.round(14 * scale);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, radius);
    ctx.fillStyle = rgba(p.textLight, 0.05);
    ctx.fill();
    ctx.strokeStyle = rgba(p.textLight, 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();

    const hb = Math.round((isStory ? 56 : 48) * scale);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, hb, [radius, radius, 0, 0]);
    ctx.fillStyle = team.primaryColor;
    ctx.fill();
    ctx.fillStyle = team.textColor;
    ctx.font = `800 ${Math.round((isStory ? 26 : 22) * scale)}px ${sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(shortOf(team), bx + Math.round(20 * scale), by + hb / 2);
    ctx.textAlign = "right";
    ctx.fillText(
      `${inn.totalRuns}/${inn.wickets}${inn.declared ? "d" : ""}  (${inn.overs})`,
      bx + bw - Math.round(20 * scale),
      by + hb / 2,
    );

    const colTop = by + hb + Math.round(14 * scale);
    const colBottom = by + bh - Math.round(12 * scale);
    const midX = bx + bw / 2;
    const leftLabelX = bx + Math.round(20 * scale);
    const rightLabelX = midX + Math.round(16 * scale);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `800 ${Math.round(15 * scale)}px ${sans}`;
    ctx.fillStyle = p.accent;
    ctx.fillText("BATTING", leftLabelX, colTop);
    ctx.fillText("BOWLING", rightLabelX, colTop);

    const ry = colTop + Math.round(26 * scale);
    const rowH = Math.round((isStory ? 34 : 30) * scale);
    const maxRows = Math.max(0, Math.floor((colBottom - ry) / rowH));
    if (maxRows === 0) return;
    const nameFont = `600 ${Math.round((isStory ? 20 : 17) * scale)}px ${sans}`;
    const valFont = `700 ${Math.round((isStory ? 20 : 17) * scale)}px ${sans}`;
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

  // --- Header: eyebrow, title, meta, crests + VS ---------------------------
  let y = Math.round(58 * scale);
  ctx.fillStyle = p.accent;
  ctx.font = `800 ${Math.round((isStory ? 30 : 24) * scale)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(input.junior ? "JUNIOR MATCH" : "MATCH SUMMARY", W / 2, y);
  y += Math.round((isStory ? 48 : 38) * scale);

  ctx.fillStyle = p.textLight;
  ctx.font = `700 ${Math.round((isStory ? 60 : 48) * scale)}px ${serif}`;
  const titleLines = wrapText(ctx, input.matchTitle, W - padX * 2);
  const titleLineH = Math.round((isStory ? 66 : 54) * scale);
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * titleLineH));
  y += titleLines.length * titleLineH + Math.round(10 * scale);

  const meta = [input.matchType, input.date, input.venue].filter(Boolean).join("   •   ");
  if (meta) {
    ctx.fillStyle = p.textMuted;
    ctx.font = `500 ${Math.round((isStory ? 24 : 20) * scale)}px ${sans}`;
    ctx.fillText(meta, W / 2, y);
    y += Math.round((isStory ? 42 : 34) * scale);
  }

  y += Math.round(10 * scale);
  const crestR = Math.round((isStory ? 64 : 52) * scale);
  const vsGap = Math.round((isStory ? 130 : 104) * scale);
  const crestCy = y + crestR;
  const leftCx = W / 2 - vsGap;
  const rightCx = W / 2 + vsGap;
  await drawTeamCrest(input.club, leftCx, crestCy, crestR);
  await drawTeamCrest(input.opposition, rightCx, crestCy, crestR);
  ctx.fillStyle = p.accent;
  ctx.font = `800 ${Math.round((isStory ? 42 : 34) * scale)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", W / 2, crestCy);
  ctx.fillStyle = p.textLight;
  ctx.font = `700 ${Math.round((isStory ? 24 : 20) * scale)}px ${sans}`;
  ctx.textBaseline = "top";
  const crestLabelY = crestCy + crestR + Math.round(10 * scale);
  ctx.fillText(shortOf(input.club), leftCx, crestLabelY);
  ctx.fillText(shortOf(input.opposition), rightCx, crestLabelY);
  y = crestLabelY + Math.round((isStory ? 44 : 38) * scale);

  // Story format gets per-team score-summary boxes under the crests.
  if (isStory) {
    const boxGap = Math.round(20 * scale);
    const boxW = (W - padX * 2 - boxGap) / 2;
    const boxH = Math.round(108 * scale);
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
      ctx.font = `700 ${Math.round(20 * scale)}px ${sans}`;
      ctx.fillText(shortOf(team), x + Math.round(24 * scale), y + Math.round(22 * scale));
      ctx.fillStyle = p.textLight;
      ctx.font = `800 ${Math.round(40 * scale)}px ${serif}`;
      ctx.fillText(
        teamScoreText(key) || "—",
        x + Math.round(24 * scale),
        y + Math.round(52 * scale),
      );
    });
    y += boxH + Math.round(28 * scale);
  }

  // --- Result banner (winner-coloured) above the sponsor/footer area -------
  const resultBannerH = Math.round((isStory ? 92 : 76) * scale);
  const contentBottom = sponsorsTop - Math.round(20 * scale);
  const resultBannerY = contentBottom - resultBannerH;
  const winnerTeam =
    input.resultWinner === "club"
      ? input.club
      : input.resultWinner === "opposition"
        ? input.opposition
        : null;
  ctx.beginPath();
  ctx.roundRect(padX, resultBannerY, W - padX * 2, resultBannerH, Math.round(12 * scale));
  ctx.fillStyle = winnerTeam ? winnerTeam.primaryColor : p.accent;
  ctx.fill();
  ctx.fillStyle = winnerTeam ? winnerTeam.textColor : p.bgDark;
  ctx.font = `800 ${Math.round((isStory ? 30 : 25) * scale)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const resLines = wrapText(ctx, input.result.toUpperCase(), W - padX * 2 - Math.round(48 * scale));
  const resLineH = Math.round((isStory ? 36 : 30) * scale);
  const resStart = resultBannerY + resultBannerH / 2 - ((resLines.length - 1) * resLineH) / 2;
  resLines.forEach((l, i) => ctx.fillText(l, W / 2, resStart + i * resLineH));

  // --- Innings blocks, distributed between the header and the result banner -
  const innings = input.innings.slice(0, 4);
  const n = innings.length;
  if (n > 0) {
    const inningsAreaTop = y;
    const inningsAreaBottom = resultBannerY - Math.round(20 * scale);
    const blockGap = Math.round(16 * scale);
    const areaH = Math.max(0, inningsAreaBottom - inningsAreaTop);
    const blockH = (areaH - blockGap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const inn = innings[i];
      const by = inningsAreaTop + i * (blockH + blockGap);
      drawInningsBlock(padX, by, W - padX * 2, blockH, inn, teamOf(inn.teamKey));
    }
  }
};
