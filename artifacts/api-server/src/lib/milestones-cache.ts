/**
 * Short-TTL cache for the milestone board build.
 *
 * Deliberately NOT `withCentralCache` from `@workspace/db/central-queries`:
 * that module statically imports `./central`, which throws at load time when
 * `CENTRAL_DATABASE_URL` is unset. Reaching for it from the shared milestones
 * entry point would drag the central pool into the native path on every
 * request and break tenant-only deployments outright.
 *
 * Two rules this cache exists to enforce:
 *  - Never cache a degraded build. The board degrades sections on failure, and
 *    a resolved-but-incomplete result is indistinguishable from a healthy one
 *    to a plain value cache — so a transient blip would otherwise be pinned for
 *    the whole TTL and served to every visitor.
 *  - Single-flight. The build runs five unbounded queries; without in-flight
 *    sharing, N concurrent cold requests each pay for all five.
 */
import { env } from "../config";


const DEFAULT_TTL_MS = 60_000;

function ttlMs(): number {
  const raw = env.MILESTONES_CACHE_TTL_MS();
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_TTL_MS;
}

type Entry<T> = { value: T; at: number };

const cache = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Drop every cached board (tests, and the write paths below). */
export function clearMilestonesCache(): void {
  cache.clear();
}

/**
 * Invalidate one tenant's cached boards across both read paths, so an admin
 * who changes milestone settings sees the board change on the next request
 * instead of waiting out the TTL.
 */
export function invalidateMilestonesCache(tenantId: number): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${tenantId}:`)) cache.delete(key);
  }
}

/**
 * Resolve `key` from cache, else build it. `build` reports whether the result
 * was degraded; degraded results are returned to the caller but never stored.
 */
export async function withMilestonesCache<T>(
  key: string,
  build: () => Promise<{ value: T; degraded: boolean }>,
): Promise<T> {
  const ttl = ttlMs();
  if (ttl <= 0) return (await build()).value;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const run = (async () => {
    const { value, degraded } = await build();
    if (!degraded) cache.set(key, { value, at: Date.now() });
    return value;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, run);
  return run as Promise<T>;
}
