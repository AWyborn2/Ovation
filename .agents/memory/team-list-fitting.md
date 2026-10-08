---
name: Team Selection fitting boundaries
description: Scope and preview/export invariants for full names on built-in Team Selection cards.
---

Keep full-name fitting scoped to the built-in two-column Team Selection design, not user-authored templates or inserted Studio elements.

**Why:** The user explicitly excluded automatic custom-template changes. Studio reuses the row helper but has independently authored element boxes.

**How to apply:** Preserve the opt-in boundary when extending shared parts; do not infer or abbreviate player identities.

Keep measured card DOM stable across React preview-scale changes, and wait for intended fonts in the export harness.

**Why:** A responsive rerender silently replaced imperative line breaks even though the source HTML had not changed. Native exports alone passed; the carousel preview exposed the mismatch.

**How to apply:** Include a real resized-preview check alongside native exported-pixel comparisons whenever changing post-mount typography.
