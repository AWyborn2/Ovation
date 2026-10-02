/**
 * check-identity-drift-core.ts — the pure side of the identity drift check
 * (hybrid stats plan U17): the read-only CLI guard, the CSV rows and the
 * summary. No database. The check itself (which GUIDs drifted, and what hangs
 * off them) is `computeIdentityDrift` in
 * artifacts/api-server/src/lib/identity-drift.ts, shared with the admin
 * endpoint so the script and the screen can't disagree.
 */
import type {
  IdentityDriftItem,
  IdentityDriftResult,
} from "../../artifacts/api-server/src/lib/identity-drift";
import { WRITE_FLAG_RE } from "./hh-central-crosswalk-core";

// ---------------------------------------------------------------------------
// Read-only CLI guard
// ---------------------------------------------------------------------------

export interface DriftArgs {
  /** One tenant only, or null for every tenant with a central club. */
  tenantId: number | null;
  out: string | null;
  help: boolean;
}

/**
 * Parse argv for the strictly read-only runner. Any flag implying a write is
 * refused explicitly, and any other unknown flag is refused too.
 */
export function parseDriftArgs(argv: string[]): DriftArgs | { error: string } {
  const args: DriftArgs = { tenantId: null, out: null, help: false };
  for (const a of argv) {
    if (!a.startsWith("-")) return { error: `Unexpected positional argument "${a}".` };
    const eq = a.indexOf("=");
    const flag = eq === -1 ? a : a.slice(0, eq);
    const value = eq === -1 ? null : a.slice(eq + 1);
    if (WRITE_FLAG_RE.test(flag)) {
      return {
        error: `Refusing "${a}": this script is strictly READ-ONLY and never writes to either database.`,
      };
    }
    if (flag === "--help" || flag === "-h") {
      args.help = true;
    } else if (flag === "--tenant") {
      const id = Number(value);
      if (!value || !Number.isInteger(id) || id <= 0) {
        return { error: `--tenant needs a tenant id, e.g. --tenant=1 (got "${a}").` };
      }
      args.tenantId = id;
    } else if (flag === "--out") {
      if (!value) return { error: `--out needs a directory, e.g. --out=/tmp/drift.` };
      args.out = value;
    } else {
      return { error: `Unknown flag "${a}". Allowed: --tenant=<id>, --out=<dir>, --help.` };
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface TenantDriftResult extends IdentityDriftResult {
  tenantId: number;
  slug: string;
  centralClubId: number;
}

export const DRIFT_CSV_HEADER = [
  "tenant_id",
  "tenant_slug",
  "central_club_id",
  "participant_id",
  "kind",
  "player_id",
  "display_name",
  "still_in_central_players",
  "merged_into_participant_id",
  "merge_status",
  "merged_from",
  "dependent_type",
  "dependent_table",
  "dependent_row_id",
  "dependent_label",
];

/**
 * One CSV row per row that depends on a drifted GUID (curated rows, then
 * corrections); a GUID nothing depends on still gets one bare row.
 */
export function driftCsvRows(t: TenantDriftResult): unknown[][] {
  const rows: unknown[][] = [];
  for (const i of t.items) {
    const head = [
      t.tenantId,
      t.slug,
      t.centralClubId,
      i.participantId,
      i.kind,
      i.playerId ?? "",
      i.displayName ?? "",
      i.stillInCentral ? 1 : 0,
      i.mergedIntoParticipantId ?? "",
      i.mergeStatus ?? "",
      i.mergedFrom.join(" "),
    ];
    const dependents: unknown[][] = [
      ...i.curatedRows.map((r) => ["curated", r.table, r.rowId, r.label]),
      ...i.corrections.map((c) => [
        "correction",
        "club_corrections",
        c.id,
        `${c.field} in match ${c.playhqMatchId}`,
      ]),
    ];
    if (dependents.length === 0) rows.push([...head, "", "", "", ""]);
    for (const d of dependents) rows.push([...head, ...d]);
  }
  return rows;
}

const countKind = (items: readonly IdentityDriftItem[], kind: IdentityDriftItem["kind"]) =>
  items.filter((i) => i.kind === kind).length;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function summariseDrift(results: readonly TenantDriftResult[]) {
  const tenants = results.map((t) => ({
    tenantId: t.tenantId,
    slug: t.slug,
    centralClubId: t.centralClubId,
    checked: t.checked,
    centralEmpty: t.centralEmpty,
    missingGuids: t.items.length,
    missingKeepers: countKind(t.items, "keeper"),
    missingMergedAway: countKind(t.items, "merged_away"),
    dependentCuratedRows: sum(t.items.map((i) => i.curatedRows.length)),
    dependentCorrections: sum(t.items.map((i) => i.corrections.length)),
  }));
  return {
    tenants,
    totals: {
      tenantsChecked: tenants.length,
      tenantsWithDrift: tenants.filter((t) => t.missingGuids > 0).length,
      tenantsSkippedCentralEmpty: tenants.filter((t) => t.centralEmpty).length,
      missingGuids: sum(tenants.map((t) => t.missingGuids)),
      missingKeepers: sum(tenants.map((t) => t.missingKeepers)),
      missingMergedAway: sum(tenants.map((t) => t.missingMergedAway)),
      dependentCuratedRows: sum(tenants.map((t) => t.dependentCuratedRows)),
      dependentCorrections: sum(tenants.map((t) => t.dependentCorrections)),
    },
  };
}

export type DriftSummary = ReturnType<typeof summariseDrift>;
