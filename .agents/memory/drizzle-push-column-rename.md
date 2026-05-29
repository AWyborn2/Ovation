---
name: drizzle-kit push column rename in non-interactive shells
description: Why `pnpm --filter @workspace/db run push` fails on column renames here, and the workaround.
---

`drizzle-kit push` cannot complete a column **rename** from the agent shell.
When a column is dropped+added (which a rename looks like), drizzle-kit shows an
interactive "is this a rename or a new column?" prompt. The agent shell has no
TTY (`process.stdin.isTTY` is false), so it errors with
`Interactive prompts require a TTY terminal`.

**Workaround:** perform the rename with raw SQL via the `executeSql` callback,
then run `push` again to confirm `No changes detected`:

```sql
ALTER TABLE <table> RENAME COLUMN <old> TO <new>;
```

**Why:** keeps the live DB and the Drizzle schema in lockstep without needing a
TTY. Plain column add/drop/type changes push fine non-interactively; only
ambiguous rename-vs-recreate decisions trigger the blocking prompt.

**How to apply:** any task that renames a Drizzle column. Do the SQL rename
first, then `push` to verify sync — don't try to pipe answers into push.
