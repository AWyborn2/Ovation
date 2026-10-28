import { isFillInPlayerId } from "./fill-in";

/**
 * Which sponsors a social card carries (sponsor per team, player sponsors).
 * One rule for the Studio preview, the share card and the server's post
 * render, so what an admin previews is what gets posted.
 */

/**
 * Card kinds that carry a single sponsor logo: a match result and a
 * premiership card keep the spotlight on the result, and a team list carries
 * its team's own sponsor, so their "Supported by" strip shows one logo rather
 * than the usual row.
 */
const ONE_SPONSOR_KINDS: ReadonlySet<string> = new Set(["matchSummary", "premiership", "teamList"]);

/**
 * Cards about one player (player sponsors): the player's own sponsors replace
 * the club strip. Big Moment (a hat-trick, five catches) joined the list on
 * 28 Oct 2026. Results, team lists, records, grade leaders and the rest keep
 * the club strip. An announcement follows a player only when one is
 * picked for it by hand ("Meet our sponsored player").
 */
export const PLAYER_SPONSOR_KINDS: ReadonlySet<string> = new Set([
  "milestone",
  "century",
  "fiveFor",
  "debut",
  "player",
  "newSigning",
  "bigMoment",
  "announcement",
]);

/**
 * The template fields a player-sponsor card offers: the player's first and
 * second sponsor (name and logo), empty when the card's player has none.
 */
export const PLAYER_SPONSOR_FIELDS = ["playerSponsorName", "playerSponsor2Name"] as const;
export const PLAYER_SPONSOR_IMAGES = ["playerSponsorLogo", "playerSponsor2Logo"] as const;

/** The most sponsor logos a card of `kind` shows; undefined = the renderer's own cap. */
export function maxSponsorLogos(kind: string): number | undefined {
  return ONE_SPONSOR_KINDS.has(kind) ? 1 : undefined;
}

/** A grade label for matching ("A Grade", "a-grade " → "agrade"). */
export function gradeMatchKey(grade: string | null | undefined): string {
  return (grade ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A sponsor's card types allow `kind` (empty = every card). */
export function sponsorAppliesToKind(
  cardKinds: string[] | null | undefined,
  kind: string,
): boolean {
  return !cardKinds || cardKinds.length === 0 || cardKinds.includes(kind);
}

export type SponsorLike = {
  name: string;
  cardKinds?: string[] | null;
  grades?: string[] | null;
  players?: ReadonlyArray<{ id: number }> | null;
  isPresenting?: boolean | null;
};

export type CardSponsorContext = {
  kind: string;
  /** The card's grade (team lists). */
  grade?: string | null;
  /** The one player the card is about (player-centred kinds). */
  playerId?: number | null;
};

const hasTeams = (sp: SponsorLike) => (sp.grades ?? []).some((g) => gradeMatchKey(g));
const hasPlayers = (sp: SponsorLike) => (sp.players ?? []).length > 0;

/**
 * Whether a sponsor shows club-wide on `kind`. A player sponsor (one tagged
 * with players) is personal: it shows on other cards only where its card
 * types are set and include the kind.
 */
function clubWide(sp: SponsorLike, kind: string): boolean {
  if (!hasPlayers(sp)) return sponsorAppliesToKind(sp.cardKinds, kind);
  return (sp.cardKinds ?? []).includes(kind);
}

const presentingFirst = <S extends SponsorLike>(list: S[]) =>
  list.sort((a, b) => Number(!!b.isPresenting) - Number(!!a.isPresenting));

/** The card's player when sponsors can follow them: a real, non-fill-in id on a player kind. */
function sponsoredPlayer(ctx: CardSponsorContext): number | null {
  const id = ctx.playerId;
  if (!PLAYER_SPONSOR_KINDS.has(ctx.kind)) return null;
  if (id == null || !Number.isInteger(id) || id <= 0 || isFillInPlayerId(id)) return null;
  return id;
}

/**
 * The sponsors a card carries, in strip order:
 *
 *  - a card about one player with sponsors of their own carries those only;
 *  - a team list whose grade has its own sponsor carries that sponsor only;
 *  - otherwise the club-wide sponsors for the kind, the presenting sponsor
 *    first, leaving out another team's sponsor on a team list and every
 *    player sponsor on a player card.
 */
export function sponsorsForCard<S extends SponsorLike>(
  sponsors: readonly S[],
  ctx: CardSponsorContext,
): S[] {
  const { kind } = ctx;
  const playerId = sponsoredPlayer(ctx);
  if (playerId !== null) {
    const own = sponsors.filter((sp) => (sp.players ?? []).some((p) => p.id === playerId));
    if (own.length > 0) return own;
  }
  if (kind === "teamList") {
    const key = gradeMatchKey(ctx.grade);
    const own = key
      ? sponsors.filter((sp) => (sp.grades ?? []).some((g) => gradeMatchKey(g) === key))
      : [];
    if (own.length > 0) return [...own];
    return presentingFirst(sponsors.filter((sp) => !hasTeams(sp) && clubWide(sp, kind)));
  }
  if (PLAYER_SPONSOR_KINDS.has(kind)) {
    return presentingFirst(sponsors.filter((sp) => !hasPlayers(sp) && clubWide(sp, kind)));
  }
  return presentingFirst(sponsors.filter((sp) => clubWide(sp, kind)));
}

/**
 * The card's strip, its "presented by" name and the player's own sponsors.
 * On a player's card that carries their sponsors, the line names the first of
 * them and `playerSponsors` lists them (the `{{playerSponsor…}}` fields);
 * otherwise the line names the club's presenting sponsor (null when there is
 * none) and `playerSponsors` is empty.
 */
export function cardSponsors<S extends SponsorLike>(
  sponsors: readonly S[],
  ctx: CardSponsorContext,
): { sponsors: S[]; presentingName: string | null; playerSponsors: S[] } {
  const strip = sponsorsForCard(sponsors, ctx);
  const playerId = sponsoredPlayer(ctx);
  const first = strip[0];
  const ownStrip =
    playerId !== null &&
    first !== undefined &&
    strip.every((sp) => (sp.players ?? []).some((p) => p.id === playerId));
  return {
    sponsors: strip,
    presentingName: ownStrip ? first.name : (sponsors.find((sp) => sp.isPresenting)?.name ?? null),
    playerSponsors: ownStrip ? strip : [],
  };
}
