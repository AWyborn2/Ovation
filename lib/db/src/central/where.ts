import { eq, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { centralMatchesTable } from "../central";

/**
 * `matches.home_club_id = :club OR matches.away_club_id = :club` — the club
 * scoping predicate every central read starts from. Central `matches` is
 * symmetric (both sides are first-class clubs), so "the club's matches" always
 * means both columns; index-backed by `idx_central_matches_home_club` /
 * `idx_central_matches_away_club`.
 */
export function clubInvolvedWhere(clubId: number): SQL {
  // `or` is typed `SQL | undefined` only because it tolerates optional
  // operands; with two concrete operands it always yields SQL.
  return or(
    eq(centralMatchesTable.homeClubId, clubId),
    eq(centralMatchesTable.awayClubId, clubId),
  ) as SQL;
}

/**
 * `<column> = any($1)` with the whole list bound as ONE array parameter.
 *
 * Use this instead of drizzle's `inArray` whenever the list can be large — a
 * club's full match-id list runs to 800–1,500 ids (and its participant list to
 * ~1,000 GUIDs), and `inArray` expands to one bind parameter per value.
 * `inArray` remains the right tool for provably small lists (one page of match
 * ids, a handful of grade labels, the ≤27 opponent club ids, a top-25).
 *
 * Callers guard `values.length === 0` before querying, exactly as they did for
 * `inArray`; an empty array here would simply match nothing.
 */
export function inList(column: AnyColumn | SQL, values: readonly (number | string)[]): SQL {
  return sql`${column} = any(${sql.param(values)})`;
}
