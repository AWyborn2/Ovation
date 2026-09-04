/**
 * Carousel sets (Social Studio) — public barrel (plan.md §5.6).
 *
 *   model               WorkingSlide + option lists + mappers
 *   set-list            list + create
 *   use-set-editor      editor state / render helpers / save / export
 *   set-editor          editor page composed of filmstrip, design panel, sources
 *   sources/*           add-slide pickers (match, player, grade leader)
 */
export { SetList } from "./set-list";
export { SetEditor } from "./set-editor";
export { useSetEditor, type SetEditorState } from "./use-set-editor";
export { SlideSourcePicker } from "./sources";
export type { WorkingSlide } from "./model";
