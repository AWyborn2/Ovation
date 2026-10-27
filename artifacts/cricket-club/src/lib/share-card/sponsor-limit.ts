/**
 * The sponsor strip rule lives in `@workspace/scorecard/card-sponsors`, shared
 * with the server's post render so the preview and the posted card agree.
 */
export {
  cardSponsors,
  gradeMatchKey,
  maxSponsorLogos,
  sponsorsForCard,
  PLAYER_SPONSOR_KINDS,
  type CardSponsorContext,
} from "@workspace/scorecard/card-sponsors";
