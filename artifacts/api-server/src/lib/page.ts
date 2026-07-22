/**
 * Apply optional limit/offset to an already-materialised list.
 *
 * Used by the grade leaderboard's central branch, where the underlying read is
 * cached on (grade, clubId, crosswalk). Paging inside that query would need
 * limit/offset in the cache key and would store a separate copy of the club's
 * history per page, so the slice happens after the cached read instead.
 *
 * Omitting both arguments returns the list unchanged, which is what keeps the
 * paginated endpoint backward-compatible with callers that send no params.
 */
export function page<T>(rows: T[], limit?: number, offset?: number): T[] {
  const start = offset ?? 0;
  return limit === undefined ? rows.slice(start) : rows.slice(start, start + limit);
}
