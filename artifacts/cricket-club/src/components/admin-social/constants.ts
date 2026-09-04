import type { Platform } from "@/lib/captions";

/** Option lists shared by the social settings + caption template cards. */

export const ENGINES: {
  value: "ondemand" | "milestone" | "roundup" | "recap";
  label: string;
  desc: string;
}[] = [
  {
    value: "ondemand",
    label: "On-demand share",
    desc: "Share buttons on player, record and leaderboard pages.",
  },
  {
    value: "milestone",
    label: "Auto-milestone",
    desc: "Detect tier-crossings after each import and queue cards.",
  },
  { value: "roundup", label: "Round-up", desc: "Top performers per grade after each import." },
  { value: "recap", label: "Season recap", desc: "Manual season-end recap per grade." },
];

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "X / Twitter" },
];

export const SIZE_KEYS: {
  key: "sizeSquare" | "sizePortrait" | "sizeStory";
  label: string;
  code: string;
}[] = [
  { key: "sizeSquare", label: "Feed square", code: "1080×1080" },
  { key: "sizePortrait", label: "Feed portrait", code: "1080×1350" },
  { key: "sizeStory", label: "Story / TikTok", code: "1080×1920" },
];
