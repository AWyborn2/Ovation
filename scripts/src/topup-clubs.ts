/**
 * topup-clubs.ts — backfill PCA club branding (colours + Cloudinary logos) into
 * the clubs register.
 *
 * The master DB dump carries the club roster but most rows land with null
 * colours and no logo. This module patches in the true brand values from the
 * PCA dataset, filling ONLY columns that are currently null or empty so that
 * any manually curated values are preserved.
 *
 * Standalone usage:
 *   pnpm --filter @workspace/scripts run topup-clubs
 *
 * Also called automatically at the end of `load-master-db.ts` so the colours
 * survive a full re-import.
 */
import { PCA_CLUBS, type PcaClub } from "./data/pca-clubs.js";

// ---------------------------------------------------------------------------
// Pure logic — testable without a DB
// ---------------------------------------------------------------------------

/** Shape of the brand-relevant columns we read from an existing clubs row. */
export interface ClubBrandState {
  playhqOrgId: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  tertiaryColour: string | null;
  quaternaryColour: string | null;
  logoUrl128: string | null;
}

/** A single field update: DB column name + new value. */
export interface FieldUpdate {
  column: string;
  value: string;
}

/** Describes one club that needs branding backfilled. */
export interface ClubBrandUpdate {
  playhqOrgId: string;
  name: string;
  fields: FieldUpdate[];
}

/** Column name in the DB → key in the PCA dataset. */
const COLOUR_MAP: { column: string; datasetKey: keyof PcaClub }[] = [
  { column: "primary_colour", datasetKey: "primary" },
  { column: "secondary_colour", datasetKey: "secondary" },
  { column: "tertiary_colour", datasetKey: "tertiary" },
];

/**
 * Determine which clubs need branding updates.
 *
 * For each PCA club, looks for a matching row in `existingClubs` (matched on
 * the 8-char playhqOrgId prefix). A field is flagged for update only when the
 * existing value is null or empty-string.
 *
 * Returns an array of updates to apply — clubs already fully branded, or not
 * present in `existingClubs`, are omitted.
 */
export function computeUpdates(existingClubs: ClubBrandState[]): ClubBrandUpdate[] {
  const updates: ClubBrandUpdate[] = [];

  for (const pca of PCA_CLUBS) {
    const existing = existingClubs.find(
      (c) => c.playhqOrgId != null && c.playhqOrgId.startsWith(pca.playhqOrgId),
    );
    if (!existing) continue; // club not in register — skip (master DB owns the roster)

    const fields: FieldUpdate[] = [];

    // Standard colour columns
    for (const { column, datasetKey } of COLOUR_MAP) {
      const currentValue = existing[camelCase(column) as keyof ClubBrandState] as string | null;
      const newValue = pca[datasetKey] as string | undefined;
      if (newValue && isEmpty(currentValue)) {
        fields.push({ column, value: newValue });
      }
    }

    // Quaternary — only some clubs have it
    if ("quaternary" in pca && pca.quaternary && isEmpty(existing.quaternaryColour)) {
      fields.push({ column: "quaternary_colour", value: pca.quaternary as string });
    }

    // Logo (128px thumbnail)
    if (isEmpty(existing.logoUrl128)) {
      fields.push({ column: "logo_url_128", value: pca.logo });
    }

    if (fields.length > 0) {
      updates.push({ playhqOrgId: pca.playhqOrgId, name: pca.name, fields });
    }
  }

  return updates;
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

/**
 * Build idempotent UPDATE statements for the PCA branding top-up.
 *
 * Each UPDATE uses `COALESCE(NULLIF(BTRIM(col), ''), 'value')` so it fills
 * null/empty columns but leaves existing non-empty values untouched. This
 * makes the whole operation safe to re-run.
 */
export function buildTopUpStatements(): string[] {
  return PCA_CLUBS.map((club) => {
    const sets: string[] = [];

    for (const { column, datasetKey } of COLOUR_MAP) {
      const value = club[datasetKey] as string | undefined;
      if (value) {
        sets.push(`${column} = COALESCE(NULLIF(BTRIM(${column}), ''), '${escapeSql(value)}')`);
      }
    }

    if ("quaternary" in club && club.quaternary) {
      sets.push(
        `quaternary_colour = COALESCE(NULLIF(BTRIM(quaternary_colour), ''), '${escapeSql(club.quaternary as string)}')`,
      );
    }

    sets.push(
      `logo_url_128 = COALESCE(NULLIF(BTRIM(logo_url_128), ''), '${escapeSql(club.logo)}')`,
    );

    return `UPDATE clubs SET ${sets.join(", ")} WHERE playhq_org_id LIKE '${escapeSql(club.playhqOrgId)}%'`;
  });
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

type PsqlFn = (sql: string) => string;

/**
 * Run the PCA branding top-up against the live database.
 *
 * @param psqlFn  A function that executes a SQL string and returns the result
 *                text (same signature as the `psql` helper in load-master-db).
 */
export function topUpClubs(psqlFn: PsqlFn): void {
  const statements = buildTopUpStatements();
  let updated = 0;

  for (const stmt of statements) {
    const result = psqlFn(stmt);
    // psql returns e.g. "UPDATE 1" or "UPDATE 0"
    const match = result.match(/UPDATE (\d+)/);
    const count = match ? Number(match[1]) : 0;
    if (count > 0) updated++;
  }

  console.log(`  topup-clubs: patched branding on ${updated} of ${PCA_CLUBS.length} PCA clubs`);
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { execFileSync } = await import("node:child_process");

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const psqlFn: PsqlFn = (sql: string) =>
    execFileSync(
      "psql",
      [DATABASE_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ).trim();

  console.log("\n=== topup-clubs (standalone) ===");
  topUpClubs(psqlFn);
  console.log("Done.");
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("topup-clubs.ts") || process.argv[1].endsWith("topup-clubs.js"));

if (isMain) main();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmpty(v: string | null | undefined): boolean {
  return v == null || v.trim() === "";
}

/** snake_case → camelCase (single-level, no deep nesting). */
function camelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Minimal SQL string escape — single-quotes only (values are hex colours and URLs). */
function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}
