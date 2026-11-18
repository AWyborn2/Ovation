import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A round as words: "Round 5" for a bare number (5 or "5"); a label that
 * already says so ("Round 5", junior rounds from PlayHQ) or names something
 * else ("Semi Final") as it is, never "Round Round 5". Null when blank.
 */
export function roundText(round: string | number | null | undefined): string | null {
  if (round == null) return null;
  const text = String(round).trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? `Round ${Number(text)}` : text;
}

/**
 * Human label for a match's identity within its season. A finals match has a
 * `stage` (e.g. "Grand Final") and no round; a regular match has a numeric
 * round. Returns null when neither is set.
 */
export function matchLabel(
  round: number | null | undefined,
  stage: string | null | undefined,
): string | null {
  if (stage) return stage;
  if (round != null) return `Round ${round}`;
  return null;
}
