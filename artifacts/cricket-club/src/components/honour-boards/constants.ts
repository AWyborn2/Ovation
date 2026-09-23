import { Award, Target, Zap, Flame, UserPlus } from "lucide-react";
import type { MilestoneItem } from "@workspace/api-client-react";

// Max cards shown in the "Just achieved" grid (debuts first, then milestones).
export const RECENT_ITEMS_LIMIT = 5;

export const MILESTONE_KIND_META: Record<
  MilestoneItem["kind"],
  { label: string; icon: typeof Award; cls: string }
> = {
  hatTrick: {
    label: "Hat-trick",
    icon: Flame,
    cls: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/30",
  },
  century: {
    label: "Century",
    icon: Target,
    cls: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  },
  fiveFor: {
    label: "Five-for",
    icon: Zap,
    cls: "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/30",
  },
  debut: {
    label: "Debut",
    icon: UserPlus,
    cls: "text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/30",
  },
  career: {
    label: "Career",
    icon: Award,
    cls: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/30",
  },
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
