/**
 * Pack renderer (U3).
 *
 * Binds a `ShareCardInput` into a Pack A ("Broadcast Dark") template and
 * produces a self-contained, native-size HTML card string. The output is a
 * single positioned root element carrying the theme tokens as CSS custom
 * properties; `PackCard` mounts it scaled via `transform: scale()` and the
 * server-side still/PNG harness (U4) mounts it unscaled.
 *
 * The renderer is DOM-free and pure — safe to run in the browser preview and in
 * the headless render page alike. It never trusts input text: every substituted
 * value is HTML-escaped (security invariant — do not remove).
 */

/**
 * Public barrel (plan.md §5.6). The implementation lives in ./pack-render/;
 * this file re-exports the names importers use and keeps the html/bind
 * plumbing internal to the directory.
 *
 * Module map (bottom of the dependency graph first):
 *   types        PackTokens, PackCardData, PackImageSlot, internal bound shapes
 *   templates    design index per pack, format selection, image-slot enumeration
 *   tokens       token priority merge, brand bridge, fonts, native sizes, root style
 *   html-utils   escaping, balanced-div scanning, repeats, slots, cleanups
 *   bind         ShareCardInput → values/rows/images + tenant-data overlay
 *   render       renderPackCard
 */

export {
  JUNIOR_PANEL,
  type PackTokens,
  type PackPhotoPlacement,
  type PackCardData,
  type PackImageSlot,
} from "./pack-render/types";

export {
  PACK_OVERRIDE_HIDDEN_SLOTS,
  packImageSlots,
  packSupportsKind,
} from "./pack-render/templates";

export {
  type CardThemeLike,
  tokensFromCardTheme,
  type PackTokenSources,
  resolvePackTokens,
  PACK_DEFAULT_TOKENS,
  normaliseBrandHex,
  brandDefaultTokens,
  DISPLAY_FONT_FAMILY,
  packNativeSize,
} from "./pack-render/tokens";

export { renderPackCard } from "./pack-render/render";
