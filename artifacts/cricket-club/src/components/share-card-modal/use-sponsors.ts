import { useMemo } from "react";
import type { SocialSettingsBundle } from "@workspace/api-client-react";
import type { CardSponsor, ShareCardInput } from "@/lib/share-card";
import { cardSponsors, maxSponsorLogos } from "@/lib/share-card/sponsor-limit";
import { cardGrade } from "@/lib/pack-card-data";

// Resolves the sponsor strip for the current card: only when sponsors are
// enabled, the admin has not toggled them off, and the sponsor applies to this
// card kind, capped at the kind's logo limit (one on match result and premiership
// cards). `sponsorSig` is a stable signature used to re-render previews when
// the sponsor list loads async or its card-kind filtering changes the result.
export function useSponsors({
  bundle,
  includeSponsors,
  input,
  playerId,
}: {
  bundle: SocialSettingsBundle | undefined;
  includeSponsors: boolean;
  input: ShareCardInput | null;
  /** The one player the card is about (player sponsors). */
  playerId?: number | null;
}) {
  const strip = useMemo(() => {
    if (!bundle?.settings.sponsorsEnabled || !includeSponsors || !input) return null;
    // A team list carries its team's own sponsor, a player's card the
    // player's sponsors, else the club strip with the presenting one first.
    return cardSponsors(bundle?.activeSponsors ?? [], {
      kind: input.kind,
      grade: cardGrade(input),
      playerId,
    });
  }, [bundle, includeSponsors, input, playerId]);

  const sponsors: CardSponsor[] = useMemo(
    () =>
      input && strip
        ? strip.sponsors.slice(0, maxSponsorLogos(input.kind)).map((s) => ({
            name: s.name,
            logoUrl: s.logoUrl,
          }))
        : [],
    [input, strip],
  );

  // The "presented by <sponsor>" line: the club's presenting sponsor, or on a
  // player's card that carries their sponsors, the first of them. Gated like
  // the strip, so the line only appears when sponsors are enabled and included.
  const presentingSponsorName = strip?.presentingName ?? null;

  const sponsorSig = useMemo(
    () =>
      `${sponsors.map((s) => `${s.name}|${s.logoUrl}`).join("~")}#${presentingSponsorName ?? ""}`,
    [sponsors, presentingSponsorName],
  );

  return { sponsors, presentingSponsorName, sponsorSig };
}
