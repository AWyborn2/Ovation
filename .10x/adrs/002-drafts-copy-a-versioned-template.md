# ADR-002: Drafts hold a copy of a versioned kind template

**Status:** Accepted
**Date:** 2026-10-07
**Feature:** card-kind-templates
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

Automated drafts must render from the club's template for their kind (R13), single drafts can still be tweaked (R17), saving a template asks whether to update waiting drafts (R16), and posted cards never change (R18). Drafts already store an `adjustments` document that the server render applies, with revisions in `social_draft_revisions`. Two admins may edit the same template. Re-ingest refreshes draft data and must not wipe hand-written captions, which `editedAt` protects today.

## Decision

- Templates are `card_templates` rows with `source = 'kind'`, one per tenant and kind, keyed on `base_kind` by a partial unique index, carrying a `version`. They do not use `defaultForKinds`.
- Each new draft copies the current template version into the root of its `adjustments`, with `packId = blank`. A carousel has one document; every slide renders it.
- Re-ingest refresh changes card data and caption only, never the document.
- "Apply to waiting drafts" is one transaction over unposted drafts: snapshot to revisions, re-check status per row, replace the document, clear `designEditedAt`, leave `editedAt`.
- Saves send their base version; a stale save is rejected.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Drafts reference the template live (render-time lookup) | Template edits apply instantly everywhere | Posted and approved cards change under the admin; no per-draft tweaks without a second overlay; server render needs extra lookups | Breaks R16 (ask first), R17 and R18 |
| Copy plus per-slide documents for carousels | Slides can differ | Tweaks lost when slide count changes; template can't target data-dependent slide keys | Owner chose one design per carousel |
| Reuse `defaultForKinds` to mark the kind template | No new index | `clearDefaultKinds` ignores `source` and would strip the club's pack claim; share-card modal would pre-select it as a background template | Corrupts pack selection |
| Last write wins on save | Simplest | A second admin silently overwrites four sizes of work | Unacceptable for volunteers sharing the role |

## Consequences

### Positive
- The existing render path, per-draft editor and revisions keep working unchanged.
- Apply is reversible per draft through revisions; captions are never lost.
- Concurrent saves are detected.

### Negative
- Template changes don't reach waiting drafts unless the admin applies them.
- Each draft carries a full document (larger rows than a pack id).

### Risks
- Apply racing with publish → status re-checked inside the transaction; skipped drafts reported.

## Dependencies
- Depends on ADR-001's document shape.
- Requires migration `0035_kind_templates.sql` (version, replaced pack, notice dismissed, partial unique index; draft layout warnings, template version, `designEditedAt`).
