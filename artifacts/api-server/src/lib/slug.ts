/**
 * Subdomain slug rules for self-serve signup. A slug becomes the tenant's
 * subdomain label (`<slug>.<platform-domain>`), so it must be a valid DNS label
 * and not collide with the platform's own hostnames or reserved words.
 */

const MIN = 2;
const MAX = 40;

/** Hostnames/labels a tenant must never take (platform routes + apex labels). */
const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "ftp",
  "platform",
  "ovation",
  "signup",
  "login",
  "logout",
  "auth",
  "dashboard",
  "static",
  "assets",
  "cdn",
  "blog",
  "help",
  "support",
  "status",
  "docs",
]);

/** Derive a candidate slug from a club name (best-effort; still validated). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX)
    .replace(/-+$/g, "");
}

export type SlugRejection = "too-short" | "too-long" | "malformed" | "reserved";

/** Validate a slug's shape + reserved set. Returns null when acceptable. */
export function validateSlug(raw: string): SlugRejection | null {
  const slug = raw.trim().toLowerCase();
  if (slug.length < MIN) return "too-short";
  if (slug.length > MAX) return "too-long";
  // DNS label: lowercase alphanumerics and internal hyphens only.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "malformed";
  if (isReservedSlug(slug)) return "reserved";
  return null;
}

/** True when the slug is reserved (static list or an apex label in PLATFORM_HOSTS). */
export function isReservedSlug(slug: string): boolean {
  if (RESERVED.has(slug)) return true;
  const platformLabels = (process.env.PLATFORM_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().split(".")[0])
    .filter(Boolean);
  return platformLabels.includes(slug);
}

/** A human-readable reason for a rejected slug (for the slug-availability API). */
export function slugRejectionReason(r: SlugRejection): string {
  switch (r) {
    case "too-short":
      return "Too short (minimum 2 characters).";
    case "too-long":
      return "Too long (maximum 40 characters).";
    case "malformed":
      return "Use lowercase letters, numbers and hyphens only.";
    case "reserved":
      return "That address is reserved.";
  }
}
