import rateLimit from "express-rate-limit";

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
