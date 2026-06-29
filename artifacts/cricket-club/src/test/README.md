# Website smoke tests

Thin "does it render without crashing" tests for the critical public pages. They are NOT full coverage. They catch broken imports, null-derefs on empty data, and bad hooks that would otherwise only surface when a human clicks around.

## Run

Run the cricket-club package test script once, or the test:watch script for watch mode.

## How it works

- vitest.config.ts: jsdom env, separate from vite.config.ts which needs PORT/BASE_PATH and Replit-only plugins not wanted under test.
- setup.ts: stubs jsdom gaps such as matchMedia, ResizeObserver, IntersectionObserver and scrollTo that Radix and charts touch on mount.
- mock-api.ts: replaces global fetch with canned JSON keyed by URL substring. Every page renders backend-free. Unmatched api calls return an empty array. Add a specific key when a page needs richer shape to render past a loading or empty guard.
- render.tsx: renders a page inside the providers every page assumes - wouter Router via memory-location plus react-query with retries off.

## Adding a page

Import the page, call installApiMock, then renderAt the page at its route and assert the container has a first child. If the page needs specific data to get past a guard, pass overrides to installApiMock mapping an endpoint substring to the response shape.
