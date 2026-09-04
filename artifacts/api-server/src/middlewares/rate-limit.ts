import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import type { RequestWithAdmin } from "./require-admin";

// Throttle repeated failed logins to slow brute-force attacks while staying
// lenient enough that a real admin/captain mistyping a password is unaffected.
// Only failed attempts count toward the limit (successful logins are skipped).
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please wait a few minutes and try again.",
  },
});

// Throttle self-serve provisioning itself: unlike login, every *successful*
// signup call provisions a real tenant + admin (and now a live session), so
// successes must count toward the limit — skipping them (as loginRateLimiter
// does) would let one IP mass-provision tenants without limit.
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many signup attempts. Please wait a while and try again.",
  },
});

// Throttle the two unauthenticated discovery endpoints the signup wizard reads
// from (available-clubs, slug-available). Auto-login raises the payoff of
// automating a guess against them (a successful guess now yields a live session,
// not just an unbranded tenant), but a real user's wizard fires several of these
// per sitting (e.g. a debounced live-availability check while trying slugs), so
// this stays generous — bounding unbounded scraping, not everyday interactive use.
export const signupDiscoveryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait a few minutes and try again.",
  },
});

/**
 * Throttle authenticated admin writes that are expensive or destructive — the
 * import pipeline and the stat-correction endpoints.
 *
 * Login was the only throttled surface, so a stolen session cookie (or a
 * runaway script) could drive commits, undo-season and correction writes as
 * fast as the server would answer. Each of those recomputes aggregates across
 * the club's whole history, so this is a resource-exhaustion vector as much as
 * an integrity one.
 *
 * Keyed on the admin id, not the IP: the threat is one compromised session, and
 * an IP key would both let an attacker rotate addresses to escape the limit and
 * punish a whole club behind one office NAT. Falls back to the IP (via
 * `ipKeyGenerator`, which normalises IPv6 to its /56 subnet) only if the limiter
 * somehow runs before `requireAdmin` has attached the admin.
 *
 * Successful requests count. Unlike login, a *successful* import commit is the
 * expensive operation, so skipping successes would defeat the purpose.
 *
 * The limit is sized for real admin work: a busy Saturday-evening results entry
 * is a handful of commits, not dozens per minute.
 */
/**
 * Exported for direct unit testing. The failure mode this guards is silent: if
 * the limiter is ever mounted before `requireAdmin`, `req.admin` is undefined
 * and every request falls back to the IP key. Nothing errors — but behind
 * `trust proxy`, a whole club on one office NAT would then share a single
 * bucket and start seeing spurious 429s. Testing the limiter end-to-end would
 * need ~31 real requests and would leak its process-global counters into other
 * suites, so the key function is tested instead.
 */
export function adminWriteRateLimitKey(req: Request): string {
  const admin = (req as RequestWithAdmin).admin;
  if (admin) return `admin:${admin.id}`;
  return ipKeyGenerator(req.ip ?? "");
}

/**
 * Throttle the junior scorecard edit routes.
 *
 * Deliberately NOT `adminWriteRateLimiter`. That limiter is sized for import
 * commits — a handful per sitting. Scorecard entry is the opposite shape:
 * roughly 11 batting lines, 6 bowling lines, a roster and any corrections for a
 * SINGLE match, so an admin entering two matches would blow a 30-per-5-minute
 * budget doing their job. This is set high enough to be invisible to a human
 * typing as fast as they can, while still bounding a script.
 */
export const juniorEditRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: adminWriteRateLimitKey,
  message: {
    error: "Too many edits in a short period. Please wait a minute and retry.",
  },
});

/**
 * Throttle permanent junior participant merges.
 *
 * The inverse trade to the edit limiter: merging two profiles is destructive
 * and awkward to unwind, and a real admin does it a few times after spotting
 * duplicates — never in a tight loop. Low limit, long window.
 */
export const juniorMergeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: adminWriteRateLimitKey,
  message: {
    error: "Too many profile merges. Please wait before merging more.",
  },
});

/**
 * Throttle the one unauthenticated write on the public surface: minting a
 * tracked short link when a visitor shares a page. Each call inserts a row, so
 * without a limit one client could fill `tracked_links` for any tenant.
 * Keyed by IP (there is no session). Generous enough for a real share flow,
 * which mints one link per share.
 */
export const publicWriteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait a few minutes and try again.",
  },
});

export const adminWriteRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: adminWriteRateLimitKey,
  message: {
    error: "Too many admin write requests. Please wait a few minutes and try again.",
  },
});
