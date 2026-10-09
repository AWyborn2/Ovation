# ADR-001: Card kind templates are layer documents on the blank base

**Status:** Accepted
**Date:** 2026-10-07
**Feature:** card-kind-templates
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

Social Studio cards render from six code-built HTML packs. Admins can override or hide pack parts and add free layers on top in the Studio editor, but cannot move, resize or restyle the pack's own parts, and edits apply to one draft only. The owner wants Canva-style templates per card kind (R1–R12) that automated drafts use (R13), on desktop and tablet (R23).

Constraints: the editor preview and the server image must come from one renderer (two renderers drifted in the past); the server renders by driving the web renderer in headless Chromium; juniors isolation and private-player redaction must hold; the editor's free-layer model already has per-size geometry, style, data binding and library elements, and a "blank" base already renders a card made only of layers.

## Decision

A card kind template is the editor's existing layer document rendered on the blank base. The document gains four capabilities: a `photo` layer, a `rows` layer (one styled row repeated per data row), `{{field}}` tokens inside text, and per-size presence. Starters (Club Kit, Broadcast) are hand-authored documents of this shape. The document types, helpers, field catalogue and starters live in `lib/scorecard/src/kind-templates/` so web, server and the set planner share them. Juniors and private-player rules are enforced at render time, not trusted to the document.

## Alternatives Considered

| Alternative                                                | Pros                           | Cons                                                                                                                                          | Why Not                                             |
| ---------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Keep packs; widen the overlay so pack parts become movable | No starter rebuild; packs stay | Pack parts are flowing HTML built by TypeScript; making each part positionable means rewriting every pack anyway, with two models in one card | Same cost as rebuilding, worse result               |
| New dedicated template renderer and schema                 | Clean slate, purpose-built     | A second renderer for editor and server; repeats the drift that caused past bugs; throws away the editor                                      | Duplicates working infrastructure                   |
| Embed a third-party design editor (hosted SDK)             | Mature editing UX              | No card-data binding; server images would need its renderer or a re-implementation; vendor cost and lock-in                                   | Fails the one-renderer and data-binding constraints |
| Mechanically convert packs into layer documents            | No hand design                 | Club Kit and Broadcast are flex layouts; conversion to fixed boxes is lossy                                                                   | Rejected in planning; owner chose hand design       |

## Consequences

### Positive

- One renderer for editor preview, harness and server images; what the admin sees is what posts.
- Reuses the editor's canvas, layers drawer, history, shortcuts and element registry.
- Existing drafts render byte-identically because new branches only run for new layer kinds or tokens.

### Negative

- 168 starter layouts must be hand-designed before release.
- Retired packs' code stays until their legacy drafts age out.
- Layout is absolute positioning; text that grows needs shrink-to-fit and warnings rather than reflow.

### Risks

- Starter design slips → the switch stays off (ADR-003); no production impact.
- Shrink-to-fit measured against a fallback font → explicit font loading and font-failure warnings (plan KTD12).

## Dependencies

- Depends on the render harness and blank-base branch.
- Constrains ADR-002 (drafts copy this document) and ADR-003 (switch gates the starters).
