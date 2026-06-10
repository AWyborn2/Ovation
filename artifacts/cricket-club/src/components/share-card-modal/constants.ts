import type { MotionPreset, ShareCardInput } from "@/lib/share-card";
import type { Platform } from "@/lib/captions";

export type EngineKey = "ondemand" | "milestone" | "roundup" | "recap";

export type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ShareCardInput | null;
  engine?: EngineKey;
  appPath?: string; // e.g. "/players/123"
  trackedSlug?: string | null;
  /**
   * The player this tile is about, when there is one. Drives the photo control:
   * it lets the modal load the player's saved profile photo as the default and
   * save a freshly uploaded photo back to that profile. Omit for player-less
   * cards (e.g. premiership) to hide the photo control entirely.
   */
  playerId?: number | null;
  /**
   * When provided, the modal becomes an approval surface: it shows an
   * "Approve & download" button that renders the full card + caption bundle,
   * downloads the zip, then runs this callback (used by the social queue to
   * mark a draft + its milestone event as posted).
   */
  onApprove?: () => Promise<void> | void;
  approveLabel?: string;
};

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "X / Twitter" },
];

export const MOTION_OPTIONS: { value: MotionPreset; label: string }[] = [
  { value: "none", label: "None (still)" },
  { value: "fadeIn", label: "Fade in" },
  { value: "slideUp", label: "Slide up" },
  { value: "popIn", label: "Pop in (per element)" },
  { value: "wipe", label: "Wipe reveal" },
  { value: "stagger", label: "Staggered list" },
  { value: "countUp", label: "Count up numbers" },
];

// Admin-configurable clip length (ms). Bounded by the engine's safe band
// (1500–10000); these are the presets surfaced in the UI.
export const LENGTH_OPTIONS: { value: number; label: string }[] = [
  { value: 2000, label: "2s" },
  { value: 3500, label: "3.5s" },
  { value: 5000, label: "5s" },
  { value: 8000, label: "8s" },
];

// Admin-configurable animation speed multiplier (1 = default).
export const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0.5, label: "0.5× (slow)" },
  { value: 1, label: "1× (normal)" },
  { value: 1.5, label: "1.5×" },
  { value: 2, label: "2× (fast)" },
];
