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
  { value: "countUp", label: "Count up numbers" },
];
