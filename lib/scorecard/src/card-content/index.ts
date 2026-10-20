/** `@workspace/scorecard/card-content` — the content contract (ADR-010). */
export * from "./types";
export * from "./settings";
export * from "./match-day";
export * from "./render-input";
export * from "./validate";
export {
  CONTENT_FIELDS,
  CONTENT_KINDS,
  CONTENT_PRESETS,
  CONTENT_PRESET_LABELS,
  contentFields,
  isContentKind,
  isContentPreset,
  type ContentFieldDef,
  type ContentKind,
  type ContentPreset,
  type ContentSlide,
} from "../kind-templates/fields";
