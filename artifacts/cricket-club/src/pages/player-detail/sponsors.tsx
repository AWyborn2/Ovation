import {
  useGetPlayerSponsors,
  getGetPlayerSponsorsQueryKey,
  type PlayerSponsorBadge,
} from "@workspace/api-client-react";

/**
 * A sponsor's website, only when it is a web address (never `javascript:` and
 * the like). The link is free text, so a bare domain ("joes.com.au") gets https.
 */
export function sponsorHref(link: string): string | null {
  const url = link.trim();
  if (/^https?:\/\/\S+$/i.test(url)) return url;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(url)) return `https://${url}`;
  return null;
}

/**
 * "Proudly sponsored by": the player's own sponsors (player sponsors), logo and
 * name, each linked to the sponsor's website when one is set. Nothing renders
 * when the player has none.
 */
export function PlayerSponsorStrip({ sponsors }: { sponsors: readonly PlayerSponsorBadge[] }) {
  if (sponsors.length === 0) return null;
  return (
    <section
      aria-label="Player sponsors"
      data-testid="player-sponsors"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-card px-5 py-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Proudly sponsored by
      </p>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {sponsors.map((sp) => {
          const href = sponsorHref(sp.link);
          const body = (
            <>
              {sp.logoUrl && (
                <img src={sp.logoUrl} alt="" className="h-10 max-w-[120px] object-contain" />
              )}
              <span className="text-sm font-semibold">{sp.name}</span>
            </>
          );
          return (
            <li key={sp.id}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 hover:text-primary-text"
                >
                  {body}
                </a>
              ) : (
                <span className="inline-flex items-center gap-3">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The player's active sponsors, read for the profile; nothing while loading or on error. */
export function PlayerSponsors({ playerId }: { playerId: number }) {
  const { data } = useGetPlayerSponsors(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerSponsorsQueryKey(playerId) },
  });
  return <PlayerSponsorStrip sponsors={data ?? []} />;
}
