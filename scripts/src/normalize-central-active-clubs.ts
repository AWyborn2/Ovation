/**
 * normalize-central-active-clubs.ts — repair the `active_to` semantics on
 * `central.clubs`, and guard onboarding against a silently-empty club picker.
 *
 * Background
 * ----------
 * The provisioning filter treats a club as claimable ONLY when its `active_to`
 * IS NULL (see `isCentralClubProvisionable` in `@workspace/db/central`):
 * a NULL `active_to` means "still active", a set one means "folded/renamed".
 * The external PCA builder that emits the central dump, however, has stamped the
 * CURRENT season label (e.g. "Summer 2025/26") onto every club — including the
 * ones that are still active. That leaves zero clubs with `active_to IS NULL`,
 * so `GET /platform/available-clubs` returns `[]` and the "Find your club"
 * picker is empty even though the register is fully populated.
 *
 * This script is the in-repo safety net for that: after any central (re)load it
 * NULLs `active_to` for the clubs whose last season is the latest one present
 * (i.e. still active), then GUARDS that at least one club ends up provisionable
 * and fails loudly if not — so a future rebuild can't silently break onboarding.
 * Genuinely folded clubs (an earlier `active_to`) are left untouched and stay
 * out of the picker.
 *
 * This is BUILD/OPS tooling, not app runtime: it writes `central.clubs` via
 * `psql` against `CENTRAL_DATABASE_URL`, exactly like the external loader does.
 * The app's `centralDb` handle stays strictly read-only — nothing here touches
 * it. The real fix belongs in the PCA builder (active clubs should be emitted
 * with `active_to = NULL`); until that lands, run this after every central load.
 *
 * Usage:
 *   # Normalise, then verify (run after a central reload):
 *   pnpm --filter @workspace/scripts run normalize-central-active-clubs
 *
 *   # Verify only — no writes (post-load / CI check):
 *   pnpm --filter @workspace/scripts run normalize-central-active-clubs -- --check
 */

// ---------------------------------------------------------------------------
// Pure logic — testable without a DB
// ---------------------------------------------------------------------------

/**
 * NULL `active_to` for the clubs whose last recorded season is the latest one
 * present in the register — those are the still-active clubs the code contract
 * expects to carry a NULL `active_to`. Clubs that stopped in an earlier season
 * keep their `active_to` and remain non-provisionable.
 *
 * The `max(active_to)` comparison relies on the season labels sorting
 * chronologically as text ("Summer 2025/26" > "Summer 2013/14"), which holds
 * for the 4-digit-year "Summer YYYY/YY" format the PCA dump uses. On an empty
 * register the subquery is NULL and the statement updates zero rows.
 */
export const NORMALIZE_SQL = `
UPDATE central.clubs
SET active_to = NULL
WHERE active_to IS NOT NULL
  AND active_to = (SELECT max(active_to) FROM central.clubs)
`.trim();

/**
 * One row, two counts: how many clubs are provisionable (`active_to IS NULL`)
 * and how many exist at all. `psql -A -t` prints this as `provisionable|total`.
 */
export const GUARD_SQL = `
SELECT
  count(*) FILTER (WHERE active_to IS NULL),
  count(*)
FROM central.clubs
`.trim();

export interface ClubProvisionCounts {
  provisionable: number;
  total: number;
}

/**
 * Parse the `provisionable|total` row that `GUARD_SQL` returns under
 * `psql -A -t`. Tolerant of surrounding whitespace and a trailing newline.
 */
export function parseGuardOutput(psqlOutput: string): ClubProvisionCounts {
  const line = psqlOutput.trim().split(/\r?\n/)[0] ?? "";
  const [prov, total] = line.split("|").map((s) => Number(s.trim()));
  if (!Number.isFinite(prov) || !Number.isFinite(total)) {
    throw new Error(`Could not parse club counts from psql output: ${JSON.stringify(psqlOutput)}`);
  }
  return { provisionable: prov, total };
}

/** Parse the row count from a psql `UPDATE N` command tag. */
export function parseUpdateCount(psqlOutput: string): number {
  const m = psqlOutput.match(/UPDATE (\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * The guard. Throws when the register holds clubs but NONE are provisionable —
 * the exact state that empties the onboarding picker. An empty register (a load
 * that produced nothing) is also treated as a failure so it surfaces loudly
 * rather than looking like a healthy-but-empty picker.
 */
export function assertProvisionable(counts: ClubProvisionCounts): void {
  if (counts.total === 0) {
    throw new Error(
      "central.clubs is empty — the central load produced no clubs. Onboarding " +
        "cannot offer any club to claim. Check the central (re)load before serving traffic.",
    );
  }
  if (counts.provisionable === 0) {
    throw new Error(
      `central.clubs has ${counts.total} clubs but 0 are provisionable ` +
        "(active_to IS NULL). The onboarding picker will be EMPTY. Every club's " +
        "active_to is set — run this normaliser (without --check), and fix the PCA " +
        "builder to emit active clubs with active_to = NULL.",
    );
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

type PsqlFn = (sql: string) => string;

export interface NormalizeOptions {
  /** Skip the UPDATE and only run the guard (post-load / CI verification). */
  checkOnly?: boolean;
}

/**
 * Run the normalisation (unless `checkOnly`) and then the guard against a live
 * central database. Throws via {@link assertProvisionable} when no club ends up
 * claimable. Returns the post-run counts.
 *
 * @param psqlFn A function that executes a SQL string against CENTRAL_DATABASE_URL
 *               and returns the result text (same signature as `topUpClubs`).
 */
export function normalizeCentralActiveClubs(
  psqlFn: PsqlFn,
  opts: NormalizeOptions = {},
): ClubProvisionCounts {
  if (!opts.checkOnly) {
    const updated = parseUpdateCount(psqlFn(NORMALIZE_SQL));
    console.log(
      `  normalize-central-active-clubs: NULLed active_to on ${updated} current-season club(s)`,
    );
  } else {
    console.log("  normalize-central-active-clubs: --check (no writes)");
  }

  const counts = parseGuardOutput(psqlFn(GUARD_SQL));
  assertProvisionable(counts);
  console.log(`  guard OK: ${counts.provisionable} of ${counts.total} central clubs provisionable`);
  return counts;
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { execFileSync } = await import("node:child_process");

  const CENTRAL_DATABASE_URL = process.env.CENTRAL_DATABASE_URL;
  if (!CENTRAL_DATABASE_URL) {
    console.error(
      "CENTRAL_DATABASE_URL is not set — this script writes/reads the central PCA " +
        "database, which is separate from DATABASE_URL (the tenant app DB).",
    );
    process.exit(1);
  }

  const checkOnly = process.argv.slice(2).includes("--check");

  const psqlFn: PsqlFn = (sql: string) =>
    execFileSync(
      "psql",
      [CENTRAL_DATABASE_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ).trim();

  console.log(`\n=== normalize-central-active-clubs${checkOnly ? " (check)" : ""} ===`);
  try {
    normalizeCentralActiveClubs(psqlFn, { checkOnly });
    console.log("Done.");
  } catch (err) {
    console.error(`\nFAILED: ${(err as Error).message}`);
    process.exit(1);
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("normalize-central-active-clubs.ts") ||
    process.argv[1].endsWith("normalize-central-active-clubs.js"));

if (isMain) main();
