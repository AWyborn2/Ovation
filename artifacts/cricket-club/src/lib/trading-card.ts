import type { PlayerDetail, CapEntry } from "@workspace/api-client-react";
import { aggregateCareer, type AggregatedPlayer } from "@/lib/honour-boards";
import avatarMale from "@/assets/card-avatar-male.png";
import avatarFemale from "@/assets/card-avatar-female.png";

export type CardRole = "Batsman" | "Bowler" | "All-Rounder" | "Wicket-Keeper";

export const CARD_ROLES: CardRole[] = [
  "Batsman",
  "Bowler",
  "All-Rounder",
  "Wicket-Keeper",
];

export interface TradingCardData {
  name: string;
  /** A Grade (male or female) cap number, or null if the player holds no A Grade cap. */
  number: number | null;
  role: CardRole;
  /** Optional 1-5 star rating; null hides the star row. */
  rating: number | null;
  debutYear: number | null;
  careerSpan: number | null;
  photoUrl: string;
  usingFallback: boolean;
  stats: {
    matches: number;
    runs: number;
    battingAverage: number;
    centuries: number;
    halfCenturies: number;
    wickets: number;
    bowlingAverage: number;
    fiveWickets: number;
  };
  additionalStats: {
    highestScore: string;
    bestBowling: string;
    catches: number;
    stumpings: number;
    runOuts: number;
  };
  achievements: {
    premierships: number[];
    awards: string[];
    records: string[];
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function isFemalePlayer(player: PlayerDetail, agg: AggregatedPlayer | undefined): boolean {
  if (player.gradesPlayed && /female/i.test(player.gradesPlayed)) return true;
  if (agg) {
    for (const g of agg.grades) {
      if (/female/i.test(g)) return true;
    }
  }
  return false;
}

function deriveRole(agg: AggregatedPlayer | undefined): CardRole {
  if (!agg) return "Batsman";
  if (agg.stumpings > 0) return "Wicket-Keeper";
  const battingScore = agg.runs;
  const bowlingScore = agg.wickets * 20;
  if (agg.runs >= 1000 && agg.wickets >= 50) return "All-Rounder";
  if (agg.wickets >= 25 && bowlingScore >= battingScore) return "Bowler";
  return "Batsman";
}

function normaliseRole(value: string | null | undefined): CardRole | null {
  if (!value) return null;
  const match = CARD_ROLES.find((r) => r.toLowerCase() === value.trim().toLowerCase());
  return match ?? null;
}

/**
 * Build the trading-card view model from a player detail record and the cap register.
 * The big "number" is the player's A Grade cap number, shown ONLY if they hold one.
 */
export function buildTradingCardData(
  player: PlayerDetail,
  caps: CapEntry[] | undefined,
): TradingCardData {
  const agg = aggregateCareer(player.stats)[0];

  const innings = agg?.innings ?? 0;
  const notOuts = agg?.notOuts ?? 0;
  const runs = agg?.runs ?? 0;
  const wickets = agg?.wickets ?? 0;
  const runsConceded = agg?.runsConceded ?? 0;
  const outs = innings - notOuts;

  const capNumber = caps?.find((c) => c.playerId === player.id)?.capNumber ?? null;
  // Debut + seasons come from the server (inferred from the match-data era).
  // null = career predates reliable scorecards, so the card shows "-".
  const debutYear = player.debutSeason ?? null;

  const premierships = (player.premierships ?? [])
    .map((p) => p.year)
    .filter((y): y is number => typeof y === "number");
  const premiershipYears = Array.from(new Set(premierships)).sort((a, b) => b - a);

  return {
    name: `${player.givenName} ${player.surname}`.trim(),
    number: capNumber,
    role: normaliseRole(player.cardRole) ?? deriveRole(agg),
    rating:
      typeof player.cardRating === "number" && player.cardRating > 0
        ? Math.min(5, Math.max(1, Math.round(player.cardRating)))
        : null,
    debutYear,
    careerSpan: player.seasonsPlayed ?? null,
    photoUrl: player.imageUrl ?? (isFemalePlayer(player, agg) ? avatarFemale : avatarMale),
    usingFallback: !player.imageUrl,
    stats: {
      matches: agg?.games ?? 0,
      runs,
      battingAverage: outs > 0 ? round2(runs / outs) : 0,
      centuries: agg?.hundreds ?? 0,
      halfCenturies: agg?.fifties ?? 0,
      wickets,
      bowlingAverage: wickets > 0 ? round2(runsConceded / wickets) : 0,
      fiveWickets: agg?.fiveWickets ?? 0,
    },
    additionalStats: {
      highestScore: agg?.highScoreDisplay ?? "-",
      bestBowling: agg?.bestBowling ?? "-",
      catches: agg?.catches ?? 0,
      stumpings: agg?.stumpings ?? 0,
      runOuts: agg?.runOuts ?? 0,
    },
    achievements: {
      premierships: premiershipYears,
      awards: [],
      records: [],
    },
  };
}
