import type { AwardMechanism, PointsCategories } from "@workspace/api-client-react";

export const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

export const MECHANISM_LABEL: Record<AwardMechanism, string> = {
  manual: "Manual",
  voted: "Voted (3-2-1)",
  points: "Points from stats",
};

export const POINTS_CATEGORIES: { key: keyof PointsCategories; label: string }[] = [
  { key: "runs", label: "Runs" },
  { key: "wickets", label: "Wickets" },
  { key: "catches", label: "Catches" },
  { key: "stumpings", label: "Stumpings" },
  { key: "runOuts", label: "Run outs" },
  { key: "games", label: "Games" },
  { key: "fifties", label: "Fifties (50–99)" },
  { key: "hundreds", label: "Hundreds (100+)" },
  { key: "fiveWickets", label: "Five-wicket hauls" },
];
