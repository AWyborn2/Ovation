/**
 * Neutral placeholder brand for the mobile app — what every screen shows until
 * `GET /tenant-brand` resolves (or when the API is unreachable). Deliberately
 * carries NO club identity: the real name, tagline and colours come from the
 * tenant's record via `useBrand()` in `lib/tenant-brand.tsx`. Never put a
 * specific club's values here — that is exactly how one club's brand would
 * leak onto another tenant's build.
 *
 * Store identity (app name, slug, bundle id) is separate and comes from the
 * `EXPO_PUBLIC_TENANT_*` build-time variables read by `app.config.ts`.
 */
export const DEFAULT_BRAND = {
  /** Full display name. */
  name: "Ovation",
  /** Short label used in tight UI (scorecards, headings). */
  shortName: "Ovation",
  /** Sub-line under the club name on the home hero; null = show nothing. */
  tagline: null as string | null,
  logoUrl: null as string | null,
  primaryColour: null as string | null,
  backgroundColour: null as string | null,
  juniorsColour: null as string | null,
};
