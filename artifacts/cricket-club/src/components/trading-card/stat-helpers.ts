import type { TradingCardData, CardPremiership } from "@/lib/trading-card";
import type { Phase } from "./constants";

// "{year} {grade}" plus the competition when it adds information (so two
// premierships in the same year + grade but different competitions read as
// distinct entries instead of identical chips). Mirrors player-detail.tsx.
export function premiershipLabel(p: CardPremiership): string {
  const base = `${p.year} ${p.grade}`;
  if (p.competition && p.competition.toUpperCase() !== p.grade.toUpperCase()) {
    return `${base} · ${p.competition}`;
  }
  return base;
}

export function mainStats(data: TradingCardData): { label: string; value: number | string }[] {
  const s = data.stats;
  const a = data.additionalStats;
  switch (data.role) {
    case "Bowler":
      return [
        { label: "Matches", value: s.matches },
        { label: "Wickets", value: s.wickets },
        { label: "Bowl Avg", value: s.bowlingAverage || "-" },
        { label: "Best", value: a.bestBowling },
      ];
    case "All-Rounder":
      return [
        { label: "Runs", value: s.runs },
        { label: "Bat Avg", value: s.battingAverage || "-" },
        { label: "Wickets", value: s.wickets },
        { label: "Bowl Avg", value: s.bowlingAverage || "-" },
      ];
    default:
      return [
        { label: "Matches", value: s.matches },
        { label: "Runs", value: s.runs },
        { label: "Bat Avg", value: s.battingAverage || "-" },
        { label: "High Score", value: a.highestScore },
      ];
  }
}

export function frontStats(data: TradingCardData): { label: string; value: number | string }[] {
  const s = data.stats;
  const a = data.additionalStats;
  switch (data.role) {
    case "Bowler":
      return [
        { label: "Matches", value: s.matches },
        { label: "Wickets", value: s.wickets },
        { label: "Bowl Avg", value: s.bowlingAverage || "-" },
        { label: "High Score", value: a.highestScore },
      ];
    case "All-Rounder":
      return [
        { label: "Runs", value: s.runs },
        { label: "Wickets", value: s.wickets },
        { label: "High Score", value: a.highestScore },
        { label: "Matches", value: s.matches },
      ];
    default:
      return [
        { label: "Matches", value: s.matches },
        { label: "Runs", value: s.runs },
        { label: "Wickets", value: s.wickets },
        { label: "High Score", value: a.highestScore },
      ];
  }
}

export function perfBars(data: TradingCardData): { label: string; value: number; max: number }[] {
  const s = data.stats;
  const bar = (value: number, floor: number) => ({
    value,
    max: Math.max(floor, Math.ceil(value * 1.15)),
  });
  switch (data.role) {
    case "Bowler":
      return [
        { label: "5-Wicket Hauls", ...bar(s.fiveWickets, 5) },
        { label: "Wickets", ...bar(s.wickets, 100) },
      ];
    case "All-Rounder":
      return [
        { label: "Centuries", ...bar(s.centuries, 5) },
        { label: "5-Wicket Hauls", ...bar(s.fiveWickets, 5) },
      ];
    default:
      return [
        { label: "Centuries", ...bar(s.centuries, 5) },
        { label: "Half-Centuries", ...bar(s.halfCenturies, 10) },
      ];
  }
}

export function careerStatTiles(data: TradingCardData): { label: string; value: number | string }[] {
  return data.configuredStats ?? mainStats(data);
}

export function activePhases(data: TradingCardData): Phase[] {
  const s = data.stats;
  const a = data.additionalStats;
  const phases: Phase[] = ["intro", "careerStats"];
  if (data.role !== "Bowler" && s.runs > 0) phases.push("batting");
  if (s.wickets > 0) phases.push("bowling");
  if (a.catches + a.stumpings + a.runOuts > 0) phases.push("fielding");
  if (data.achievements.premierships.length > 0) phases.push("premierships");
  if (data.achievements.awards.length > 0) phases.push("awards");
  phases.push("outro");
  return phases;
}

export function phaseDurations(phases: Phase[]): number[] {
  const weight: Record<Phase, number> = {
    intro: 2.4,
    careerStats: 3,
    batting: 2.6,
    bowling: 2.6,
    fielding: 2.2,
    premierships: 2.4,
    awards: 2.6,
    outro: 2.4,
  };
  const weights = phases.map((p) => weight[p]);
  const sum = weights.reduce((x, y) => x + y, 0);
  const TARGET = 18000;
  return weights.map((w) => Math.round((w / sum) * TARGET));
}
