---
name: Large SQL payloads
description: Avoiding executeSql argument-size failures when rehearsing data corrections with embedded row snapshots.
---

Large SQL strings with embedded snapshots can fail through executeSql with
`spawn E2BIG` before reaching PostgreSQL.

**Why:** A snapshot-based recovery rehearsal exceeded the callback's process
argument limit. Running the same SQL from a file through the project's existing
development database client avoided that transport limitation.

**How to apply:** Keep production inspection read-only and queries narrowly
projected. For large development-only rehearsals, verify the normal application
client's target, read SQL from an ignored file, and execute on one connection
inside a rolled-back transaction with temporary shadow tables. Do not print the
whole wrapped error: it can include the entire embedded data snapshot. Log only
the PostgreSQL cause message. This workaround never authorizes production writes
or credential extraction.
