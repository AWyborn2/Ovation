/**
 * Share-card renderer — public barrel.
 *
 * The implementation lives in ./share-card/ (plan.md §5.6). This file only
 * re-exports; it lists names explicitly (rather than `export *`) so the public
 * surface stays exactly the 68 names the 35 importers already use, and the
 * helpers the split promoted to module exports (draw primitives, internal layer
 * plumbing) stay internal to the directory. Add a name here when it is meant
 * to be consumed outside `src/lib/share-card/`.
 *
 * Module map (bottom of the dependency graph first):
 *   types            card input shapes, RenderOptions, theme/motion types
 *   theme            palette derivation (brand → CardTheme → Palette)
 *   fonts            selectable card fonts + ensureCardFonts
 *   text             slugify / wrapText / fitFontSize / headlineFor
 *   draw-primitives  canvas drawing helpers + standard chrome
 *   animation        easing, count-up, animated-card option helpers
 *   layers           layer effects, RenderLayer/EditorLayer, drawLayers
 *   renderers/*      template (BYO), match-summary, pack variants
 *   editor-model     built-in + custom layer construction, applyLayout
 *   compose          bakeLayer, buildBuiltinLayers, computeCardLayers
 *   export           renderShareCard, downloadBlob, cardBaseFilename
 */

export {
  SIZES,
  CARD_KINDS,
  sponsorAppliesToKind,
  DEFAULT_PHOTO_TRANSFORM,
  type CardSize,
  type CardSponsor,
  type StatLine,
  type MatchSummaryTeam,
  type MatchSummaryBatter,
  type MatchSummaryBowler,
  type MatchSummaryInnings,
  type TeamListPlayer,
  type WeekendWrapMatch,
  type LadderRow,
  type ClubLeaderboardLeader,
  type ShareCardInput,
  type CardKind,
  type CardTheme,
  type MotionPreset,
  type PhotoPlacement,
  type PhotoTransform,
  type RenderOptions,
  type CardAudioSpec,
} from "./share-card/types";

export {
  juniorThemeFromBrand,
  isJuniorInput,
  resolvePalette,
  defaultHashtag,
} from "./share-card/theme";

export { CARD_FONT_OPTIONS, ensureCardFonts, type CardFontKey } from "./share-card/fonts";

export { slugify } from "./share-card/text";

export { seasonLabel } from "./season-label";

export { loadImage } from "./share-card/draw-primitives";

export {
  hasLayerEffects,
  DEFAULT_LAYER_EFFECTS,
  BUILTIN_EFFECT_PRESETS,
  applyLayerTransform,
  type LayerTone,
  type LayerMask,
  type LayerGradientDir,
  type LayerEffects,
  type EffectPreset,
  type EditorLayer,
} from "./share-card/layers";

export {
  clamp01,
  easeOutCubic,
  easeOutBack,
  effectiveMotion,
  isAnimatedCard,
  DEFAULT_DURATION_MS,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  MIN_SPEED,
  MAX_SPEED,
  clampDuration,
  effectiveDuration,
  effectiveSpeed,
  type AnimationHandle,
} from "./share-card/animation";

export {
  loadTemplateBg,
  loadSponsorLogos,
  drawTemplateFrame,
} from "./share-card/renderers/template";

export { applyLayout } from "./share-card/editor-model";

export {
  bakeLayer,
  buildBuiltinLayers,
  computeCardLayers,
  type BakedLayer,
} from "./share-card/compose";

export { renderShareCard, downloadBlob, cardBaseFilename } from "./share-card/export";
