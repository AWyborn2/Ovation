---
name: Database transition constraints
description: User-required staged Supabase-to-Replit transition and separation of shell connection targets.
---

Keep the Supabase app live while rehearsing the data copy into Replit development; plan a production switch separately afterward. Preserve the old June default development database rather than overwriting it.

**Why:** The user requested a staged transition and explicitly said the old development copy is being kept.

**How to apply:** A rehearsal is not permission to switch app connections, change secrets, publish, or modify production. Require explicit authorization for a later cutover.

Shell `PG*` credentials and application connection URLs can reach different database servers. Verify the target explicitly rather than assuming plain `psql` reaches the app's current database.

**Why:** This workspace's shell credentials reach the built-in Replit development server while the application URLs reach Supabase.

**How to apply:** Keep source reads and destination writes on separately scoped client connections; specify the destination database explicitly.