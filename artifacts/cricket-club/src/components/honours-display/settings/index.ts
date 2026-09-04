/**
 * Honours-display settings sections — public barrel (plan.md §5.6).
 *
 * One card per concern on the admin page; every section is presentational
 * over the `HonoursDisplayForm` object returned by
 * `useHonoursDisplaySettings` and renders editors from `../editors`.
 */
export { SkinSection } from "./skin-section";
export { GlobalColoursSection } from "./global-colours-section";
export { KioskSection } from "./kiosk-section";
export { SponsorSection } from "./sponsor-section";
export { PerBoardSection, CompositeSection, CustomGridSection } from "./board-sections";
