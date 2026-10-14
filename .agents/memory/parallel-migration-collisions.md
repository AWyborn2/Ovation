---
name: Parallel migration collisions
description: Preserve database history when incoming branches reuse an existing migration number.
---

When independently developed branches reuse a migration number, keep the main branch's migration and snapshot unchanged. Append the incoming migration with a new number, an increasing journal timestamp, and a snapshot containing both branches' schema changes.

**Why:** Replacing the existing entry can lose applied history; keeping the incoming branch's older timestamp can make the migration runner skip it.

**How to apply:** Preserve the incoming SQL bytes when resequencing, point the combined snapshot to the existing snapshot, and validate both schema additions. Resolving source conflicts does not grant permission to run database migrations.
