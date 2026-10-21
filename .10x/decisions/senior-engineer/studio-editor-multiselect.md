# Senior Engineer — studio-editor-multiselect

**Date:** 2026-10-21
**Request (Ash):** "When adding new images or elements, I want to be able to copy and paste, or select both elements and match size or resize them together."
**Where:** the Studio editor shell, in both modes: the card kind template editor (`/admin/social/templates/:kind`, `pages/admin-kind-template-editor.tsx`) and the per-draft editor (`pages/admin-studio-editor.tsx`).

## What the code did before (read 2026-10-21)

- Selection is an id array held by each page. Clicking a layer selects its whole group unless you're editing inside it (`selectionFor`). Shift-click toggled (`toggleSelection`), and several selected layers moved together. Single layers had 8 resize handles plus a rotate handle. There was no resize, match or align for several layers.
- Duplicate (`document.duplicate`, Ctrl+D) offset copies by 2% on the current size, gave them new ids and a new group, and left them unlocked. In template mode the page then made each copy `onlyOnSize`.
- History is JSON snapshots (`history.ts`). `edit()` commits one step, and canvas gestures `replace` then `commitFrom(base)`, so each gesture is one step.
- Geometry is per size (`geometry[size]` + `editedAt[size]`); `setBoxes` touches only one size. Template layers also have `sizes`, and new ones go on the current size followed by an "Add to other sizes" offer, which folds into the same undo step. There is no "all sizes" editing mode.
- **Style is shared across sizes.** `style.fontSize` (percent of the artboard width) is one value per layer.
- List rows (`kind: "rows"`) are one layer. Their cells aren't selectable on the canvas and are edited in List settings (`rows-panel.tsx`). The renderer already supports `cell.show: "image" | "backdrop"`, and the Club Kit Team of the Week starter uses an image cell for each player's photo. List settings couldn't set `show`, y or h, and the editor's sample players had `photoUrl: null`, so the photo cell rendered nothing while designing.
- Ash's screenshot shows the **Card photo** layer (the one frame photo) placed over the first player. It is not a list cell.

## Decisions with Ash (2026-10-21, asked one at a time)

1. **Photo copies → each player's own photo.** Copy and paste works for any layer, but a pasted Card photo still shows the one frame photo, and the editor says so once there are two or more. A photo per player comes from the list's Photo cell. List settings now offers "Show as: Text / Photo / Panel" plus Top and Height. The template editor's sample players get a stand-in photo, so the cell is visible while designing.
2. **Group resize → text scales too** from a corner. Edges stretch boxes only, and Match never touches type.
3. **Text and sizes → scale text everywhere.** Font size is shared by every size and only boxes are per size. So a corner group resize changes the boxes on the current size and the type on every size. While dragging, the bounds label reads "Text size applies to all sizes". No schema change.

## Approaches considered

| Approach                                                                     | Verdict                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure helpers (`arrange.ts`, `clipboard.ts`) + thin wiring in both pages      | **Chosen.** Matches `document.ts` / `template-ops.ts`, unit-testable, one edit per action = one undo step                                                          |
| A shared `useEditorSelection` hook owning selection, clipboard and shortcuts | Would remove duplication between the two pages, but they differ in delete, add and paste semantics, and history/slide handling. A bigger refactor than the request |
| System clipboard (`navigator.clipboard`) with a custom MIME type             | Needs permissions and async reads, and a paste could carry another site's data. Session storage meets "same browser session"                                       |
| Per-size type scale stored in `LayerBox` (`scale`)                           | Would keep text per size, but touches the validator, renderer, fit step and server. Ash chose shared type instead                                                  |

## Implementation (files)

- `components/studio-editor/arrange.ts`: `arrangeable`, `unitCount`, `mapBox`, `resizeBounds` (a corner keeps proportions and pins the opposite corner; edges stretch; min 2%), `resizeGroup` (scales from the gesture's start layers, so type never compounds), `scaleLayerType` (fontSize, rows rowHeight/gap/cell and variant type, clamped to the validator's limits), `matchSize` (first-selected or largest; width, height or both; keeps each centre), `align` (to the selection's bounds, or to the page for one unit), `distribute` (3+, outermost fixed, equal gaps), `selectAll`, `contains` (marquee). Groups are units unless you're editing inside them. Locked, hidden and off-size layers are skipped.
- `components/studio-editor/clipboard.ts`: `copyLayers` (stacking order, box at the copy size only), `writeClipboard`/`readClipboard` (session storage keyed by mode, with an in-memory fallback), `pasteLayers(doc, clip, size, { kind, onlyOnSize })`. Boxes are placed across sizes with `placeBoxOnSize`; a paste that would land exactly on an existing box at that size moves by 2% steps until it doesn't (so pastes cascade); copies get new ids, new groups, and are unlocked and shown. With `kind`, copies failing `templateDocumentErrors` for that kind are skipped and counted.
- **Clipboard modes:** `template` (the template editor _and_ drafts made from a template, since they share fields) and `draft` (pack drafts).
- **List-row children / bound fields:** a copy of a list copies the whole list with its repeat binding. Cells aren't canvas-selectable. A copied `{{token}}` or `bind` keeps its binding. The Card photo stays the one photo.
- `canvas.tsx`: ctrl/meta-click toggles like shift. Group handles on the multi-bounds (`Resize selection <h>`). Marquee from the empty card or from the canvas around it (`marqueeArea` ref = the page's `<main>`; only when the press lands on the area itself, not its toolbars). It picks layers **wholly inside** the box, so the starters' full-card background isn't swept up. The marquee runs through window listeners.
- `layers-drawer.tsx`: `onSelect(ids, "replace" | "toggle" | "add")`; ctrl/meta toggles, shift selects the range from the last clicked row.
- `toolbar.tsx` + `arrange-menu.tsx`: Arrange popover (6 aligns + 2 distribute; Match width/height/size to First selected/Largest), Copy, Paste (also shown with nothing selected). The Arrange labels are "Align left edges" and so on, because "Align left" is the text style bar's.
- `shortcuts.ts`: Ctrl/Cmd+C, X, V, A. The pages let the browser keep copy/cut when nothing is selected, and paste when the clipboard is empty.
- `rows-panel.tsx`: `isImageRowField` (`/photo$/i`), "Show as", Top and Height. Picking a photo field sets `show: "image"`.
- `lib/kind-templates/samples.ts`: `previewSample`/`stressSample` give rows with an empty `photoUrl` the `PREVIEW_PHOTO` stand-in. The shared `sampleCardInput` (gallery, composer) is unchanged.

## Edge cases covered

- Undo: every toolbar action is one `edit()`. Group resize is a canvas gesture (`commitFrom`), and so are pastes in template mode (the add-to-sizes offer folds in).
- Paste into a size other than the copy's: placed like "Add to other sizes"; in template mode it lands on this size only and offers the rest.
- Paste into another kind's template: copies using fields or a list that card lacks are skipped, and a note says how many.
- Junior cards: the list photo cell keeps the renderer's ADR-007 gate (no photo without the positive marker); the template-lint test still asserts that.

## Testing

- Unit: `__tests__/arrange.test.ts` (17), `__tests__/clipboard.test.ts` (8), shortcut and `selectMany` cases in `editor-core.test.ts`, `rows-photo-cell.test.tsx` (3), `samples.test.ts` (row photos).
- Interaction: `template-mode.test.tsx` (paste across templates and sizes with the offer and one undo; ctrl-click + Match size saved; marquee wholly inside, from the card and from the canvas; corner group resize scales boxes and type and saves; edge resize undoes in one step; Layers drawer ctrl/shift; the Card photo note). `editor-page.test.tsx` (Ctrl+C/V cascade, Ctrl+X, the Paste button, ctrl-click + Align top as one undo).
- Browser (local dev server, `vite.local.config.ts` with template fakes): add Card photo, corner resize, Ctrl+C/V offset with the offer, ctrl-click "2 selected" with group handles, Arrange → Largest → Size, align; marquee from the canvas picked the 4 header layers and not the background; header corner resize scaled text and Ctrl+Z restored it; the TOTW list now shows a photo slot per player.

## Follow-ups (not in this PR)

- The two pages duplicate selection, clipboard and keyboard wiring. A `useEditorSelection` hook is worth doing when the template library (ADR-011) adds a third editor surface.
- Smart guides don't snap during a group resize, and rotation isn't group-aware (rotated boxes map by their unrotated box).
- Per-size type scale, if Ash later wants text to differ between sizes.
