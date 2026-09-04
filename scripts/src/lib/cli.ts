/**
 * Shared guard rails for maintenance scripts that write to the tenant database.
 *
 * Every seed/backfill script that touches a tenant-scoped table must:
 *   1. take the tenant explicitly (`--tenant=<id>`, or `SEED_TENANT_ID`), never
 *      rely on the schema's `DEFAULT 1` — that silently lands rows in Halls Head;
 *   2. offer `--dry-run` (or `DRY_RUN=1`) so the operator can preview writes;
 *   3. refuse to run against a non-local `DATABASE_URL` without an explicit
 *      `--yes`, so a script written for a laptop cannot be pointed at the shared
 *      multi-tenant database by accident.
 */

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

/**
 * The tenant this run writes to. Required: throws with usage when absent or not
 * a positive integer. Accepts `--tenant=<id>`, `--tenant <id>`, or the
 * `SEED_TENANT_ID` env var (kept for `seed-honours`, which predates this module).
 */
export function requireTenantArg(): number {
  const raw = argValue("--tenant") ?? process.env.SEED_TENANT_ID;
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) {
    throw new Error(
      "A target tenant is required: pass --tenant=<id> (or set SEED_TENANT_ID). " +
        "Scripts never default to tenant 1 — that would write into the demo club's data.",
    );
  }
  return n;
}

/** `--dry-run` flag or `DRY_RUN=1`: log what would be written and exit. */
export function isDryRun(): boolean {
  return process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
}

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
}

function isLocalHost(host: string): boolean {
  return (
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

/**
 * Echo the target database host and refuse a non-local target unless the
 * operator passed `--yes`. Call before the first write.
 */
export function confirmDatabaseTarget(): void {
  const host = databaseHost();
  console.log(`Target database host: ${host || "(unset)"}`);
  if (isLocalHost(host)) return;
  if (process.argv.includes("--yes")) return;
  throw new Error(
    `DATABASE_URL points at a non-local host (${host}). ` +
      "Re-run with --yes to confirm you intend to write to a shared database.",
  );
}
