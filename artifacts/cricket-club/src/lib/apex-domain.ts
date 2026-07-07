/**
 * The current apex domain (host minus a leading "www."), used to build
 * tenant-subdomain URLs on the platform/marketing pages. Falls back to
 * "ovation.app" outside a browser context.
 */
export function apexDomain(): string {
  return typeof window !== "undefined"
    ? window.location.hostname.replace(/^www\./, "")
    : "ovation.app";
}
