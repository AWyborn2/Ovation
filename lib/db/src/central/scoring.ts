import { sql } from "drizzle-orm";
import { centralMatchBattingTable } from "../central";

// ---------------------------------------------------------------------------
// Per-line scoring helpers shared by every central read: innings and fielding
// classification (JS + SQL twins), the fielding tally, and small formatting
// utilities. Keep the JS and SQL classifiers in lockstep — see the notes on
// battingInningsKindSql.
// ---------------------------------------------------------------------------

/**
 * Classify a central batting line into an innings outcome.
 *
 * `dismissal_type = 'other'` lumps "did not bat" together with retirements, so
 * the dismissal TEXT is authoritative for those — don't key on the type:
 *   - dismissal "did not bat"                      → NOT an innings (excluded).
 *   - dismissal "retired hurt" / "retired not out" → an innings, counts not out.
 *   - dismissal_type "not out"                     → an innings, not out.
 *   - everything else with a real dismissal_type   → an innings, out.
 */
export function classifyInnings(
  dismissalType: string | null,
  dismissal: string | null,
): "out" | "notout" | "dnb" {
  const text = (dismissal ?? "").trim().toLowerCase();
  if (text === "did not bat") return "dnb";
  if (text === "retired hurt" || text === "retired not out") return "notout";

  const type = (dismissalType ?? "").trim().toLowerCase();
  if (type === "not out") return "notout";
  // No dismissal info at all: treat as not out rather than inventing a wicket
  // (doesn't affect the innings count — only "did not bat" is excluded).
  if (type === "") return "notout";

  // A genuine dismissal (caught, bowled, lbw, run out, stumped, or an 'other'
  // edge case that isn't DNB/retired) → the batter was out.
  return "out";
}

/**
 * SQL mirror of {@link classifyInnings}, evaluated on `central.match_batting`
 * rows so the per-player aggregation can run as a GROUP BY in the database
 * instead of fetching every raw line. The branches translate the JS VERBATIM
 * and in the same order:
 *   - dismissal text "did not bat"                     → 'dnb'
 *   - dismissal text "retired hurt"/"retired not out"  → 'notout'
 *   - dismissal_type "not out" OR empty/NULL           → 'notout'
 *   - everything else                                  → 'out'
 * (Bare "retired" deliberately falls through to the type → 'out', same as JS.)
 * Keep the two definitions in lockstep — the *-consistency tests and the live
 * equivalence checks (Jul 2026) rely on them classifying identically.
 */
export const battingInningsKindSql = sql<string>`case
  when lower(trim(coalesce(${centralMatchBattingTable.dismissal}, ''))) = 'did not bat' then 'dnb'
  when lower(trim(coalesce(${centralMatchBattingTable.dismissal}, ''))) in ('retired hurt', 'retired not out') then 'notout'
  when lower(trim(coalesce(${centralMatchBattingTable.dismissalType}, ''))) in ('not out', '') then 'notout'
  else 'out'
end`;

/**
 * The three fielding-dismissal buckets the app tracks. `central.fielding.kind`
 * is free text ("caught"/"c", "stumped"/"st", "run out"/"ro", …); classify it
 * into one bucket so leaderboards and player pages can report catches,
 * stumpings and run-outs separately (their sum is the "dismissals" total).
 */
export type CentralFieldingKind = "catch" | "stumping" | "runOut";

export function classifyFieldingKind(
  kind: string | null | undefined,
): CentralFieldingKind | null {
  const k = (kind ?? "").trim().toLowerCase();
  if (!k) return null;
  // Order matters: run-out and stumping are checked before catch so a keeper's
  // "st" / a "run out" never falls through to the broad catch matcher.
  if (/run\s*-?\s*out|^ro$/.test(k)) return "runOut";
  if (/stump|^st$/.test(k)) return "stumping";
  if (/catch|caught|^c$|^ct$/.test(k)) return "catch";
  return null;
}

export interface FieldingTally {
  catches: number;
  stumpings: number;
  runOuts: number;
}

/** Empty fielding tally (all-zero), used as the default for players who fielded nothing. */
export function emptyFieldingTally(): FieldingTally {
  return { catches: 0, stumpings: 0, runOuts: 0 };
}

/**
 * Aggregate `central.fielding` rows (already scoped to a club + match set) into
 * per-participant catch/stumping/run-out tallies. `n` is the row's grouped
 * count (or 1 when the caller selects raw rows).
 */
export function tallyFielding(
  rows: { participantId: string | null; kind: string | null; n?: number }[],
): Map<string, FieldingTally> {
  const byPid = new Map<string, FieldingTally>();
  for (const f of rows) {
    if (!f.participantId) continue;
    const cls = classifyFieldingKind(f.kind);
    if (!cls) continue;
    let t = byPid.get(f.participantId);
    if (!t) {
      t = emptyFieldingTally();
      byPid.set(f.participantId, t);
    }
    const n = Number(f.n ?? 1);
    if (cls === "catch") t.catches += n;
    else if (cls === "stumping") t.stumpings += n;
    else t.runOuts += n;
  }
  return byPid;
}

export function splitDisplayName(displayName: string): {
  givenName: string;
  surname: string;
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0] ?? "", surname: "" };
  return {
    givenName: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1] ?? "",
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
