/**
 * Team names, competition labels and crests for social cards (ADR-010 P1).
 *
 * Every card path resolves a name the same way: the club's own short name
 * (`team_name_overrides`, keyed on the central club id and optionally an app
 * grade) → the automatic short name (`autoShortTeamName`) → the raw name. The
 * crest is the club's PlayHQ organisation logo; with none, a monogram.
 *
 * Overrides are tenant-curated content: every read here filters on the tenant,
 * every write sets it, and nothing is ever written to `central`. Central reads
 * (the clubs a club has met, their names and crests) go through
 * `@workspace/db/central-queries`, loaded lazily so a tenant-only path never
 * opens the central pool.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import {
  competitionLabelOverridesTable,
  db,
  teamCrestOverridesTable,
  teamNameOverridesTable,
  type CrestSource,
} from "@workspace/db";
import type { CentralCardClub, CentralCardTeamName } from "@workspace/db/central-queries";
import { seasonStartYearFor } from "@workspace/db/seasons";
import {
  autoCompetitionLabel,
  autoShortTeamName,
  cardNameKey,
  teamMonogram,
  type CardNames,
} from "@workspace/scorecard/card-names";
import { tenantCentralClubIdOrNull } from "../tenant";

export type NameSource = "override" | "auto" | "raw";

export interface ResolvedTeamName {
  centralClubId: number;
  gradeKey: string | null;
  /** The name the card would print without the club's override. */
  rawName: string;
  autoName: string;
  overrideName: string | null;
  /** What a card prints. */
  name: string;
  source: NameSource;
  /** The crest cards show: the club's choice, else the automatic one. Null → the monogram. */
  crestUrl: string | null;
  crestSource: CrestChoiceSource;
  /** The automatic crest (the PlayHQ organisation logo), whatever the club chose. */
  autoCrestUrl: string | null;
  /** Stands in for a missing crest. */
  monogram: string;
}

/** Where a team's crest comes from: automatic, or the club's own choice. */
export type CrestChoiceSource = "auto" | CrestSource;

/** A club's own crest choice, as stored. */
export interface CrestChoice {
  crestSource: CrestSource;
  crestUrl: string | null;
}

/** The crest a card shows, given the automatic crest and the club's choice (if any). */
export function crestOf(
  autoCrestUrl: string | null,
  choice: CrestChoice | null | undefined,
): { crestUrl: string | null; crestSource: CrestChoiceSource; autoCrestUrl: string | null } {
  if (!choice) return { crestUrl: autoCrestUrl, crestSource: "auto", autoCrestUrl };
  return {
    crestUrl: choice.crestSource === "initials" ? null : choice.crestUrl,
    crestSource: choice.crestSource,
    autoCrestUrl,
  };
}

/** A club's choice as the render map carries it: the image url, or "" for the initials badge. */
export const crestChoiceValue = (choice: CrestChoice): string =>
  choice.crestSource === "initials" ? "" : (choice.crestUrl ?? "");

export interface ResolvedCompetitionLabel {
  gradeKey: string;
  rawLabel: string;
  autoLabel: string;
  overrideLabel: string | null;
  label: string;
  source: NameSource;
}

/** Card names may be at most this long; the admin route enforces it. */
export const MAX_CARD_NAME_LENGTH = 40;

/** How many seasons back the clubs a club has "met" go (this one and the last). */
const SEASONS_BACK = 1;

const centralQueries = () => import("@workspace/db/central-queries");

const source = (override: string | null, auto: string, raw: string): NameSource =>
  override ? "override" : auto !== raw ? "auto" : "raw";

const tidy = (s: string | null | undefined): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
};

// ── Overrides (tenant DB) ───────────────────────────────────────────────────

/** The tenant's team name overrides, oldest first. */
export async function loadTeamNameOverrides(tenantId: number) {
  return db
    .select()
    .from(teamNameOverridesTable)
    .where(eq(teamNameOverridesTable.tenantId, tenantId))
    .orderBy(teamNameOverridesTable.id);
}

/** The tenant's crest choices, oldest first. */
export async function loadTeamCrestOverrides(tenantId: number) {
  return db
    .select()
    .from(teamCrestOverridesTable)
    .where(eq(teamCrestOverridesTable.tenantId, tenantId))
    .orderBy(teamCrestOverridesTable.id);
}

/**
 * Set the tenant's crest for a central club (every grade): an uploaded image
 * or a known crest (`crestUrl`), or the initials badge. A null source resets
 * to the automatic crest. The route validates the url.
 */
export async function setTeamCrestOverride(
  tenantId: number,
  centralClubId: number,
  choice: CrestChoice | null,
): Promise<void> {
  const match = and(
    eq(teamCrestOverridesTable.tenantId, tenantId),
    eq(teamCrestOverridesTable.centralClubId, centralClubId),
  );
  if (choice === null) {
    await db.delete(teamCrestOverridesTable).where(match);
    return;
  }
  const crestUrl = choice.crestSource === "initials" ? null : choice.crestUrl;
  await db
    .insert(teamCrestOverridesTable)
    .values({ tenantId, centralClubId, crestSource: choice.crestSource, crestUrl })
    .onConflictDoUpdate({
      target: [teamCrestOverridesTable.tenantId, teamCrestOverridesTable.centralClubId],
      set: { crestSource: choice.crestSource, crestUrl, updatedAt: sql`now()` },
    });
}

/** The tenant's competition label overrides, oldest first. */
export async function loadCompetitionLabelOverrides(tenantId: number) {
  return db
    .select()
    .from(competitionLabelOverridesTable)
    .where(eq(competitionLabelOverridesTable.tenantId, tenantId))
    .orderBy(competitionLabelOverridesTable.id);
}

/**
 * Set (or, with an empty name, clear) the tenant's short name for a central
 * club, for one grade or (gradeKey null) every grade.
 */
export async function setTeamNameOverride(
  tenantId: number,
  centralClubId: number,
  gradeKey: string | null,
  shortName: string | null,
): Promise<void> {
  const grade = tidy(gradeKey);
  const name = tidy(shortName);
  const match = and(
    eq(teamNameOverridesTable.tenantId, tenantId),
    eq(teamNameOverridesTable.centralClubId, centralClubId),
    grade === null
      ? isNull(teamNameOverridesTable.gradeKey)
      : eq(teamNameOverridesTable.gradeKey, grade),
  );
  if (name === null) {
    await db.delete(teamNameOverridesTable).where(match);
    return;
  }
  await db
    .insert(teamNameOverridesTable)
    .values({ tenantId, centralClubId, gradeKey: grade, shortName: name })
    .onConflictDoUpdate({
      // Target the portable partial unique index for all-grades overrides.
      // Publish may introspect the three-column constraint as ordinary UNIQUE.
      target:
        grade === null
          ? [teamNameOverridesTable.tenantId, teamNameOverridesTable.centralClubId]
          : [
              teamNameOverridesTable.tenantId,
              teamNameOverridesTable.centralClubId,
              teamNameOverridesTable.gradeKey,
            ],
      targetWhere: grade === null ? isNull(teamNameOverridesTable.gradeKey) : undefined,
      set: { shortName: name, updatedAt: sql`now()` },
    });
}

/** Set (or, with an empty label, clear) the tenant's card label for an app grade. */
export async function setCompetitionLabelOverride(
  tenantId: number,
  gradeKey: string,
  label: string | null,
): Promise<void> {
  const grade = tidy(gradeKey);
  if (grade === null) return;
  const text = tidy(label);
  if (text === null) {
    await db
      .delete(competitionLabelOverridesTable)
      .where(
        and(
          eq(competitionLabelOverridesTable.tenantId, tenantId),
          eq(competitionLabelOverridesTable.gradeKey, grade),
        ),
      );
    return;
  }
  await db
    .insert(competitionLabelOverridesTable)
    .values({ tenantId, gradeKey: grade, label: text })
    .onConflictDoUpdate({
      target: [competitionLabelOverridesTable.tenantId, competitionLabelOverridesTable.gradeKey],
      set: { label: text, updatedAt: sql`now()` },
    });
}

// ── Single resolution ───────────────────────────────────────────────────────

/**
 * What a card prints for a central club (in one grade, when given): the
 * tenant's grade name, else its all-grades name, else the automatic short name
 * of `rawName` (default: the club's register name), else the raw name.
 */
export async function resolveTeamName(
  tenantId: number,
  centralClubId: number,
  gradeKey?: string | null,
  opts: { rawName?: string | null } = {},
): Promise<ResolvedTeamName> {
  const [overrides, crests, clubs] = await Promise.all([
    loadTeamNameOverrides(tenantId),
    loadTeamCrestOverrides(tenantId),
    (async () => (await centralQueries()).centralCardClubs([centralClubId]))(),
  ]);
  const club = clubs[0];
  const grade = tidy(gradeKey);
  const forClub = overrides.filter((o) => o.centralClubId === centralClubId);
  const overrideName =
    (grade !== null ? forClub.find((o) => o.gradeKey === grade)?.shortName : null) ??
    forClub.find((o) => o.gradeKey === null)?.shortName ??
    null;
  return teamNameOf(
    centralClubId,
    grade,
    tidy(opts.rawName) ?? club?.name ?? "",
    overrideName,
    club,
    crests.find((c) => c.centralClubId === centralClubId),
  );
}

function teamNameOf(
  centralClubId: number,
  gradeKey: string | null,
  rawName: string,
  overrideName: string | null,
  club: CentralCardClub | undefined,
  crestChoice?: CrestChoice | null,
): ResolvedTeamName {
  const autoName = autoShortTeamName(rawName);
  const name = overrideName ?? (autoName || rawName);
  return {
    centralClubId,
    gradeKey,
    rawName,
    autoName,
    overrideName,
    name,
    source: source(overrideName, autoName, rawName),
    ...crestOf(club?.crestUrl ?? null, crestChoice),
    monogram: teamMonogram(name),
  };
}

/** What a card prints for an app grade: the tenant's label, else the automatic one, else raw. */
export async function resolveCompetitionLabel(
  tenantId: number,
  gradeKey: string,
  rawLabel?: string | null,
): Promise<ResolvedCompetitionLabel> {
  const overrides = await loadCompetitionLabelOverrides(tenantId);
  const key = tidy(gradeKey) ?? "";
  const overrideLabel = overrides.find((o) => o.gradeKey === key)?.label ?? null;
  return competitionLabelOf(key, tidy(rawLabel) ?? key, overrideLabel);
}

function competitionLabelOf(
  gradeKey: string,
  rawLabel: string,
  overrideLabel: string | null,
): ResolvedCompetitionLabel {
  const autoLabel = autoCompetitionLabel(rawLabel);
  return {
    gradeKey,
    rawLabel,
    autoLabel,
    overrideLabel,
    label: overrideLabel ?? (autoLabel || rawLabel),
    source: source(overrideLabel, autoLabel, rawLabel),
  };
}

// ── The admin listing ───────────────────────────────────────────────────────

export interface TeamNameListingRow extends ResolvedTeamName {
  isOwnClub: boolean;
  /** Team names this club fielded lately (what PlayHQ calls its sides). */
  teamNames: string[];
  /** Senior grades the club met the tenant in, each with its own resolution. */
  grades: ResolvedTeamName[];
}

export interface CardNamesListing {
  /** False when the club has no central club, so there is nothing to list. */
  available: boolean;
  teams: TeamNameListingRow[];
  competitions: Array<ResolvedCompetitionLabel & { rawLabels: string[] }>;
}

interface CentralNameData {
  clubId: number;
  teamNames: CentralCardTeamName[];
  clubs: Map<number, CentralCardClub>;
}

/** The central side of the names: who the tenant's club has met, their names and crests. */
async function loadCentralNameData(
  tenantId: number,
  extraClubIds: readonly number[],
  now: Date,
): Promise<CentralNameData | null> {
  const clubId = await tenantCentralClubIdOrNull(tenantId);
  if (clubId === null) return null;
  const q = await centralQueries();
  const teamNames = await q.centralCardTeamNames(clubId, seasonStartYearFor(now) - SEASONS_BACK);
  const ids = new Set<number>([clubId, ...extraClubIds, ...teamNames.map((t) => t.clubId)]);
  const clubs = new Map((await q.centralCardClubs([...ids])).map((c) => [c.clubId, c]));
  return { clubId, teamNames, clubs };
}

/**
 * Everything the "Team and competition names" settings show: the tenant's own
 * club, then every club it met this season or last, each with its automatic
 * and club-set names, per grade too; and every senior grade the club plays with
 * its label.
 */
export async function listCardNames(
  tenantId: number,
  now: Date = new Date(),
): Promise<CardNamesListing> {
  const [teamOverrides, crestOverrides, compOverrides] = await Promise.all([
    loadTeamNameOverrides(tenantId),
    loadTeamCrestOverrides(tenantId),
    loadCompetitionLabelOverrides(tenantId),
  ]);
  const central = await loadCentralNameData(
    tenantId,
    [...teamOverrides, ...crestOverrides].map((o) => o.centralClubId),
    now,
  );
  if (!central) return { available: false, teams: [], competitions: [] };

  const overrideFor = (clubId: number, grade: string | null) =>
    teamOverrides.find((o) => o.centralClubId === clubId && o.gradeKey === grade)?.shortName ??
    null;

  const teams: TeamNameListingRow[] = [...central.clubs.values()].map((club) => {
    const sides = central.teamNames.filter((t) => t.clubId === club.clubId);
    const clubOverride = overrideFor(club.clubId, null);
    const crestChoice = crestOverrides.find((c) => c.centralClubId === club.clubId);
    const base = teamNameOf(club.clubId, null, club.name ?? "", clubOverride, club, crestChoice);
    const gradeKeys = new Set<string>(
      [
        ...sides.map((t) => t.gradeKey),
        ...teamOverrides.filter((o) => o.centralClubId === club.clubId).map((o) => o.gradeKey),
      ].filter((g): g is string => !!g),
    );
    const grades = [...gradeKeys].sort().map((grade) => {
      const gradeOverride = overrideFor(club.clubId, grade);
      const resolved = teamNameOf(
        club.clubId,
        grade,
        club.name ?? "",
        gradeOverride,
        club,
        crestChoice,
      );
      // A grade with no name of its own prints the club's.
      return gradeOverride ? resolved : { ...resolved, name: base.name, monogram: base.monogram };
    });
    return {
      ...base,
      isOwnClub: club.clubId === central.clubId,
      teamNames: [...new Set(sides.map((t) => t.teamName))].sort(),
      grades,
    };
  });
  teams.sort((a, b) => Number(b.isOwnClub) - Number(a.isOwnClub) || a.name.localeCompare(b.name));

  const own = central.teamNames.filter((t) => t.clubId === central.clubId && t.gradeKey);
  const compKeys = new Set<string>([
    ...own.map((t) => t.gradeKey!),
    ...compOverrides.map((o) => o.gradeKey),
  ]);
  const competitions = [...compKeys].sort().map((grade) => ({
    ...competitionLabelOf(
      grade,
      grade,
      compOverrides.find((o) => o.gradeKey === grade)?.label ?? null,
    ),
    rawLabels: [...new Set(own.filter((t) => t.gradeKey === grade).map((t) => t.gradeLabel ?? ""))]
      .filter(Boolean)
      .sort(),
  }));

  return { available: true, teams, competitions };
}

// ── The card render map ─────────────────────────────────────────────────────

/**
 * The {@link CardNames} map every card render takes (the Studio preview via
 * the social settings bundle, the headless renderer via the draft's data):
 * each spelling of an overridden club — register name, earlier names, PlayHQ
 * organisation names, every team name it fielded — keyed to the club's short
 * name (a grade's own name for that grade's team names); every met club's
 * crest; and each overridden grade's raw labels keyed to its label.
 *
 * Names a club never overrode are not listed: cards fall back to the same
 * automatic short name the listing shows. Best effort: if the central reads
 * fail, overrides of the club's own register names are lost but nothing
 * throws, and every card still prints the automatic names.
 */
export async function loadCardNames(
  tenantId: number,
  opts: { now?: Date; onCentralError?: (err: unknown) => void } = {},
): Promise<CardNames> {
  const [teamOverrides, crestOverrides, compOverrides] = await Promise.all([
    loadTeamNameOverrides(tenantId),
    loadTeamCrestOverrides(tenantId),
    loadCompetitionLabelOverrides(tenantId),
  ]);
  let central: CentralNameData | null = null;
  try {
    central = await loadCentralNameData(
      tenantId,
      [...teamOverrides, ...crestOverrides].map((o) => o.centralClubId),
      opts.now ?? new Date(),
    );
  } catch (err) {
    opts.onCentralError?.(err);
  }

  const teams: Record<string, string> = {};
  const put = (map: Record<string, string>, raw: string | null | undefined, value: string) => {
    const key = cardNameKey(raw);
    if (key && !(key in map)) map[key] = value;
  };
  // Grade names first: they win over the club's all-grades name for that grade's sides.
  const byGrade = [...teamOverrides].sort((a, b) =>
    a.gradeKey === null ? 1 : b.gradeKey === null ? -1 : a.gradeKey.localeCompare(b.gradeKey),
  );
  for (const o of byGrade) {
    const sides = (central?.teamNames ?? []).filter((t) => t.clubId === o.centralClubId);
    if (o.gradeKey !== null) {
      for (const t of sides) if (t.gradeKey === o.gradeKey) put(teams, t.teamName, o.shortName);
      continue;
    }
    const club = central?.clubs.get(o.centralClubId);
    for (const n of [club?.name, club?.shortName, ...(club?.otherNames ?? [])]) {
      put(teams, n, o.shortName);
    }
    for (const t of sides) put(teams, t.teamName, o.shortName);
  }

  const crests: Record<string, string> = {};
  if (central) {
    for (const club of central.clubs.values()) {
      if (!club.crestUrl) continue;
      for (const n of [club.name, ...club.otherNames]) put(crests, n, club.crestUrl);
      for (const t of central.teamNames) {
        if (t.clubId === club.clubId) put(crests, t.teamName, club.crestUrl);
      }
    }
  }

  // The club's own crest choices win over any crest a card input carries:
  // every spelling of the club (as the team names above) maps to it.
  const crestChoices: Record<string, string> = {};
  for (const o of crestOverrides) {
    const value = crestChoiceValue(o);
    const club = central?.clubs.get(o.centralClubId);
    for (const n of [club?.name, club?.shortName, ...(club?.otherNames ?? [])]) {
      put(crestChoices, n, value);
    }
    for (const t of central?.teamNames ?? []) {
      if (t.clubId === o.centralClubId) put(crestChoices, t.teamName, value);
    }
  }

  const competitions: Record<string, string> = {};
  for (const o of compOverrides) {
    put(competitions, o.gradeKey, o.label);
    for (const t of central?.teamNames ?? []) {
      if (t.clubId === central?.clubId && t.gradeKey === o.gradeKey) {
        put(competitions, t.gradeLabel, o.label);
      }
    }
  }

  return {
    ...(Object.keys(teams).length ? { teams } : {}),
    ...(Object.keys(crests).length ? { crests } : {}),
    ...(Object.keys(crestChoices).length ? { crestOverrides: crestChoices } : {}),
    ...(Object.keys(competitions).length ? { competitions } : {}),
  };
}
