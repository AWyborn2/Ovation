---
name: Database transition constraints
description: User-required staged Supabase-to-Replit transition and separation of shell connection targets.
---

Keep the Supabase app live while preparing its data copy into Replit development; plan the production switch separately afterward. Preserve the old development database rather than overwriting it.

**Why:** The user requested a staged transition and explicitly said the old development copy is being kept.

**How to apply:** A rehearsal is not permission to switch app connections, change secrets, publish, or modify production. Require explicit authorization for a later cutover.

Supabase source access needs explicit separate authorization and must remain read-only. Development activation/migration approval alone does not authorize external verification or any source writes; leave secrets and deployment settings unchanged and do not publish.

**Why:** The user repeatedly excluded these actions from the authorized development cutover.

**How to apply:** Confirm development connection targets before executing commands. Treat any production work or external-source verification as a separate request requiring authorization.

Shell `PG*` credentials and application connection URLs can reach different database servers. Verify the target explicitly rather than assuming plain `psql` reaches the app's current database.

**Why:** During this transition, the workspace's shell credentials reached the built-in Replit development server while the application URLs still reached Supabase. Do not assume those targets remain unchanged.

**How to apply:** Keep source reads and destination writes on separately scoped client connections; specify the destination database explicitly.

The raw `wa` schema is staging data the app does not read; its absence from the development copy is intentional. WA application data is already incorporated into `central`, alongside PCA data.

**Why:** The user explicitly confirmed this distinction when approving the development database name swap.

**How to apply:** Verify the application data in `central`; do not treat the missing raw staging schema as a failed copy or recreate it just to satisfy a schema checklist.

The cutover approach is now a fresh Supabase snapshot of public, central, playhq
and drizzle into NEW local development, followed by the approved additive
migrations there and preservation of the prior development database. Initial
production is to be created later by publishing with development-data copying,
not by an Agent-managed production restore/migration runner.

**Why:** The user changed the approach because production does not exist before publishing.

**How to apply:** Preparation permits only explicitly authorized source checks.
Fresh-database creation, dump/restore, migrations, activation, workflow operations
and publishing remain separate execution stages. Confirm application URLs
actually use local development; database-name changes cannot reroute external URLs.