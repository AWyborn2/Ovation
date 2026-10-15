/**
 * Junior age groups (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md, KTD11).
 *
 * A TypeScript port of the one-off loader's SQL normalisers in `scripts/sql/juniors-etl.sql`
 * (`pg_temp.jr_norm_age` and `pg_temp.jr_band`), so the sync's grade classifier and junior
 * projection band grades exactly as the loaded history does. Keep the two in step: the
 * rules, their order and their regexes mirror the SQL one for one.
 *
 * Pure; no database access.
 */

// The SQL lower-cases the label first, then matches case-sensitively. Postgres `\m` (start
// of a word) is `\b` before a word character here.
const GIRLS_LEAGUE_RE = /girls? league/;
const UNDER_RE = /under\s*0*([0-9]+)/;
const U_RE = /\bu\s*0*([0-9]+)/;
const YEAR_RE = /year\s*([0-9]+(?:-[0-9]+)?)/;

/**
 * Canonicalise a junior grade / age-group label to one token: "U14", "Year 9", "Year 10-11"
 * or "Girls League"; null when the label carries none (`jr_norm_age`).
 */
export function normaliseJuniorAge(raw: string | null | undefined): string | null {
  const r = (raw ?? "").toLowerCase();
  if (GIRLS_LEAGUE_RE.test(r)) return "Girls League";
  const under = UNDER_RE.exec(r);
  if (under) return `U${under[1]}`;
  const u = U_RE.exec(r);
  if (u) return `U${u[1]}`;
  const year = YEAR_RE.exec(r);
  if (year) return `Year ${year[1]}`;
  return null;
}

/** The club's unified school-year bands for the legacy Under-age names (`jr_band`). */
const BAND_BY_UNDER_AGE: Readonly<Record<string, string>> = {
  U10: "Year 4",
  U11: "Year 5",
  U12: "Year 6",
  U13: "Year 7",
  U14: "Year 8",
  U15: "Year 9",
  U16: "Year 10-11",
  U17: "Year 10-11",
};

/**
 * The school-year band a junior label groups under (`jr_band`): U10 → "Year 4" … U16 / U17 →
 * "Year 10-11"; "Year N", "Year 10-11", "Girls League" and unbanded ages pass through; null
 * when the label carries no age group.
 */
export function juniorAgeBand(raw: string | null | undefined): string | null {
  const age = normaliseJuniorAge(raw);
  if (age === null) return null;
  return BAND_BY_UNDER_AGE[age] ?? age;
}
