# Website smoke tests

Thin "does it render without crashing" tests for the critical public pages.
They are NOT full coverage — they catch broken imports, null-derefs on empty
data, and bad hooks that would otherwise only surface when a human clicks around.

## Run

```
pnpm --filter @workspace/cricket-club test          # once
pnpm --filter @workspace/cricket-club test:watch    # watch mode
```

## How it works

- `vitest.config.ts` — jsdom env, separate from `vite.config.ts` (which needs
  PORT/BASE_PATH and Replit-only plugins not wanted under test).
- `setup.ts` — stubs jsdom gaps (matchMedia, ResizeObserver, IntersectionObserver,
  scrollTo) that Radix/charts touch on mount.
- `mock-api.ts` — replaces global `fetch` with canned JSON keyed by URL substring.
  Every page renders backend-free. Unmatched `/api/*` calls return `[]` (safe for
  the many list endpoints). Add a specific key when a page needs richer shape to
  render past a loading/empty guard.
- `render.tsx` — renders a page inside the providers every page assumes (wouter
  Router via memory-location + react-query, retries off, and the confirm-dialog
  provider several detail/admin pages call `useConfirm` from).
- `__tests__/smoke.test.tsx` covers the landing pages; `__tests__/pages-smoke.test.tsx`
  covers every detail page, the grade leaderboard, compare and the juniors tree.
  Detail pages read their id from the route, so mount them as
  `<Route path="/players/:id" component={PlayerDetail} />` at a concrete path.
  Mock keys match by substring and the first key wins — list `/juniors/players`
  before `/players`, and `/players/1` before `/players`.

## Adding a page

```tsx
import MyPage from "@/pages/my-page";
it("renders My Page", async () => {
  installApiMock();
  const { container } = renderAt(<MyPage />, "/my-page");
  await waitFor(() => expect(container.firstChild).toBeTruthy());
});
```

If the page needs specific data to get past a guard, pass overrides:
`installApiMock({ "/my-endpoint": { ...shape } })`.
