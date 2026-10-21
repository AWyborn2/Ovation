/**
 * Junior opponent and grade names for JUNIOR cards: the Juniors tab of Social
 * Studio's "Team and competition names".
 *
 * Juniors isolation (replit.md): everything here reads the junior tables
 * (`junior_fixtures`, `junior_matches`) and the junior override tables only,
 * and only junior cards use the result. Senior names (`names.ts`) never reach
 * a junior card and junior names never reach a senior one.
 *
 * Junior opponents have no central club id, so a team is keyed on the
 * normalised automatic short name of its PlayHQ name ({@link juniorTeamKey}):
 * "Mandurah U13 Blue" and "Mandurah U15" are one row, "Mandurah". A grade is
 * keyed on what junior cards print at their head: the age group, else the grade.
 *
 * Every card resolves the same way as a senior one: the club's own name →
 * the automatic short name → the raw name, with the crest the club chose
 * winning over the automatic one (the clubs register, where it knows the club).
 */

import { and, eq, gte, sql } from "drizzle-orm";
import {
  db,
  juniorCompetitionLabelOverridesTable,
  juniorFixturesTable,
  juniorMatchesTable,
  juniorTeamCrestOverridesTable,
  juniorTeamNameOverridesTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import {
  autoCompetitionLabel,
  autoShortTeamName,
  cardNameKey,
  teamMonogram,
  type CardNames,
} from "@workspace/scorecard/card-names";
import { logger } from "../logger";
import { juniorOpponentCrest } from "./team-list";
import {
  crestChoiceValue,
  crestOf,
  type CrestChoice,
  type CrestChoiceSource,
  type NameSource,
} from "./names";

/** The key every age group of one junior opponent shares: "Mandurah U13 Blue" → "mandurah". */
export const juniorTeamKey = (raw: string | null | undefined): string =>
  cardNameKey(autoShortTeamName(raw));

/** What a junior card prints at its head for a match or fixture: the age group, else the grade. */
export const juniorGradeKeyOf = (row: { ageGroup?: string | null; grade?: string | null }) =>
  (row.ageGroup || row.grade || "Juniors").replace(/\s+/g, " ").trim();

const tidy = (s: string | null | undefined): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
};

const isBye = (name: string) => /^bye$/i.test(name.trim());

const source = (override: string | null, auto: string, raw: string): NameSource =>
  override ? "override" : auto !== raw ? "auto" : "raw";

// ── Overrides (tenant DB, junior tables) ───────────────────────────────────

export async function loadJuniorTeamNameOverrides(tenantId: number) {
  return db
    .select()
    .from(juniorTeamNameOverridesTable)
    .where(eq(juniorTeamNameOverridesTable.tenantId, tenantId))
    .orderBy(juniorTeamNameOverridesTable.id);
}

export async function loadJuniorTeamCrestOverrides(tenantId: number) {
  return db
    .select()
    .from(juniorTeamCrestOverridesTable)
    .where(eq(juniorTeamCrestOverridesTable.tenantId, tenantId))
    .orderBy(juniorTeamCrestOverridesTable.id);
}

export async function loadJuniorCompetitionLabelOverrides(tenantId: number) {
  return db
    .select()
    .from(juniorCompetitionLabelOverridesTable)
    .where(eq(juniorCompetitionLabelOverridesTable.tenantId, tenantId))
    .orderBy(juniorCompetitionLabelOverridesTable.id);
}

/** Set (or, with an empty name, clear) the club's short name for a junior opponent. */
export async function setJuniorTeamNameOverride(
  tenantId: number,
  teamKey: string,
  shortName: string | null,
): Promise<void> {
  const key = cardNameKey(teamKey);
  if (!key) return;
  const name = tidy(shortName);
  if (name === null) {
    await db
      .delete(juniorTeamNameOverridesTable)
      .where(
        and(
          eq(juniorTeamNameOverridesTable.tenantId, tenantId),
          eq(juniorTeamNameOverridesTable.teamKey, key),
        ),
      );
    return;
  }
  await db
    .insert(juniorTeamNameOverridesTable)
    .values({ tenantId, teamKey: key, shortName: name })
    .onConflictDoUpdate({
      target: [juniorTeamNameOverridesTable.tenantId, juniorTeamNameOverridesTable.teamKey],
      set: { shortName: name, updatedAt: sql`now()` },
    });
}

/** Set the club's crest for a junior opponent; null resets to the automatic crest. */
export async function setJuniorTeamCrestOverride(
  tenantId: number,
  teamKey: string,
  choice: CrestChoice | null,
): Promise<void> {
  const key = cardNameKey(teamKey);
  if (!key) return;
  if (choice === null) {
    await db
      .delete(juniorTeamCrestOverridesTable)
      .where(
        and(
          eq(juniorTeamCrestOverridesTable.tenantId, tenantId),
          eq(juniorTeamCrestOverridesTable.teamKey, key),
        ),
      );
    return;
  }
  const crestUrl = choice.crestSource === "initials" ? null : choice.crestUrl;
  await db
    .insert(juniorTeamCrestOverridesTable)
    .values({ tenantId, teamKey: key, crestSource: choice.crestSource, crestUrl })
    .onConflictDoUpdate({
      target: [juniorTeamCrestOverridesTable.tenantId, juniorTeamCrestOverridesTable.teamKey],
      set: { crestSource: choice.crestSource, crestUrl, updatedAt: sql`now()` },
    });
}

/** Set (or, with an empty label, clear) the club's card label for a junior grade. */
export async function setJuniorCompetitionLabelOverride(
  tenantId: number,
  gradeKey: string,
  label: string | null,
): Promise<void> {
  const grade = tidy(gradeKey);
  if (grade === null) return;
  const text = tidy(label);
  if (text === null) {
    await db
      .delete(juniorCompetitionLabelOverridesTable)
      .where(
        and(
          eq(juniorCompetitionLabelOverridesTable.tenantId, tenantId),
          eq(juniorCompetitionLabelOverridesTable.gradeKey, grade),
        ),
      );
    return;
  }
  await db
    .insert(juniorCompetitionLabelOverridesTable)
    .values({ tenantId, gradeKey: grade, label: text })
    .onConflictDoUpdate({
      target: [
        juniorCompetitionLabelOverridesTable.tenantId,
        juniorCompetitionLabelOverridesTable.gradeKey,
      ],
      set: { label: text, updatedAt: sql`now()` },
    });
}

// ── The junior tables' names ───────────────────────────────────────────────

/** One junior match or fixture as its names go: opponent, both sides, grade, competition. */
interface JuniorNameRow {
  opponentName: string | null;
  sides: Array<string | null>;
  ageGroup: string | null;
  grade: string | null;
  teamName: string | null;
  competition: string | null;
}

/** The club's junior fixtures and matches (from `fromStartYear` on, when given). */
async function loadJuniorNameRows(
  tenantId: number,
  fromStartYear: number | null,
): Promise<JuniorNameRow[]> {
  const fixtureWhere = [eq(juniorFixturesTable.tenantId, tenantId)];
  const matchWhere = [eq(juniorMatchesTable.tenantId, tenantId)];
  if (fromStartYear !== null) {
    fixtureWhere.push(gte(juniorFixturesTable.seasonStartYear, fromStartYear));
    matchWhere.push(gte(juniorMatchesTable.seasonStartYear, fromStartYear));
  }
  const [fixtures, matches] = await Promise.all([
    db
      .selectDistinct({
        opponentName: juniorFixturesTable.opponentName,
        ageGroup: juniorFixturesTable.ageGroup,
        grade: juniorFixturesTable.grade,
        teamName: juniorFixturesTable.teamName,
      })
      .from(juniorFixturesTable)
      .where(and(...fixtureWhere)),
    db
      .selectDistinct({
        opponentName: juniorMatchesTable.opponentName,
        team1: juniorMatchesTable.team1,
        team2: juniorMatchesTable.team2,
        ageGroup: juniorMatchesTable.ageGroup,
        grade: juniorMatchesTable.grade,
        teamName: juniorMatchesTable.teamName,
        competition: juniorMatchesTable.competition,
      })
      .from(juniorMatchesTable)
      .where(and(...matchWhere)),
  ]);
  return [
    ...fixtures.map((f) => ({ ...f, sides: [], competition: null })),
    ...matches.map((m) => ({ ...m, sides: [m.team1, m.team2] })),
  ];
}

// ── The admin listing ──────────────────────────────────────────────────────

export interface JuniorTeamNameRow {
  teamKey: string;
  rawNames: string[];
  autoName: string;
  overrideName: string | null;
  name: string;
  source: NameSource;
  crestUrl: string | null;
  crestSource: CrestChoiceSource;
  autoCrestUrl: string | null;
  monogram: string;
}

export interface JuniorCompetitionLabelRow {
  gradeKey: string;
  rawLabel: string;
  autoLabel: string;
  overrideLabel: string | null;
  label: string;
  source: NameSource;
  rawLabels: string[];
}

export interface JuniorCardNamesListing {
  teams: JuniorTeamNameRow[];
  competitions: JuniorCompetitionLabelRow[];
}

/**
 * The Juniors tab: every junior opponent of this season or last (and any the
 * club named before), grouped by its automatic short name, and every junior
 * grade, each with its automatic and club-set name and crest.
 */
export async function listJuniorCardNames(
  tenantId: number,
  now: Date = new Date(),
): Promise<JuniorCardNamesListing> {
  const [names, crests, labels, rows] = await Promise.all([
    loadJuniorTeamNameOverrides(tenantId),
    loadJuniorTeamCrestOverrides(tenantId),
    loadJuniorCompetitionLabelOverrides(tenantId),
    loadJuniorNameRows(tenantId, seasonStartYearFor(now) - 1),
  ]);

  const groups = new Map<string, Set<string>>();
  const add = (key: string, raw: string | null) => {
    if (!key) return;
    const set = groups.get(key) ?? new Set<string>();
    if (raw) set.add(raw);
    groups.set(key, set);
  };
  for (const r of rows) {
    const raw = tidy(r.opponentName);
    if (raw && !isBye(raw)) add(juniorTeamKey(raw), raw);
  }
  for (const o of [...names, ...crests]) add(o.teamKey, null);

  const teams = await Promise.all(
    [...groups.entries()].map(async ([teamKey, raws]): Promise<JuniorTeamNameRow> => {
      const rawNames = [...raws].sort((a, b) => a.length - b.length || a.localeCompare(b));
      const rawName = rawNames[0] ?? teamKey;
      const autoName = autoShortTeamName(rawName) || rawName;
      const overrideName = names.find((o) => o.teamKey === teamKey)?.shortName ?? null;
      const name = overrideName ?? autoName;
      const autoCrestUrl = rawNames.length ? await juniorOpponentCrest(rawName) : null;
      return {
        teamKey,
        rawNames: [...raws].sort(),
        autoName,
        overrideName,
        name,
        source: source(overrideName, autoName, rawName),
        ...crestOf(
          autoCrestUrl,
          crests.find((c) => c.teamKey === teamKey),
        ),
        monogram: teamMonogram(name),
      };
    }),
  );
  teams.sort((a, b) => a.name.localeCompare(b.name));

  const grades = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = juniorGradeKeyOf(r);
    const set = grades.get(key) ?? new Set<string>();
    const comp = tidy(r.competition);
    if (comp) set.add(comp);
    grades.set(key, set);
  }
  for (const o of labels) if (!grades.has(o.gradeKey)) grades.set(o.gradeKey, new Set());
  const competitions = [...grades.entries()]
    .map(([gradeKey, comps]): JuniorCompetitionLabelRow => {
      const autoLabel = autoCompetitionLabel(gradeKey) || gradeKey;
      const overrideLabel = labels.find((o) => o.gradeKey === gradeKey)?.label ?? null;
      return {
        gradeKey,
        rawLabel: gradeKey,
        autoLabel,
        overrideLabel,
        label: overrideLabel ?? autoLabel,
        source: source(overrideLabel, autoLabel, gradeKey),
        rawLabels: [...comps].sort(),
      };
    })
    .sort((a, b) => a.gradeKey.localeCompare(b.gradeKey, undefined, { numeric: true }));

  return { teams, competitions };
}

// ── The junior card render map ─────────────────────────────────────────────

/**
 * The {@link CardNames} map junior cards take: every spelling of an opponent
 * the club named (each age group's PlayHQ name, either side of a scorecard)
 * keyed to its short name and crest choice, and each named grade's labels —
 * on its own and as "<grade> — <team>" — keyed to the club's label.
 *
 * Built from the junior tables and junior overrides only. Names the club never
 * set are not listed: cards fall back to the automatic short names.
 */
export async function loadJuniorCardNames(tenantId: number): Promise<CardNames> {
  const [names, crests, labels] = await Promise.all([
    loadJuniorTeamNameOverrides(tenantId),
    loadJuniorTeamCrestOverrides(tenantId),
    loadJuniorCompetitionLabelOverrides(tenantId),
  ]);
  if (!names.length && !crests.length && !labels.length) return {};
  const rows = await loadJuniorNameRows(tenantId, null);

  const put = (map: Record<string, string>, raw: string | null | undefined, value: string) => {
    const key = cardNameKey(raw);
    if (key && !(key in map)) map[key] = value;
  };
  const spellings = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const raw of [r.opponentName, ...r.sides]) {
      const t = tidy(raw);
      if (!t) continue;
      const key = juniorTeamKey(t);
      const set = spellings.get(key) ?? new Set<string>();
      set.add(t);
      spellings.set(key, set);
    }
  }
  const teams: Record<string, string> = {};
  for (const o of names) {
    put(teams, o.teamKey, o.shortName);
    for (const raw of spellings.get(o.teamKey) ?? []) put(teams, raw, o.shortName);
  }
  const crestOverrides: Record<string, string> = {};
  for (const o of crests) {
    const value = crestChoiceValue(o);
    put(crestOverrides, o.teamKey, value);
    for (const raw of spellings.get(o.teamKey) ?? []) put(crestOverrides, raw, value);
  }
  const competitions: Record<string, string> = {};
  for (const o of labels) {
    put(competitions, o.gradeKey, o.label);
    for (const r of rows) {
      if (juniorGradeKeyOf(r) !== o.gradeKey) continue;
      for (const raw of [r.ageGroup, r.grade]) put(competitions, raw, o.label);
      const team = tidy(r.teamName);
      if (team && team !== o.gradeKey)
        put(competitions, `${o.gradeKey} — ${team}`, `${o.label} — ${team}`);
    }
  }
  return {
    ...(Object.keys(teams).length ? { teams } : {}),
    ...(Object.keys(crestOverrides).length ? { crestOverrides } : {}),
    ...(Object.keys(competitions).length ? { competitions } : {}),
  };
}

/**
 * The junior names for junior card content, best effort: a failed read leaves
 * the automatic names, so content always builds. Never the senior names.
 */
export async function contentJuniorNames(
  tenantId: number,
  onError?: (err: unknown) => void,
): Promise<CardNames> {
  try {
    return await loadJuniorCardNames(tenantId);
  } catch (err) {
    (onError ?? ((e) => logger.warn({ err: e, tenantId }, "junior card names: read failed")))(err);
    return {};
  }
}
