---
name: Card image audit boundaries
description: Distinguish functional clipping from intentional decoration and tight typography in card layout audits.
---

Logo checks must evaluate the painted artwork under `object-fit: contain`, and distinguish functional header/sponsor logos from decorative crests.

**Why:** The Club Kit deliberately displays an oversized, low-opacity crest beyond the card edges. Treating every image element as a functional logo produces false clipping failures on otherwise matching previews and exports.

**How to apply:** Keep strict bounds and aspect-ratio checks for visible header and sponsor artwork. Exempt only clearly identified decoration; do not remove overflow checks from sponsor tiles to make a test pass. Compare decoded preview/export pixels separately.

When mounting real React components from a browser audit, import context providers using the app's exact Vite-versioned dependency URL, not an unversioned prebundle URL.

**Why:** A second URL loads a second context object, causing “No QueryClient set” even when an apparently correct provider wraps the component. Also avoid named nested helpers inside tsx-transpiled Puppeteer callbacks: injected naming helpers are unavailable in the browser.

**How to apply:** Read the served module's dependency URL when injecting providers, and keep evaluated browser functions self-contained.

Keep built-in pack typography distinct when auditing carousel labels; do not impose a common two-line limit or normalize tight display line spacing.

**Why:** A long stage can fit cleanly on three lines in Club Kit. Condensed-font metric rectangles can also overlap neighboring line boxes even when the painted capitals have a visible gap. Neither is necessarily an overflow defect.

**How to apply:** Judge actual clipping, painted glyph bounds and neighboring copy after intended fonts load. Compare native PNG pixels with the measured rendering rather than changing a pack's type scale to satisfy an artificial geometry rule.
