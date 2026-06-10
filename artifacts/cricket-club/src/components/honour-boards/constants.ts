import { Award, Target, Zap, Flame, UserPlus } from "lucide-react";
import type { MilestoneItem } from "@workspace/api-client-react";
import { BOARDS } from "@/lib/honour-boards";
import type { ActiveTab } from "./types";

// "Statistics" dropdown — every career/by-grade leaderboard except Games,
// which is surfaced at the top of the Honour Boards menu instead.
export const STATISTICS_ITEMS = BOARDS.filter((b) => b.key !== "games");

// "Honour Boards" dropdown — Games Played (a leaderboard, lifted to the top)
// plus the curated honour boards. A Grade Caps and Life Members are their own
// top-level tabs, so they are intentionally not in this list.
export const HONOUR_BOARD_ITEMS: { tab: ActiveTab; label: string }[] = [
  { tab: "games", label: "Games Played" },
  { tab: "awards", label: "Awards" },
  { tab: "team-of-decade", label: "Team of the Decade" },
  { tab: "committee", label: "Office Bearers" },
  { tab: "records", label: "Notable Records" },
];

export const tabClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 px-4 md:px-5 py-2.5 rounded text-xs md:text-sm font-bold uppercase tracking-wider transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-primary"
  }`;

export const dropdownItemClass = (active: boolean) =>
  `cursor-pointer text-xs md:text-sm font-semibold uppercase tracking-wider ${
    active ? "bg-primary/10 text-primary" : ""
  }`;

// Max cards shown in the "Just achieved" grid (debuts first, then milestones).
export const RECENT_ITEMS_LIMIT = 5;

export const MILESTONE_KIND_META: Record<
  MilestoneItem["kind"],
  { label: string; icon: typeof Award; cls: string }
> = {
  hatTrick: { label: "Hat-trick", icon: Flame, cls: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/30" },
  century: { label: "Century", icon: Target, cls: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  fiveFor: { label: "Five-for", icon: Zap, cls: "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/30" },
  debut: { label: "Debut", icon: UserPlus, cls: "text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/30" },
  career: { label: "Career", icon: Award, cls: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/30" },
};

export const MILESTONE_FILTERS: { value: MilestoneItem["kind"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "century", label: "Centuries" },
  { value: "fiveFor", label: "Five-fors" },
  { value: "hatTrick", label: "Hat-tricks" },
  { value: "debut", label: "Debuts" },
  { value: "career", label: "Career" },
];

export const MILESTONES_PREVIEW = 5;
