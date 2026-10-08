# Security — card-kind-templates (2026-10-08)

- Threats reviewed: tenant isolation, authZ/switch gating, stored XSS/CSS injection via template documents, font URL injection, resource abuse of the shared renderer, junior/private data leaks, migration safety. Full table: `.10x/reviews/2026-10-08-card-kind-templates-review.md`.
- Isolation and authZ: sound (every query tenant-scoped; admin + `socialStudio` entitlement on writes; 404 when the switch is off).
- Decision: template documents are validated strictly on save (shared `templateDocumentErrors`), and the renderer coerces everything it prints. Defence in depth because documents are copied into every draft and rendered server-side unattended.
- Follow-ups: CSP for the web app; sandbox the render harness's network (app origin, image store, Google Fonts only); schema-validate draft PATCH adjustments; render-queue priority for publish renders.
