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

export type SizeKey = "sizeSquare" | "sizePortrait" | "sizeStory" | "sizeLandscape";

/**
 * The club's output sizes (portrait and story sizes plan, Stage 6). Portrait
 * and Story are the sizes new designs come in; Square and Landscape are older
 * sizes, shown only while a club has them on and never switched back on once
 * off (the server refuses it too).
 */
export const SIZE_KEYS: { key: SizeKey; label: string; code: string; older: boolean }[] = [
  { key: "sizePortrait", label: "Feed portrait", code: "1080×1350", older: false },
  { key: "sizeStory", label: "Story / TikTok", code: "1080×1920", older: false },
  { key: "sizeSquare", label: "Feed square", code: "1080×1080", older: true },
  { key: "sizeLandscape", label: "Landscape (links, X)", code: "1200×630", older: true },
];

/** The note under an older size's switch. */
export const OLDER_SIZE_SETTING_NOTE = "Older size: kept for your existing cards";

/**
 * The note under Story's switch (round 9, D17): Create offers Story only
 * while it's on, and automatic posts stay feed posts (D6).
 */
export const STORY_SETTING_NOTE =
  "Create offers Story while this is on. Automatic posts go to the feed only.";
