import type {
  PlayerDetail,
  CapEntry,
  TradingCardSettings,
} from "@workspace/api-client-react";
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

export interface CardPremiership {
  year: number;
  grade: string;
  competition: string;
}

export interface CardAward {
  title: string;
  /** Seasons (start years) the award was won, newest first. */
  seasons: number[];
}

export interface CardStatTile {
  label: string;
  value: number | string;
}

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
  /**
   * Admin-configured stat tiles (global, applies to every card). When null the
   * card falls back to the per-role default stat selection.
   */
  configuredStats: CardStatTile[] | null;
  achievements: {
    premierships: CardPremiership[];
    awards: CardAward[];
    records: string[];
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Catalog of every stat an admin can choose to show on the card, in a sensible
 * default order. The admin card-config page renders this list; the card builder
 * resolves the chosen keys against it. `value` reads from a built card record.
 */
export interface CardStatDef {
  key: string;
  label: string;
  value: (d: TradingCardData) => number | string;
}

export const STAT_CATALOG: CardStatDef[] = [
  { key: "matches", label: "Matches", value: (d) => d.stats.matches },
  { key: "runs", label: "Runs", value: (d) => d.stats.runs },
  { key: "battingAverage", label: "Bat Avg", value: (d) => d.stats.battingAverage || "-" },
  { key: "highScore", label: "High Score", value: (d) => d.additionalStats.highestScore },
  { key: "centuries", label: "Centuries", value: (d) => d.stats.centuries },
  { key: "halfCenturies", label: "Half-Centuries", value: (d) => d.stats.halfCenturies },
  { key: "wickets", label: "Wickets", value: (d) => d.stats.wickets },
  { key: "bowlingAverage", label: "Bowl Avg", value: (d) => d.stats.bowlingAverage || "-" },
  { key: "bestBowling", label: "Best Bowling", value: (d) => d.additionalStats.bestBowling },
  { key: "fiveWickets", label: "5-Wicket Hauls", value: (d) => d.stats.fiveWickets },
  { key: "catches", label: "Catches", value: (d) => d.additionalStats.catches },
  { key: "stumpings", label: "Stumpings", value: (d) => d.additionalStats.stumpings },
  { key: "runOuts", label: "Run Outs", value: (d) => d.additionalStats.runOuts },
  { key: "debut", label: "Debut", value: (d) => d.debutYear ?? "-" },
  { key: "seasons", label: "Seasons", value: (d) => d.careerSpan ?? "-" },
];

const STAT_CATALOG_MAP: Record<string, CardStatDef> = Object.fromEntries(
  STAT_CATALOG.map((s) => [s.key, s]),
);

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
 *
 * `settings` are the global, admin-chosen card contents (which stats + which
 * awards). When omitted or empty the card uses sensible per-role defaults and
 * shows every published award the player has won.
 */
export function buildTradingCardData(
  player: PlayerDetail,
  caps: CapEntry[] | undefined,
  // Optional gallery image chosen by an admin. Overrides the default photo
  // (players.image_url) when provided.
  overrideImageUrl?: string | null,
  settings?: TradingCardSettings | null,
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

  // Count and list EVERY premiership (year + competition), never collapsed by
  // year — a player can win two competitions in the same season.
  const premierships: CardPremiership[] = (player.premierships ?? [])
    .map((p) => ({ year: p.year, grade: p.grade, competition: p.competition }))
    .sort((a, b) => b.year - a.year || a.grade.localeCompare(b.grade));

  // Awards the player has won, filtered to the admin-eligible set (empty = all),
  // grouped by award with the seasons won listed newest-first.
  const awardKeys = settings?.awardKeys ?? [];
  const eligibleAwards = (player.awards ?? []).filter(
    (a) => awardKeys.length === 0 || awardKeys.includes(a.key),
  );
  const awardGroups = new Map<string, CardAward>();
  for (const a of eligibleAwards) {
    const existing = awardGroups.get(a.key) ?? { title: a.title, seasons: [] };
    existing.seasons.push(a.season);
    awardGroups.set(a.key, existing);
  }
  const awards: CardAward[] = [...awardGroups.values()].map((g) => ({
    title: g.title,
    seasons: [...g.seasons].sort((x, y) => y - x),
  }));

  const data: TradingCardData = {
    name: `${player.givenName} ${player.surname}`.trim(),
    number: capNumber,
    role: normaliseRole(player.cardRole) ?? deriveRole(agg),
    rating:
      typeof player.cardRating === "number" && player.cardRating > 0
        ? Math.min(5, Math.max(1, Math.round(player.cardRating)))
        : null,
    debutYear,
    careerSpan: player.seasonsPlayed ?? null,
    photoUrl:
      overrideImageUrl ??
      player.imageUrl ??
      (isFemalePlayer(player, agg) ? avatarFemale : avatarMale),
    usingFallback: !(overrideImageUrl ?? player.imageUrl),
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
    configuredStats: null,
    achievements: {
      premierships,
      awards,
      records: [],
    },
  };

  // Resolve the admin-chosen stat keys against the catalog. A per-role override
  // wins when set; otherwise the global statKeys apply; an empty result falls
  // back to the per-role smart defaults (configuredStats stays null).
  const roleOverride = settings?.statKeysByRole?.[data.role] ?? [];
  const statKeys = roleOverride.length > 0 ? roleOverride : (settings?.statKeys ?? []);
  if (statKeys.length > 0) {
    data.configuredStats = statKeys
      .map((k) => STAT_CATALOG_MAP[k])
      .filter((def): def is CardStatDef => Boolean(def))
      .map((def) => ({ label: def.label, value: def.value(data) }));
  }

  return data;
}
