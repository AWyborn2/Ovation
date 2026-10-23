/**
 * The worst-case names fixture (social template library, L2-A task T2.3):
 * the longest names a card prints, taken from the associations' data, for
 * the fit check's worst-case content (`kind-templates/worst-case.ts`).
 *
 * Pure: the CLI (`refresh-worst-case-names.ts`) reads the names and writes
 * the fixture. Team, competition and ground names are public and kept as
 * they are. Player names are never committed: each long one becomes a
 * stand-in with the same word lengths, hyphens and apostrophes, so it wraps
 * and fits exactly as the real name would.
 */

import { autoCompetitionLabel, autoShortTeamName } from "@workspace/scorecard/card-names";
import { isJuniorGradeLabel } from "@workspace/scorecard";

export interface NameSources {
  /** Where the names came from, for the fixture's header. */
  label: string;
  teams: string[];
  grades: string[];
  venues: string[];
  players: string[];
}

/** A name as the source has it, and as a card prints it. */
export interface CardName {
  raw: string;
  card: string;
}

export interface WorstCaseNames {
  sources: string[];
  /** Longest team names as cards print them (`autoShortTeamName`). */
  teams: CardName[];
  /** Longest senior competition labels (`autoCompetitionLabel`). */
  grades: CardName[];
  /** Longest junior grade labels: junior day slides and junior cards print these. */
  juniorGrades: CardName[];
  venues: string[];
  /** Stand-ins for the longest player names (no real name is kept). */
  players: string[];
  /** Stand-ins for the player names with the longest single word (they can't wrap). */
  playersLongWord: string[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * A junior grade label. `isJuniorGradeLabel` misses "Under 14s" (it allows
 * the plural only after "U14"), so that form is caught here too; reported
 * separately rather than changed in this slice.
 */
const isJuniorGrade = (label: string) =>
  isJuniorGradeLabel(label) || /\bunder[\s-]?\d{1,2}'?s\b/i.test(label);

const longestWord = (s: string) => Math.max(0, ...s.split(/[\s-]+/).map((w) => w.length));

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const k = key(t).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The `n` longest, longest first; ties keep alphabetical order so the fixture is stable. */
function longest<T>(items: T[], len: (t: T) => number, label: (t: T) => string, n: number): T[] {
  return [...items].sort((a, b) => len(b) - len(a) || label(a).localeCompare(label(b))).slice(0, n);
}

const SYLLABLES = [
  "mar",
  "lo",
  "wen",
  "da",
  "ric",
  "sen",
  "ham",
  "ton",
  "bur",
  "ley",
  "cal",
  "vin",
  "dor",
  "ra",
  "nel",
  "son",
  "fer",
  "gus",
  "wor",
  "th",
];

/** A word of exactly `n` letters, capitalised, from `seed`. */
function standInWord(n: number, seed: number): string {
  let s = "";
  for (let i = 0; s.length < n; i++) s += SYLLABLES[(seed + i * 7) % SYLLABLES.length];
  s = s.slice(0, n);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A stand-in for a person's name: every letter replaced, word lengths,
 * spaces, hyphens, apostrophes and full stops kept. "O'Brien-Smythe" keeps
 * its shape; nothing of the real name survives.
 */
export function standInName(name: string, seed = 0): string {
  let word = 0;
  return clean(name).replace(/[\p{L}]+/gu, (letters) =>
    standInWord(letters.length, seed + word++ * 3),
  );
}

/** A player's "Last, First" (WA's full-name list) as "First Last". */
export function firstLast(name: string): string {
  const m = /^([^,]+),\s*(.+)$/.exec(clean(name));
  return m ? `${m[2]} ${m[1]}` : clean(name);
}

export function pickWorstCaseNames(sources: NameSources[], n = 5): WorstCaseNames {
  const all = <K extends keyof Omit<NameSources, "label">>(k: K) =>
    sources
      .flatMap((s) => s[k])
      .map(clean)
      .filter(Boolean);

  const teams = uniqueBy(
    all("teams").map((raw) => ({ raw, card: autoShortTeamName(raw) || raw })),
    (t) => t.card,
  );
  const grades = uniqueBy(
    all("grades").map((raw) => ({ raw, card: autoCompetitionLabel(raw) || raw })),
    (g) => g.card,
  );
  const venues = uniqueBy(all("venues"), (v) => v);
  const players = uniqueBy(all("players"), (p) => p);

  const byCard = (list: CardName[]) =>
    longest(
      list,
      (x) => x.card.length,
      (x) => x.card,
      n,
    );

  return {
    sources: sources.map((s) => s.label),
    teams: byCard(teams),
    grades: byCard(grades.filter((g) => !isJuniorGrade(g.raw))),
    juniorGrades: byCard(grades.filter((g) => isJuniorGrade(g.raw))),
    venues: longest(
      venues,
      (v) => v.length,
      (v) => v,
      n,
    ),
    players: longest(
      players,
      (p) => p.length,
      (p) => p,
      n,
    ).map((p, i) => standInName(p, i)),
    playersLongWord: longest(players, longestWord, (p) => p, 3).map((p, i) =>
      standInName(p, i + n),
    ),
  };
}

/** The fixture module's source (formatted by Prettier afterwards). */
export function fixtureSource(names: WorstCaseNames): string {
  return [
    "/**",
    " * The longest names cards print, for the fit check's worst-case content",
    " * (`worst-case.ts`). Generated by `scripts/src/refresh-worst-case-names.ts`;",
    " * don't edit by hand. Player names are stand-ins with the real names' shapes:",
    " * no real player name is kept.",
    " */",
    `export const WORST_CASE_NAMES = ${JSON.stringify(names, null, 2)} as const;`,
    "",
  ].join("\n");
}
