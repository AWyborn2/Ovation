import { useMemo } from "react";
import type { SocialSettingsBundle } from "@workspace/api-client-react";
import { sponsorAppliesToKind, type CardSponsor, type ShareCardInput } from "@/lib/share-card";

// Resolves the sponsor strip for the current card: only when sponsors are
// enabled, the admin has not toggled them off, and the sponsor applies to this
// card kind. `sponsorSig` is a stable signature used to re-render previews when
// the sponsor list loads async or its card-kind filtering changes the result.
export function useSponsors({
  bundle,
  includeSponsors,
  input,
}: {
  bundle: SocialSettingsBundle | undefined;
  includeSponsors: boolean;
  input: ShareCardInput | null;
}) {
  const sponsors: CardSponsor[] = useMemo(() => {
    if (!bundle?.settings.sponsorsEnabled || !includeSponsors || !input) return [];
    return (bundle?.activeSponsors ?? [])
      .filter((s) => sponsorAppliesToKind(s.cardKinds, input.kind))
      .map((s) => ({
        name: s.name,
        logoUrl: s.logoUrl,
      }));
  }, [bundle, includeSponsors, input]);

  const sponsorSig = useMemo(
    () => sponsors.map((s) => `${s.name}|${s.logoUrl}`).join("~"),
    [sponsors],
  );

  return { sponsors, sponsorSig };
}
