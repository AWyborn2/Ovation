/**
 * Feat detection (ADR-005): a bowler's hat-trick and a fielder's five catches in
 * one innings, from a match's PlayHQ ball-by-ball and fielding rows. Pure: the
 * projector reads the rows and maps innings ids to numbers; this decides.
 *
 * Hat-trick: one bowler's deliveries in one innings in `seq` order, wides and
 * no-balls dropped, three consecutive wickets whose dismissal credits the
 * bowler. A run out never counts, and an unknown dismissal type never counts
 * (no false hat-tricks). Over boundaries and the batting order don't break it.
 * Four in a row is still one hat-trick.
 *
 * Five catches: `total_catches` (fielder plus keeper) of five or more for one
 * participant in one innings.
 */

export interface FeatBall {
  innings: number | null;
  seq: number;
  overNumber: number | null;
  bowlerId: string | null;
  bowlerName: string | null;
  isWicket: boolean;
  dismissalType: string | null;
  dismissedId: string | null;
  dismissedName: string | null;
  wides: number | null;
  noBalls: number | null;
}

export interface FeatFielding {
  innings: number | null;
  participantId: string;
  playerName: string | null;
  totalCatches: number | null;
}

export type DetectedFeat =
  | {
      kind: "hatTrick";
      innings: number | null;
      participantId: string;
      playerName: string | null;
      detail: {
        kind: "hatTrick";
        wickets: { seq: number; over: number | null; dismissed: string | null; how: string }[];
      };
    }
  | {
      kind: "fiveCatches";
      innings: number | null;
      participantId: string;
      playerName: string | null;
      detail: { kind: "fiveCatches"; catches: number };
    };

export const HAT_TRICK_WICKETS = 3;
export const FIVE_CATCHES = 5;

/** Dismissals the bowler is credited with, by PlayHQ's dismissal text (lower-cased, trimmed). */
const BOWLER_CREDITED = new Set([
  "bowled",
  "caught",
  "caught & bowled",
  "caught and bowled",
  "c&b",
  "lbw",
  "stumped",
  "hit wicket",
]);

/** Does this dismissal type credit the bowler? Unknown types never do. */
export function creditsBowler(dismissalType: string | null | undefined): boolean {
  if (!dismissalType) return false;
  return BOWLER_CREDITED.has(dismissalType.trim().toLowerCase());
}

/** Wides and no-balls are not legal deliveries. */
export function isLegalDelivery(b: Pick<FeatBall, "wides" | "noBalls">): boolean {
  return !(b.wides ?? 0) && !(b.noBalls ?? 0);
}

export function detectHatTricks(balls: readonly FeatBall[]): DetectedFeat[] {
  const byBowler = new Map<string, FeatBall[]>();
  for (const b of balls) {
    if (!b.bowlerId) continue;
    const key = `${b.innings ?? ""}|${b.bowlerId}`;
    let list = byBowler.get(key);
    if (!list) byBowler.set(key, (list = []));
    list.push(b);
  }
  const out: DetectedFeat[] = [];
  for (const list of byBowler.values()) {
    const legal = list.filter(isLegalDelivery).sort((a, b) => a.seq - b.seq);
    let streak: FeatBall[] = [];
    let found = false;
    for (const b of legal) {
      if (b.isWicket && creditsBowler(b.dismissalType)) {
        streak.push(b);
        if (streak.length === HAT_TRICK_WICKETS && !found) {
          found = true;
          const first = streak[0]!;
          out.push({
            kind: "hatTrick",
            innings: first.innings,
            participantId: first.bowlerId!,
            playerName: first.bowlerName,
            detail: {
              kind: "hatTrick",
              wickets: streak.map((w) => ({
                seq: w.seq,
                over: w.overNumber,
                dismissed: w.dismissedName,
                how: (w.dismissalType ?? "").trim().toLowerCase(),
              })),
            },
          });
        }
      } else {
        streak = [];
      }
    }
  }
  return out;
}

export function detectFiveCatches(fielding: readonly FeatFielding[]): DetectedFeat[] {
  const out: DetectedFeat[] = [];
  for (const f of fielding) {
    const catches = f.totalCatches ?? 0;
    if (catches >= FIVE_CATCHES) {
      out.push({
        kind: "fiveCatches",
        innings: f.innings,
        participantId: f.participantId,
        playerName: f.playerName,
        detail: { kind: "fiveCatches", catches },
      });
    }
  }
  return out;
}

/** Every feat in one match, hat-tricks first, in innings order. */
export function detectFeats(
  balls: readonly FeatBall[],
  fielding: readonly FeatFielding[],
): DetectedFeat[] {
  const feats = [...detectHatTricks(balls), ...detectFiveCatches(fielding)];
  return feats.sort(
    (a, b) =>
      (a.innings ?? 0) - (b.innings ?? 0) ||
      a.kind.localeCompare(b.kind) ||
      a.participantId.localeCompare(b.participantId),
  );
}
