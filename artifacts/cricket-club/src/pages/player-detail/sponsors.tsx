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
export function PlayerSponsorStrip({
  sponsors,
  variant = "card",
}: {
  sponsors: readonly PlayerSponsorBadge[];
  /**
   * `hero`: over the profile photo, top-left of the hero (Ash, 28 Oct 2026),
   * as a dark glass panel with each logo on a white tile. `card`: a page card.
   */
  variant?: "card" | "hero";
}) {
  if (sponsors.length === 0) return null;
  const hero = variant === "hero";
  return (
    <section
      aria-label="Player sponsors"
      data-testid="player-sponsors"
      data-variant={variant}
      className={
        hero
          ? // First in the hero's bottom-aligned column: mb-auto lifts it to the top.
            "mb-auto flex max-w-full flex-col items-start gap-2 self-start rounded-2xl border border-white/20 bg-black/50 px-4 py-3 text-white backdrop-blur-sm"
          : "flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-card px-5 py-4"
      }
    >
      <p
        className={
          hero
            ? "font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75"
            : "text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        }
      >
        Proudly sponsored by
      </p>
      <ul
        className={
          hero
            ? "flex flex-wrap items-center gap-x-4 gap-y-2"
            : "flex flex-wrap items-center gap-x-6 gap-y-3"
        }
      >
        {sponsors.map((sp) => {
          const href = sponsorHref(sp.link);
          const body = (
            <>
              {sp.logoUrl &&
                (hero ? (
                  <span className="inline-flex h-11 items-center rounded-md bg-white px-2">
                    <img src={sp.logoUrl} alt="" className="h-8 max-w-[110px] object-contain" />
                  </span>
                ) : (
                  <img src={sp.logoUrl} alt="" className="h-10 max-w-[120px] object-contain" />
                ))}
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
                  className={
                    hero
                      ? "inline-flex items-center gap-3 hover:underline"
                      : "inline-flex items-center gap-3 hover:text-primary-text"
                  }
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
export function PlayerSponsors({
  playerId,
  variant,
}: {
  playerId: number;
  variant?: "card" | "hero";
}) {
  const { data } = useGetPlayerSponsors(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerSponsorsQueryKey(playerId) },
  });
  return <PlayerSponsorStrip sponsors={data ?? []} variant={variant} />;
}
