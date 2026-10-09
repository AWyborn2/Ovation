---
name: Browser render verification
description: Vite module interop when mounting real React components in ad-hoc browser checks.
---

Direct browser imports of Vite's prebundled React and React DOM modules can expose their CommonJS APIs only through the default export.

**Why:** An ad-hoc preview/export comparison reported `createRoot is not a function` even though the application rendered normally. Reading the default export resolved the verification failure.

**How to apply:** When importing prebundled modules directly in browser evaluation, resolve the API as `module.default ?? module`. Keep normal application imports unchanged; this is a verification-harness interop concern.
