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
