/** Carousel-set editor model: slide working copy, option lists and mappers. */

import type { CardSetSlide, CardLayoutLayer } from "@workspace/api-client-react";
import type { ShareCardInput, MotionPreset } from "@/lib/share-card";

export const MOTION_OPTIONS: { value: MotionPreset; label: string }[] = [
  { value: "none", label: "No animation (still PNG)" },
  { value: "fadeIn", label: "Fade in" },
  { value: "countUp", label: "Count up numbers" },
];

export const MIN_SLIDES = 2;
export const MAX_SLIDES = 10;

export const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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

// Working copy of a slide. The persisted `CardSetSlide.input` is opaque jsonb;
// in the editor we treat it as a concrete `ShareCardInput` so the renderer,
// studio editor and pickers can all share one type.
export type WorkingSlide = {
  id: string;
  input: ShareCardInput;
  layout?: CardLayoutLayer[];
  themeId?: number | null;
  motionPreset?: MotionPreset;
};

export const newId = () =>
  `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const toWorking = (s: CardSetSlide): WorkingSlide => ({
  id: s.id,
  input: s.input as unknown as ShareCardInput,
  layout: s.layout ?? undefined,
  themeId: s.themeId ?? null,
  motionPreset: (s.motionPreset as MotionPreset | undefined) ?? "none",
});

export const toApiSlide = (s: WorkingSlide): CardSetSlide => ({
  id: s.id,
  input: s.input as unknown as CardSetSlide["input"],
  layout: s.layout && s.layout.length ? s.layout : undefined,
  themeId: s.themeId ?? null,
  motionPreset: s.motionPreset ?? "none",
});

// Short human label for a bound slide so the filmstrip is scannable.
export function slideLabel(input: ShareCardInput): string {
  switch (input.kind) {
    case "matchSummary":
      return input.matchTitle;
    case "player":
      return input.playerName;
    case "gradeLeader":
      return `${input.playerName} — ${input.grade}`;
    case "record":
      return `${input.title}: ${input.playerName}`;
    default:
      return input.kind;
  }
}
