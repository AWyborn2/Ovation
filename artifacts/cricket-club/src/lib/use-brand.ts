import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { HALLS_HEAD_BRAND } from "@workspace/scorecard";

/**
 * Resolve the club's official logo URL from the single brand source of truth
 * (clubs register record id 2, surfaced via the social-settings `brand` field),
 * falling back to the built-in HALLS_HEAD_BRAND when the DB value is unavailable.
 * Use this everywhere the official club logo appears (navbar, page headers) so a
 * logo change in the database propagates across the whole site.
 */
export function useBrandLogo(): string {
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  return (
    bundle?.brand?.logoUrl ??
    HALLS_HEAD_BRAND.logoUrl ??
    ""
  );
}
