---
name: Social Studio unified template model
description: How card_templates now carries both background (BYO) and layer-editor templates, and how a per-kind default template is consumed at render time.
---

# Unified card template model (Social Studio)

`card_templates` is the ONE table for every reusable card design — it was NOT split into a new table. A `source` column distinguishes the two kinds:

- `source = "background"` — the original BYO design: `backgroundImageUrl` + `slots` (+ bg kind/video). Feeds `opts.template`.
- `source = "layers"` — a layer-editor design: `layers` (CardLayoutLayer[]), `baseKind` (kind it was authored against, for preview/field context), `backgroundImageUrl` nullable. Feeds `opts.layout`.

Assignment vs default:
- `cardKinds[]` = card types the template is *assigned to* (empty = all). Drives `templateAppliesToKind`.
- `defaultForKinds[]` = card types this template is the *default* for. Replaced the old single global `isDefault` flag for consumption (the column still exists for legacy fallback).

**One default per kind is enforced server-side** in `routes/social-cards.ts` via `clearDefaultKinds(tx, kinds, exceptId?)` — called on create AND update; it strips the incoming kinds out of every *other* template's `defaultForKinds`. Don't try to enforce this only on the client.

## Consumption (the important precedence)
All render consumption is client-side in `share-card-modal.tsx` (queue + on-demand both route through ShareCardModal; server video render just receives the already-resolved options).

Precedence for a kind K when the modal has no explicit pick:
1. default template for K (`defaultForKinds.includes(K)`, legacy `isDefault` fallback) → auto-selected via `layoutId`
2. `card_layouts[K]` (per-kind "edit the built-in" override) → `savedLayout`
3. pristine built-in

**Why the split matters:** a selected template is ONE `selectedTemplate` pick, but its destination depends on `source`. In `buildOpts`: `bgTemplate = source==="layers" ? null : selectedTemplate` → `opts.template`; `templateLayers = source==="layers" ? layers : null` → `opts.layout = templateLayers ?? savedLayout`. `isAnimatedCard` must use `bgTemplate`, not `selectedTemplate`, or a layer template wrongly counts as a video bg.

`card_layouts` (per-kind built-in override) is a DISTINCT path from named templates — "Edit built-in" in the Studio writes there; "New/Edit template" writes to `card_templates`.

## Editor reuse
`CardLayoutEditor` has three modes off two flags: uncontrolled (persists to `card_layouts`), controlled (`onSaveLayout`, used by carousel slides), and `templateMode` (named template — seeds from `controlledLayout`, saves via `onSaveTemplate`). `controlled = !!onSaveLayout || isTemplate`. Junior path keeps `selectedTemplate` null (isJunior guard) so none of this touches junior brown chrome.

Gallery thumbnails: `sample-card-inputs.ts` `sampleCardInput(kind)` provides display-only stand-ins for all 10 kinds (incl matchSummary) so `renderShareCard` can draw a preview without real club data.
