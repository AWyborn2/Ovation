---
name: Read-only migration ledger checks
description: How to inspect the development migration ledger in this pnpm workspace when standard query paths fail.
---

# Read-only migration ledger checks

For read-only migration-ledger checks, run the `pg` query from the `@workspace/db` package context (`pnpm --filter @workspace/db exec node ...`). The workspace root may not resolve `pg`, and the Replit SQL callback may reject the configured database URI's `uselibpqcompat` parameter.

**Why:** This workspace isolates dependencies by package, while the SQL callback and root Node resolution can fail independently even when the database is reachable.

**How to apply:** Use a SELECT-only query for ledger counts and latest applied records. Do not run the migration command when the task is verification-only.