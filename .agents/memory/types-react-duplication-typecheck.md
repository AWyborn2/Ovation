---
name: cricket-club / mockup-sandbox @types/react dual-version typecheck failure
description: Pre-existing dual @types/react versions break typecheck in vendored shadcn UI components; not caused by app/feature work.
---

# Dual @types/react breaks typecheck in vendored UI components

`pnpm run typecheck` can fail in `cricket-club` and `mockup-sandbox` with the
classic React error: **"Two different types with this name exist, but they are
unrelated"** / `VoidOrUndefinedOnly` ref mismatch. It surfaces ONLY in vendored
shadcn/ui files (`src/components/ui/calendar.tsx`, `button-group.tsx`,
`spinner.tsx`) — never in app/feature code.

**Root cause:** two `@types/react` versions resolve in the tree at once
(e.g. `19.1.17` alongside `19.2.14`); a `Ref<T>` produced under one is fed to a
component typed under the other. The catalog pins `@types/react: ^19.2.0` in
`pnpm-workspace.yaml`, so a transitive dep dragging in an older 19.1.x is what
splits the types.

**Why it matters:** it's environmental/lockfile drift, NOT something your change
broke. Confirm with `git diff HEAD -- <the failing ui file>` (empty = unchanged)
and `ls node_modules/.pnpm/@types+react@*` (>1 dir = duplication). Don't chase it
inside a data-only or unrelated feature task. The real fix is a single-version
resolution (pnpm `overrides`/dedupe) + reinstall — a deliberate dependency change,
out of scope for feature/data work. `db`, `api-server`, and `cricket-mobile`
typecheck cleanly through this.
