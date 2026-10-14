---
name: Browser render verification
description: Browser verification module interop and unavailable testing-runtime fallback.
---

Direct browser imports of Vite's prebundled React and React DOM modules can expose their CommonJS APIs only through the default export.

**Why:** An ad-hoc preview/export comparison reported `createRoot is not a function` even though the application rendered normally. Reading the default export resolved the verification failure.

**How to apply:** When importing prebundled modules directly in browser evaluation, resolve the API as `module.default ?? module`. Keep normal application imports unchanged; this is a verification-harness interop concern.

The testing subagent configuration may be unavailable even when its skill is installed.

**Why:** The runtime rejected the documented `testing` configuration with `Unknown config kind`, despite returning a job identifier.

**How to apply:** Do not treat the returned identifier as evidence that a tester started. If the configuration is rejected, use the installed Puppeteer/Chromium for direct browser verification rather than repeatedly starting unsupported tester jobs.
