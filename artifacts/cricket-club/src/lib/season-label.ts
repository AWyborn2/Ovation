/**
 * "2025/26" from a season start year. Lives in its own module so public pages
 * (milestone cards) can format seasons without importing the 4k-line card
 * renderer; share-card.ts re-exports it for existing callers.
 */
export const seasonLabel = (year: number): string =>
  `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
