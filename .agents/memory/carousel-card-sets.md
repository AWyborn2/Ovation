---
name: Carousel / multi-card sets
description: Durable design decisions for admin carousel (multi-slide social) sets — visibility, validation, slide identity.
---

# Carousel / multi-card sets

Admin-authored sets of 2–10 linked social slides, batch-exported as numbered images / video.

- **Visibility is a draft/published gate, not an auth gate on the read.** The list endpoint is public but must return ONLY published sets to non-admins and ALL sets to admins — resolve the admin session inside the GET handler and branch the WHERE clause, rather than splitting into two endpoints. New sets default to draft so in-progress carousels never leak.
  - **Why:** an early version exposed every in-progress set publicly; the fix was per-row publish state + admin-aware filtering on the single shared list route.
- **Slide-count rules live in two places by design.** The 0–10 upper bound is a schema/zod concern (always enforced). The 2-slide *floor* only applies when publishing/exporting, so it is enforced imperatively in the route on publish AND mirrored in the UI button gate — keeping drafts saveable with 0–1 slides.
- **`slides` is opaque jsonb** holding frozen ShareCardInput per slide (+ optional layout layers, theme, motion). Adding new per-slide fields needs NO migration/codegen — same pattern as one-off `card_input`. The db lib must stay ignorant of the frontend ShareCardInput union; the client casts in/out.
- **Duplicating a slide must deep-copy** input + layout and mint a fresh slide id, or editing the copy mutates the original (shared object references through React state).
- **Per-slide brand/sponsor/junior rules apply individually:** junior slide → no theme; sponsors filtered by card kind; brand from the settings bundle.
- The editor reuses the single-card layout studio via its *controlled mode* (caller supplies layers + receives them back) instead of the studio persisting per-kind layouts itself.
