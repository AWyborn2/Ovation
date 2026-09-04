/** Positive-integer env override with a fallback (bad/missing values -> fallback). */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * TLS setting for a pg Pool from an env flag, with an automatic default.
 *
 * - `"1"` / `"true"` / `"require"`  → verify the server certificate
 *   (`{ rejectUnauthorized: true }`), the setting for any remote database.
 * - `"0"` / `"false"` / `"disable"` → no TLS (local Postgres, CI services).
 * - unset → TLS with verification unless the URL's host is loopback.
 *
 * Explicit rather than `?sslmode=require` inside the secret: pg's `sslmode`
 * parsing does NOT verify the certificate chain by default, so a connection
 * string alone can silently downgrade to unverified TLS (plan.md §5.12).
 */
export function envSsl(name: string, url: string): { rejectUnauthorized: true } | false {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "require") return { rejectUnauthorized: true };
  if (raw === "0" || raw === "false" || raw === "disable") return false;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  return local ? false : { rejectUnauthorized: true };
}
