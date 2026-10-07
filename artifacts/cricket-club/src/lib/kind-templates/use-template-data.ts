/**
 * The club's card data for previewing a card kind template (plan U8/U10):
 * brand, hashtag, kind sponsors and colour modes, built through
 * `buildPackData` exactly as the Studio editor does, so template previews and
 * server renders show the same club.
 */
import { useMemo } from "react";
import {
  getGetSocialSettingsQueryKey,
  useGetSocialSettings,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { useBrand } from "@/lib/brand-context";
import {
  buildPackData,
  kindSponsors,
  presentingSponsorName,
  tenantHashtag,
} from "@/lib/pack-card-data";
import type { PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";

/** A stand-in action photo for previews, so photo layers show where they sit. */
export const PREVIEW_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#5b6b7a"/><circle cx="200" cy="110" r="55" fill="#8a99a8"/><rect x="110" y="180" width="180" height="120" rx="60" fill="#8a99a8"/></svg>',
  );

export function useKindTemplateData(
  kind: ShareCardInput["kind"],
  opts: { photoUrl?: string | null } = {},
): { data: PackCardData; clubName: string | null; loading: boolean } {
  const brand = useBrand();
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const photoUrl = opts.photoUrl === undefined ? PREVIEW_PHOTO : opts.photoUrl;
  const data = useMemo(
    () => ({
      ...buildPackData({
        brand: bundle?.brand ?? brand,
        hashtag: tenantHashtag(bundle),
        sponsors: kindSponsors(bundle, kind, true, null),
        presentingSponsorName: presentingSponsorName(bundle, true),
        packColourModes: bundle?.settings.packColourModes,
      }),
      photoUrl: photoUrl ?? undefined,
    }),
    [bundle, brand, kind, photoUrl],
  );
  return {
    data,
    clubName: (bundle?.brand ?? brand)?.name ?? null,
    loading: settingsQ.isLoading,
  };
}
