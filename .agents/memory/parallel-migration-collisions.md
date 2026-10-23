---
name: Parallel migration collisions
description: Preserve database history when incoming branches reuse an existing migration number.
---

When independently developed branches reuse a migration number, keep the main branch's migration and snapshot unchanged. Append the incoming migration with a new number, an increasing journal timestamp, and a snapshot containing both branches' schema changes.

**Why:** Replacing the existing entry can lose applied history; keeping the incoming branch's older timestamp can make the migration runner skip it.

**How to apply:** Preserve the incoming SQL bytes when resequencing, point the combined snapshot to the existing snapshot, and validate both schema additions. Resolving source conflicts does not grant permission to run database migrations.

For a selective import that must retain its upstream migration filename, the
filename need not determine its execution timestamp. Place the isolated entry
after the installed baseline but before deliberately excluded upstream entries;
rebuild its snapshot without excluded schemas. Preserve that applied entry when
the omitted work is integrated later.

**Why:** The user requested an isolated feature and its named migration while
other builds on GitHub remained unfinished. Advancing to the upstream timestamp
would make Drizzle skip the omitted, earlier-timestamp migrations on a later pull.

**How to apply:** Review journal chronology, snapshot ancestry and actual ledger
state together. Never replace the journal wholesale or assume a later full pull
is safe merely because the isolated feature worked.

For isolated histories where a migration filename differs from its journal
index, new entries must not let the generator reuse an existing snapshot number.

**Why:** Drizzle chooses the next filename from the last journal index, not the
highest existing snapshot filename. A mismatched index can overwrite an older,
already-applied migration's snapshot.

**How to apply:** Keep historical entries immutable; give the new entry an index
matching its retained filename, link its snapshot to the actual preceding
snapshot, and retain the deliberate low execution timestamp while excluded
upstream migrations remain pending.

When the omitted upstream migrations are finally integrated, append their
original SQL files after the isolated entries and regenerate a single combined
snapshot from the merged schema. Do not splice upstream's intermediate snapshots
into the preserved isolated ancestry.

**Why:** Upstream snapshots describe a different execution order and can omit
already-installed isolated changes or share a predecessor with another snapshot.
Drizzle needs one coherent snapshot chain, not every branch's historical chain.

**How to apply:** Preserve applied SQL bytes, hashes and timestamps, verify the
appended timestamps exceed the ledger maximum, link the final combined snapshot
to the last preserved snapshot, and check that generation reports no remaining
schema changes. Leave enough journal-index space to avoid snapshot collisions.
