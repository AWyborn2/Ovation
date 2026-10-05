/**
 * App-wide rule for "latest results": a group's most recent match is the one
 * with the latest match date, never the highest round. Finals carry no round
 * number and catch-up games can be played after a later round, so a round sort
 * surfaces the wrong game. Undated matches lose to dated ones; among equals the
 * input order decides, so callers pass rows in their existing fallback order
 * (round desc / id desc) and undated history keeps its old behaviour.
 */
export function latestByDate<T>(
  items: T[],
  groupOf: (item: T) => string,
  dateOf: (item: T) => string | null | undefined,
): T[] {
  const best = new Map<string, { item: T; key: string }>();
  for (const item of items) {
    const group = groupOf(item);
    const key = matchDateSortKey(dateOf(item));
    const cur = best.get(group);
    if (!cur || key > cur.key) best.set(group, { item, key });
  }
  return [...best.values()].map((b) => b.item);
}

/** Each grade's latest match by date — the senior home overview's results. */
export function latestPerGradeByDate<T extends { grade: string; matchDate: string | null }>(
  matches: T[],
): T[] {
  return latestByDate(
    matches,
    (m) => m.grade,
    (m) => m.matchDate,
  );
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A `YYYY-MM-DD` key for a stored match date, or "" when it can't be read.
 * Handles central's ISO dates and the native free-text form
 * ("12:20 PM, Saturday, 14 Mar 2026"), so string compare is chronological.
 */
export function matchDateSortKey(raw: string | null | undefined): string {
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const text = /\b(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4})\b/.exec(raw);
  const month = text ? MONTHS.indexOf(text[2].toLowerCase()) : -1;
  if (!text || month < 0) return "";
  return `${text[3]}-${String(month + 1).padStart(2, "0")}-${text[1].padStart(2, "0")}`;
}
