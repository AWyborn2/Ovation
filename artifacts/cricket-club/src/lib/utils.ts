import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
  if (stage) return stage
  if (round != null) return `Round ${round}`
  return null
}
