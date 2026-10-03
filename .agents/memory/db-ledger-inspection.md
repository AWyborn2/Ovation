---
name: Read-only migration ledger checks
description: Read-only ledger inspection and strict treatment of newline-sensitive migration hashes.
---

# Read-only migration ledger checks

For read-only migration-ledger checks, run the `pg` query from the `@workspace/db` package context (`pnpm --filter @workspace/db exec node ...`). The workspace root may not resolve `pg`, and the Replit SQL callback may reject the configured database URI's `uselibpqcompat` parameter.

**Why:** This workspace isolates dependencies by package, while the SQL callback and root Node resolution can fail independently even when the database is reachable.

**How to apply:** Use a SELECT-only query for ledger counts and latest applied records. Do not run the migration command when the task is verification-only.

Migration hashes depend on raw file bytes. Accept only explicitly proven LF/CRLF equivalents at the same journal timestamp; keep duplicate and substantive SQL-change guards. Never rewrite historical ledger hashes to make an audit pass.

**Why:** A restored ledger's earliest migrations matched the repository SQL exactly after CRLF conversion, despite differing from the files' LF hashes.

**How to apply:** Investigate newline conversion before assuming an unknown hash means different SQL. Do not normalize other whitespace or bypass unmatched hashes.