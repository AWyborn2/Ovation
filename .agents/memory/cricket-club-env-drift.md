---
name: Cricket-club env install drift
description: Isolated task environments can have node_modules out of sync with the lockfile, breaking Vite at runtime.
---

# Cricket-club env install drift

In an isolated task environment, `node_modules` (the pnpm store) can be missing packages that ARE present in `pnpm-lock.yaml` and `package.json` — i.e. a prior task added a dep but this env was never re-installed.

**Symptom seen:** `gifenc` (a **dynamic** `await import("gifenc")` inside `share-card.ts`, used only by GIF export) was in the lockfile but absent from the store. Vite dev still tries to resolve the dynamic import when transforming the module, so the WHOLE `src/lib/share-card.ts` request 500s with `Failed to resolve import "gifenc"`. That nukes any page importing share-card (preview, harness, etc.) — body renders empty.

**Fix:** `pnpm install --frozen-lockfile` (restores from lockfile without mutating it), then restart the web workflow to clear Vite's cached transform error. This is an environment fix, NOT a code change — don't "fix" it by removing the import.

**How to spot it fast:** a blank page + a single failing resource request to a `/src/...` module; `curl http://localhost:80/src/lib/<file>.ts` returns the Vite error JSON with the unresolved import name.
