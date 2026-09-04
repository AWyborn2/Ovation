// Still PNG export: renderShareCard (template path or layer pipeline), the
// browser download helper and the per-kind base filename.
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import type { TemplateContext } from "../card-template";
import { buildBuiltinLayers } from "./compose";
import { applyLayout } from "./editor-model";
import { ensureCardFonts } from "./fonts";
import { drawLayers } from "./layers";
import { renderTemplateCard } from "./renderers/template";
import { slugify } from "./text";
import { defaultHashtag, isJuniorInput, juniorThemeFromBrand, resolvePalette } from "./theme";
import { SIZES, type RenderOptions, type ShareCardInput } from "./types";

export const renderShareCard = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<Blob> => {
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080; // base = 1080 wide
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  // Ensure web fonts are loaded so canvas text matches the app and the trading
  // card rather than falling back to a system font (see ensureCardFonts).
  await ensureCardFonts();

  // Junior cards force the brown palette regardless of the selected theme so
  // junior content is always visually distinct from the navy senior cards.
  const p = isJuniorInput(input)
    ? resolvePalette(juniorThemeFromBrand(opts.brand), opts.brand)
    : resolvePalette(opts.theme, opts.brand);

  // Custom uploaded template path: render the bg + data-bound slots and bail
  // out before any built-in chrome. Sponsors are overlaid inside the helper.
  // Pack templates skip this — they flow through the built-in layer pipeline.
  if (opts.template && opts.template.source !== "pack") {
    await renderTemplateCard(ctx, W, H, scale, input, opts.template, opts, p);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export canvas to blob"));
      }, "image/png");
    });
  }

  // Build the card as an ordered layer list, then draw. With no saved layout
  // this is pixel-identical to the pre-studio renderer (each layer draws at its
  // natural coords under an identity transform); a saved layout overrides element
  // rects/z/visibility and appends custom image/sticker/text layers. matchSummary
  // collapses to a single full-frame base scorecard layer (still byte-identical
  // when no layout is applied).
  const builtins = await buildBuiltinLayers(input, opts, p, W, H, scale);
  const tplCtx: TemplateContext = {
    clubName: opts.brand?.name ?? DEFAULT_BRAND.name,
    clubUrl: opts.clubUrl ?? "",
    hashtag: opts.hashtag ?? defaultHashtag(opts.brand),
    photoUrl: opts.photoUrl,
  };
  const layers = opts.layout?.length
    ? applyLayout(builtins, opts.layout, H, input, tplCtx)
    : builtins;
  await drawLayers(ctx, layers);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode PNG"));
    }, "image/png");
  });
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const cardBaseFilename = (input: ShareCardInput, brand?: ClubBrand | null): string => {
  const jr = isJuniorInput(input) ? "junior-" : "";
  const clubSlug = slugify(brand?.shortName || brand?.name || "") || "card";
  switch (input.kind) {
    case "milestone":
      return `${clubSlug}-${jr}${slugify(input.playerName)}-${slugify(input.tierLabel)}`;
    case "player":
      return `${clubSlug}-${slugify(input.playerName)}`;
    case "record":
      return `${clubSlug}-record-${slugify(input.title)}-${slugify(input.playerName)}`;
    case "gradeLeader":
      return `${clubSlug}-${slugify(input.grade)}-${slugify(input.category)}-${slugify(input.playerName)}`;
    case "premiership":
      return `${clubSlug}-premiership-${slugify(input.grade)}-${input.year}`;
    case "debut":
      return `${clubSlug}-debut-${slugify(input.grade)}-${slugify(input.playerName)}`;
    case "century":
      return `${clubSlug}-century-${slugify(input.playerName)}-${input.runs}`;
    case "fiveFor":
      return `${clubSlug}-fivefor-${slugify(input.playerName)}-${input.wickets}`;
    case "matchSummary":
      return `${clubSlug}-${jr}match-${slugify(input.club.name)}-vs-${slugify(input.opposition.name)}`;
    case "matchDay":
      return `${clubSlug}-${jr}matchday-${slugify(input.oppositionName)}`;
    case "teamList":
      return `${clubSlug}-${jr}teamlist-${slugify(input.gradeRound)}`;
    case "weekendWrap":
      return `${clubSlug}-${jr}wrap-${slugify(input.roundLabel)}`;
    case "ladder":
      return `${clubSlug}-${jr}ladder-${slugify(input.gradeLabel)}`;
    case "bigMoment":
      return `${clubSlug}-${jr}moment-${slugify(input.playerName)}`;
    case "newSigning":
      return `${clubSlug}-signing-${slugify(input.playerFirstName)}-${slugify(input.playerLastName)}`;
    case "countdown":
      return `${clubSlug}-countdown-${slugify(input.eventLabel)}`;
    case "clubLeaderboard":
      return `${clubSlug}-${jr}leaderboard-${slugify(input.category)}`;
  }
};
