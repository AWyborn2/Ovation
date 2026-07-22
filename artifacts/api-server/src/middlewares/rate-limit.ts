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
export const adminWriteRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const admin = (req as RequestWithAdmin).admin;
    if (admin) return `admin:${admin.id}`;
    return ipKeyGenerator(req.ip ?? "");
  },
  message: {
    error:
      "Too many admin write requests. Please wait a few minutes and try again.",
  },
});
