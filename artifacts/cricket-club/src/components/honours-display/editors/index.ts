/**
 * Honours-display admin editors — public barrel (plan.md §5.6).
 *
 * Each editor owns one piece of the display settings (a skin, a board's
 * overrides, a composite / custom-grid definition, an ad creative, the kiosk
 * link). They are leaf components: they receive the current value and emit
 * patches; the page-level hook (`../use-honours-display-settings`) owns state.
 */
export { FONT_OPTIONS, TEXT_SIZES, type SkinOption } from "./constants";
export { ColourField } from "./colour-field";
export { BackgroundPicker } from "./background-picker";
export { SkinEditor } from "./skin-editor";
export { BoardConfigEditor } from "./board-config-editor";
export { CompositeEditor } from "./composite-editor";
export { CustomGridEditor } from "./custom-grid-editor";
export { AdEditor } from "./ad-editor";
export { KioskLinkCard } from "./kiosk-link-card";
