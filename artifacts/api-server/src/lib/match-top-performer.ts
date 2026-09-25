import { isFillInPlayerId } from "@workspace/scorecard";

/** The fields of a club scorecard line the top-performer pick reads. */
export type PerformerLine = {
  playerId: number;
  batted: boolean;
  runs?: number | null;
  bowled: boolean;
  wickets?: number | null;
  runsConceded?: number | null;
};

/**
 * The club's top performer in a match, for a match-result card's featured
 * player: the top run-scorer, ties broken by the best bowling (most wickets,
 * then fewest runs conceded), then the lower id so the pick is stable.
 *
 * Fill-ins (`playerId >= 90000`) and unresolved ids (0 — a private or
 * unmapped central player) are never featured. Null when no club player batted
 * or bowled.
 */
export function topPerformerPlayerId(lines: readonly PerformerLine[]): number | null {
  const eligible = lines.filter(
    (l) => l.playerId > 0 && !isFillInPlayerId(l.playerId) && (l.batted || l.bowled),
  );
  if (eligible.length === 0) return null;
  const runs = (l: PerformerLine) => (l.batted ? (l.runs ?? 0) : -1);
  const wickets = (l: PerformerLine) => (l.bowled ? (l.wickets ?? 0) : -1);
  const conceded = (l: PerformerLine) =>
    l.bowled ? (l.runsConceded ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const [top] = [...eligible].sort(
    (a, b) =>
      runs(b) - runs(a) ||
      wickets(b) - wickets(a) ||
      conceded(a) - conceded(b) ||
      a.playerId - b.playerId,
  );
  return top.playerId;
}
