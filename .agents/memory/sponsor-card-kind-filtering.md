---
name: Sponsor per-card-type filtering
description: How sponsor logos are restricted to specific social card types, and the gotchas around it.
---

Sponsors can be tagged with the social card types their logo may appear on (kinds: milestone, player, record, gradeLeader, premiership).

- **Semantics: empty `cardKinds` = appears on ALL cards.** This keeps existing sponsors backwards-compatible (no migration of behaviour). Non-empty = only those kinds. Helper: `sponsorAppliesToKind` in `share-card.ts`.
  - **Why:** an explicit "all" sentinel avoids having to materialise every kind on every sponsor and stays correct when new card kinds are added later.

- **Filtering lives in the share-card modal, not the server.** The settings bundle's `activeSponsors` returns all date-active sponsors regardless of kind; the modal filters by `input.kind` before rendering. The admin social-queue reuses the same modal, so this single filter point covers both on-demand and auto-draft (milestone/roundup/recap) render paths.
  - **How to apply:** if you ever add a non-modal render path, replicate the kind filter there too.

- **Preview cache must invalidate on the resolved sponsor set.** The modal caches rendered previews and short-circuits on cache hit. Its invalidation effect must depend on a stable signature of the filtered sponsors (name+logoUrl), otherwise an async sponsor load or a kind-filter change leaves a stale/sponsorless preview cached.

- **CardKindPicker must tolerate `undefined` value.** Sponsor rows can arrive without `cardKinds` populated (stale cache / pre-restart API); default to `[]` inside the picker or it crashes on `value.length`.
