// ---------------------------------------------------------------------------
// Short-TTL result cache for the exported central reads.
//
// The central DB is a REMOTE Supabase Postgres reached over the internet, so
// every query is a full network round trip, and the underlying data changes at
// most weekly (external ingest). A 5-minute in-process cache (mirroring the
// tenant-config cache in api-server/src/lib/tenant.ts) is therefore safe by
// design and removes repeated multi-second fan-outs on hot pages.
//
// Override with CENTRAL_CACHE_TTL_MS (0 disables caching entirely — useful for
// tests and the comparison tooling); call clearCentralQueriesCache() to reset
// between test cases.
// ---------------------------------------------------------------------------

const DEFAULT_CENTRAL_CACHE_TTL_MS = 5 * 60 * 1000;

function centralCacheTtlMs(): number {
  const raw = process.env.CENTRAL_CACHE_TTL_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_CENTRAL_CACHE_TTL_MS;
}

const centralCache = new Map<string, { value: unknown; at: number }>();

/** Drop every cached central read (tests; or after a central re-ingest). */
export function clearCentralQueriesCache(): void {
  centralCache.clear();
}

/**
 * Stable, order-insensitive serialisation of a cache-key argument. Maps (the
 * leaderboard's tenant crosswalk/rename overrides) are folded into the key by
 * their sorted entries so two tenants sharing a central club id but carrying
 * different crosswalks never share a cache entry.
 */
function stableCacheArg(value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __map: [...value.entries()]
        .map(([k, v]) => [String(k), v] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    };
  }
  if (Array.isArray(value)) return value.map(stableCacheArg);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stableCacheArg(v)]),
    );
  }
  return value;
}

/**
 * Build the cache key for one exported read: the function name plus EVERY
 * argument that shapes its result. The club id must always be among them, and
 * so must any per-tenant input (crosswalk / rename Maps, tier arrays) — two
 * tenants sharing a central club id must never share an entry.
 */
export function cacheKey(fn: string, args: unknown[]): string {
  return `${fn}:${JSON.stringify(args.map(stableCacheArg))}`;
}

/** Hard ceiling on cached entries; expired ones are swept before eviction. */
const MAX_CENTRAL_CACHE_ENTRIES = 500;

/** In-flight builds, so concurrent misses on one key share a single query run. */
const centralInFlight = new Map<string, Promise<unknown>>();

/**
 * Drop expired entries; if still over the ceiling, evict oldest-first. Without
 * this the Map only ever grows — entries expire logically but were never removed.
 */
function pruneCentralCache(ttl: number): void {
  if (centralCache.size <= MAX_CENTRAL_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of centralCache) {
    if (now - v.at >= ttl) centralCache.delete(k);
  }
  if (centralCache.size <= MAX_CENTRAL_CACHE_ENTRIES) return;
  const excess = centralCache.size - MAX_CENTRAL_CACHE_ENTRIES;
  let dropped = 0;
  for (const k of centralCache.keys()) {
    if (dropped++ >= excess) break;
    centralCache.delete(k);
  }
}

/**
 * Run `fn` through the short-TTL cache. Resolved values only (a failed read is
 * never cached); TTL <= 0 bypasses the cache completely.
 *
 * Single-flight: the in-flight promise is shared, so N concurrent misses on a
 * cold key run `fn` once rather than N times. These reads fan out into several
 * club-wide scans of a remote DB (index-backed on (club_id, match_id) since the
 * 2026-07-09 central_perf_indexes_club_and_match migration, but still whole-
 * history reads over the network), so a stampede is expensive.
 */
export async function withCentralCache<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ttl = centralCacheTtlMs();
  if (ttl <= 0) return fn();
  const hit = centralCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;

  const existing = centralInFlight.get(key);
  if (existing) return existing as Promise<T>;

  const run = (async () => {
    const value = await fn();
    centralCache.set(key, { value, at: Date.now() });
    pruneCentralCache(ttl);
    return value;
  })().finally(() => {
    centralInFlight.delete(key);
  });

  centralInFlight.set(key, run);
  return run as Promise<T>;
}
