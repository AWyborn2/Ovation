---
name: Card image audit boundaries
description: Distinguish functional logos from deliberately clipped decoration when checking card image geometry.
---

Logo checks must evaluate the painted artwork under `object-fit: contain`, and distinguish functional header/sponsor logos from decorative crests.

**Why:** The Club Kit deliberately displays an oversized, low-opacity crest beyond the card edges. Treating every image element as a functional logo produces false clipping failures on otherwise matching previews and exports.

**How to apply:** Keep strict bounds and aspect-ratio checks for visible header and sponsor artwork. Exempt only clearly identified decoration; do not remove overflow checks from sponsor tiles to make a test pass. Compare decoded preview/export pixels separately.
