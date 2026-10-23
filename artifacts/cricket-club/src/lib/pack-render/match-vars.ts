/**
 * A card's `match` palette (Ovation Match Graphics, plan 2026-10-23, M5–M8):
 * both teams' colours, by batting order and by result, for documents that
 * name `var(--mt-*)`. The club's side comes from its brand; the opposition's
 * from the match input (a match input stores a team's colour it's known by as
 * `secondaryColor` and its base as `primaryColor`, as `deriveClubColors` and
 * `deriveOppositionColors` write them). A card that isn't a match (an element
 * preview, another kind) draws the club against a neutral opposition.
 */
import { matchColours, type MatchColours } from "@workspace/scorecard/match-palette";
import type { ShareCardInput } from "../share-card";
import type { PackCardData, PackTokens } from "./types";

/** The opposition a card without a match draws against: slate and silver. */
const NEUTRAL_OPPOSITION = { identity: "#9aa6b2", base: "#1f2733" };

export function cardMatchColours(
  input: ShareCardInput | null | undefined,
  tokens: PackTokens | undefined,
  brand: PackCardData["brand"] | null | undefined,
): MatchColours {
  const identity = brand?.primaryColour || tokens?.accent || "#fbac27";
  const base = brand?.backgroundColour || tokens?.panel || "#333f48";
  const club = { identity, base };
  const competition = { colour: base, accent: identity };
  if (input?.kind !== "matchSummary")
    return matchColours({
      club,
      opposition: NEUTRAL_OPPOSITION,
      firstInnings: "club",
      winner: "club",
      competition,
    });
  return matchColours({
    club,
    opposition: {
      identity: input.opposition.secondaryColor || NEUTRAL_OPPOSITION.identity,
      base: input.opposition.primaryColor || NEUTRAL_OPPOSITION.base,
    },
    firstInnings: input.innings[0]?.teamKey === "opposition" ? "opposition" : "club",
    winner: input.resultWinner,
    competition,
  });
}
