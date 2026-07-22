/**
 * Match-date parsing for the milestones board.
 *
 * Match dates arrive as free text from several ingestion paths, so this has to
 * be forgiving. It previously lived inside `routes/milestones.ts` and returned
 * `null` on anything it didn't recognise — silently, which mattered more than
 * it looks: the board derives its whole recency window from the latest
 * *parseable* date, so a format this doesn't understand doesn't just drop one
 * row, it can shift what "recent" means for every milestone on the page.
 *
 * Extracted here so it can be unit-tested without a database connection.
 */

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Reject a well-formed but impossible date (e.g. 31 Feb, month 13). */
function isRealDate(y: string, m: string, d: string): boolean {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

const iso = (y: string, m: string, d: string): string | null =>
  isRealDate(y, m, d) ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null;

/**
 * Normalise a raw match date to `YYYY-MM-DD`, or null when it cannot be read.
 *
 * Understands, in order: ISO-ish `2024-01-12`, `12 Jan 2024` / `12 January
 * 2024`, and day-first slash or dot forms `12/01/2024`, `12-01-2024`,
 * `12.1.2024`. Day-first is the correct reading here — this is an Australian
 * competition, and the ingestion sources are Australian.
 */
export function parseMatchDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = d.replace(/"/g, "").trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return iso(isoMatch[1], isoMatch[2], isoMatch[3]);

  const named = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (named) {
    const mon = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    return iso(named[3], mon, named[1]);
  }

  // Day-first numeric: 12/01/2024, 12-01-2024, 12.1.2024, and 2-digit years.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (slash) {
    const year =
      slash[3].length === 2
        ? Number(slash[3]) <= 69
          ? `20${slash[3]}`
          : `19${slash[3]}`
        : slash[3];
    return iso(year, slash[2], slash[1]);
  }

  return null;
}

/**
 * Split rows into parsed dates and the raw values that could not be read.
 *
 * The caller uses `unparsed` to emit a data-quality signal instead of letting
 * bad input vanish. Blank/absent dates are NOT reported: a match with no date
 * recorded is ordinary missing data, whereas a non-empty value the parser
 * cannot read is a format the importer should have handled.
 */
export function partitionMatchDates(
  raw: (string | null | undefined)[],
): { parsed: string[]; unparsed: string[] } {
  const parsed: string[] = [];
  const unparsed: string[] = [];
  for (const value of raw) {
    const normalised = parseMatchDate(value);
    if (normalised) {
      parsed.push(normalised);
      continue;
    }
    const trimmed = value?.replace(/"/g, "").trim();
    if (trimmed) unparsed.push(trimmed);
  }
  return { parsed, unparsed };
}
