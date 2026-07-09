import { QueryClient } from "@tanstack/react-query";

/**
 * App-wide query defaults. The API is read-mostly club history/stats, so data
 * is considered fresh for a minute and we don't refire every query whenever
 * the tab regains focus. Screens that genuinely need livelier data keep their
 * own per-query options (which always override these defaults):
 * - admin/captain/platform auth checks set `staleTime: 30_000` AND
 *   `refetchOnWindowFocus: true` themselves, so a session revoked while a tab
 *   was backgrounded is re-checked the moment it regains focus,
 * - the admin pending-drafts badge polls via `refetchInterval: 60_000` with
 *   `refetchOnWindowFocus: true`,
 * - admin import flows force-refresh via `queryClient.invalidateQueries`,
 *   which ignores staleTime by design.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
