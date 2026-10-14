---
name: Development host smoke tests
description: Avoid misleading browser failures when platform and club pages select different routing modes by development hostname.
---

The public development hostname and the loopback preview can select different platform/tenant modes. Confirm the mode before browser smoke tests; do not assume they render the same route tree.

**Why:** During development cutover verification, the public development host served the platform while loopback served the Halls Head club. A club leaderboard on the platform host and a platform sign-in on the club host each timed out despite healthy APIs.

**How to apply:** Check the brand mode on the intended development host first. Use the development tenant header for club-specific checks and a platform-mode development host for platform-admin checks. Do not change secrets or routing settings just to make a test find its form.

Browser checks must wait for actionable controls, not merely mounted elements, when opening carousel editors.

**Why:** Source responses and selection effects can make Generate appear before it is enabled. Immediate Puppeteer clicks intermittently did nothing, falsely reporting a missing preview even though the editor worked.

**How to apply:** Use locator clicks that wait for enabled, stable controls; await dialog closure between carousel types rather than relying on a fixed delay alone.

Scope browser-test tenant headers to the app origin, comparing parsed URL origins rather than strings with explicit default ports.

**Why:** A global tenant header triggered CORS preflights against Google Fonts, making card previews fail font loading while the same export harness loaded correctly. Chromium normalises `:80` away.

**How to apply:** Add test routing headers only to same-origin requests; never send them to font/image providers.