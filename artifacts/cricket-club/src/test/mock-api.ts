import { vi } from "vitest";

/**
 * Canned API responses keyed by a substring of the request path. The first key
 * that the request URL contains wins, so order from most- to least-specific.
 *
 * Smoke tests only need pages to RENDER with plausible data, not to assert on
 * exact figures — so defaults are deliberately minimal. Add a more specific key
 * here when a page needs richer shape to render past a loading/empty guard.
 */
const ROUTES: Array<[string, () => unknown]> = [
  // Brand: drives BrandProvider / layout. Must be a real tenant (not platform).
  [
    "/tenant-brand",
    () => ({
      slug: "demo",
      name: "Demo Cricket Club",
      shortName: "Demo CC",
      primaryColor: "#1d4ed8",
      secondaryColor: "#0f172a",
      logoUrl: null,
    }),
  ],
  // Auth: nobody logged in for public smoke tests.
  ["/auth/me", () => null],
  ["/platform-admin/me", () => null],
  ["/captain-auth/me", () => null],
  // Nav surface used by home/layout.
  ["/nav-items", () => []],
  // Home overview + top performers.
  [
    "/senior/overview",
    () => ({
      seasons: [2025],
      latestSeason: 2025,
      recentMatches: [],
      grades: [],
    }),
  ],
  ["/senior/season-top-performers", () => ({ batting: [], bowling: [] })],
  ["/dashboard", () => ({ seasons: [2025], grades: [] })],
];

/** Default payload for any unmatched /api path: an empty list is the safest
 *  shape for the many list endpoints; object pages tolerate it via guards. */
function defaultPayload(): unknown {
  return [];
}

function payloadFor(url: string): unknown {
  for (const [needle, make] of ROUTES) {
    if (url.includes(needle)) return make();
  }
  return defaultPayload();
}

export interface InstalledMock {
  /** URLs the app requested during the test (handy for debugging). */
  calls: string[];
}

/** Replace global fetch with a canned in-memory API for the duration of a test. */
export function installApiMock(overrides: Record<string, unknown> = {}): InstalledMock {
  const calls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      calls.push(url);

      // Per-test overrides win over the standard table.
      let body: unknown = undefined;
      for (const [needle, value] of Object.entries(overrides)) {
        if (url.includes(needle)) {
          body = value;
          break;
        }
      }
      if (body === undefined) body = payloadFor(url);

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  return { calls };
}
