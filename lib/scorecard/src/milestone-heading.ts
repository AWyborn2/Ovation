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

/**
 * What a century card's innings is, by its runs. The century kind also carries
 * a junior Big Moment innings, which a club can set to count from 50 (the
 * junior runs bar, R11), so a 52 is a fifty, not a century. Under 50 (a card
 * typed by hand) or with no runs at all, the card keeps its century wording.
 */
export type InningsFeat = { word: "Century" | "Fifty"; threshold: 100 | 50 };

export function centuryCardFeat(runs: unknown): InningsFeat {
  const n =
    typeof runs === "number"
      ? runs
      : typeof runs === "string" && runs.trim() !== ""
        ? Number(runs)
        : NaN;
  return Number.isFinite(n) && n >= 50 && n < 100
    ? { word: "Fifty", threshold: 50 }
    : { word: "Century", threshold: 100 };
}

/**
 * A century card's fixed text in the wording of its innings: "CENTURY" (in any
 * case) reads "FIFTY" on a fifty. Text that doesn't name a century is kept.
 */
export function centuryCardText(text: string, runs: unknown): string {
  if (centuryCardFeat(runs).word === "Century") return text;
  return text.replace(/\bcentury\b/gi, (w) =>
    w === w.toUpperCase() ? "FIFTY" : w[0] === "C" ? "Fifty" : "fifty",
  );
}
