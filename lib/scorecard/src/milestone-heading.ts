/**
 * The heading over a milestone card's big number. A games-played milestone
 * reads "Club Milestone" at every tier (Ash, 28 Oct 2026): "Centurion" only
 * fits 100, and "150 Games" would repeat the number and "GAMES" under it. The
 * honour boards keep the tier's own name ("100 Games"); this is the card's
 * wording only. A heading an admin typed themselves is kept as it is.
 */
export const GAMES_MILESTONE_HEADING = "Club Milestone";

export function milestoneCardHeading(tierLabel: string, milestoneLabel: string): string {
  const games = /^games?(\s+played)?$/i.test(milestoneLabel.trim());
  const tierName = /^(centurion|\d+\s+games?)$/i.test(tierLabel.trim());
  return games && tierName ? GAMES_MILESTONE_HEADING : tierLabel;
}
