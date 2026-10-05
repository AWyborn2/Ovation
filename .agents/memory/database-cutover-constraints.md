---
name: Database transition constraints
description: User-required staged Supabase-to-Replit transition and separation of shell connection targets.
---

Keep the Supabase app live while preparing its data copy into Replit development; plan the production switch separately afterward. Preserve the old development database rather than overwriting it.

**Why:** The user requested a staged transition and explicitly said the old development copy is being kept.

**How to apply:** A rehearsal is not permission to switch app connections, change secrets, publish, or modify production. Require explicit authorization for a later cutover.

Keep `heliumdb_prev` and `heliumdb_old_backup`; drop nothing during this transition.

**Why:** The user explicitly required preservation of both backups.

**How to apply:** Do not remove either database for cleanup, reruns, or storage recovery without a new explicit instruction.

Supabase source access needs explicit separate authorization and must remain read-only. Development activation/migration approval alone does not authorize external verification or any source writes; leave secrets and deployment settings unchanged and do not publish.

**Why:** The user repeatedly excluded these actions from the authorized development cutover.

**How to apply:** Confirm development connection targets before executing commands. Treat any production work or external-source verification as a separate request requiring authorization.

Shell `PG*` credentials and application connection URLs can reach different database servers. Verify the target explicitly rather than assuming plain `psql` reaches the app's current database.

**Why:** During this transition, the workspace's shell credentials reached the built-in Replit development server while the application URLs still reached Supabase. Do not assume those targets remain unchanged.

**How to apply:** Keep source reads and destination writes on separately scoped client connections; specify the destination database explicitly.

The managed development host can proxy PostgreSQL to a backend socket: backend `inet_server_addr()`/`inet_server_port()` may be NULL, and advertised socket directories need not exist in the workspace.

**Why:** Development diagnostics succeeded through the managed client host while direct connections to the backend's advertised socket failed.

**How to apply:** Reuse the verified client's managed host for development-only report processes; do not substitute backend socket paths or assume only loopback hosts are local development.

The raw `wa` schema is staging data the app does not read; its absence from the development copy is intentional. WA application data is already incorporated into `central`, alongside PCA data.

**Why:** The user explicitly confirmed this distinction when approving the development database name swap.

**How to apply:** Verify the application data in `central`; do not treat the missing raw staging schema as a failed copy or recreate it just to satisfy a schema checklist.

The cutover approach is now a fresh Supabase snapshot of public, central, playhq
and drizzle into NEW local development, followed by the approved additive
migrations there and preservation of the prior development database. Initial
production is to be created later with the chosen "Create production database" +
"Set up your production database with your current development data" options,
not by a full Agent-managed production restore/migration runner. A separately
authorized post-publish audit must compare all four schemas' table counts and
pg_trgm against development, filling ONLY absent schemas/tables/extension from
development rather than overwriting existing production data.

**Why:** The user chose publish-time development copying and required a post-publish audit rather than assuming custom schemas and extensions transfer.

**How to apply:** Preparation permits only explicitly authorized source checks.
Fresh-database creation, dump/restore, migrations, activation, workflow operations
and publishing remain separate execution stages. Confirm application URLs
actually use local development; database-name changes cannot reroute external URLs.

Source writers are frozen at actual cutover, not during source probes. Probe
read-only mode applies to the checking client session, never database/role-wide
defaults or other source sessions.

**Why:** The user clarified that Supabase remains live until cutover.

**How to apply:** Establish and verify the client's own read-only session before
reads; do not require a globally frozen source.

A Supabase session pooler may ignore startup connection options and terminate
TLS before the database backend. Backend pg_stat_ssl is not evidence of the
client-to-pooler transport's TLS state.

**Why:** Live checks showed startup-only read-only mode was not applied, and the
backend reported non-TLS while the libpq client connection verified TLS.

**How to apply:** Verify session settings after connection and verify TLS using
the actual client transport; preserve both fail-closed guards.