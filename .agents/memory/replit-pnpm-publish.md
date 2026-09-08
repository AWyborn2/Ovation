---
name: Replit pnpm publish bootstrap
description: Why this workspace must not exact-pin pnpm in the root packageManager field.
---

Do not add an exact pnpm `packageManager` pin to the root package manifest unless Replit's current publishing bootstrap has been verified to support it.

**Why:** An exact pin caused both publishing and local workflow setup to recursively run `pnpm add pnpm@<version>`, eventually failing with SIGABRT/EAGAIN before any application build began. Removing the pin let Replit use its available pnpm release while the lockfile continued to provide deterministic dependency resolution.

**How to apply:** Keep the pnpm lockfile and pnpm-only preinstall guard. If dependency tooling proposes an exact package-manager pin, test a clean install and publishing bootstrap before accepting it.