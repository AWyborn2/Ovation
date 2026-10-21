import { sql } from "drizzle-orm";
import { centralDb } from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { pickClubOrgs, type MatchSideLink } from "./crest-orgs";
import { classifyCentralGrade } from "./grades";

// ---------------------------------------------------------------------------
// Names and crests for social cards (ADR-010 P1). The club sets short names
// tenant-side (`team_name_overrides`, keyed on the central club id); these
// reads supply what those names stand in for:
//   - the clubs a club has met lately, with every team name each fielded and
//     the app grade it was in, so a club-set name reaches every spelling a
//     card input carries;
//   - each club's register name and earlier names;
//   - each club's crest. `central.clubs` has no logo: crests are the PlayHQ
//     organisation logos, reached through the `central.club_playhq_orgs`
//     crosswalk (or, where that has no row, the organisation the club's
//     projected matches clearly make it: crest-orgs.ts).
// Senior grades only: a junior / pathway label maps to no app grade and is
// left out (juniors isolation). Read-only, cached like every central read.
// ---------------------------------------------------------------------------

/** One team name a club fielded in a club's recent matches. */
export interface CentralCardTeamName {
  clubId: number;
  teamName: string;
  /** The senior app grade ("A Grade", "Female A Grade"), or null for a junior / unmapped label. */
  gradeKey: string | null;
  /** The raw central grade label ("A Grade Wyllie Cup"). */
  gradeLabel: string | null;
}

/**
 * Every (club, team name, grade) on either side of `clubId`'s matches from the
 * season starting `fromStartYear` on — the club's own teams included.
 */
export async function centralCardTeamNames(
  clubId: number,
  fromStartYear: number,
): Promise<CentralCardTeamName[]> {
  return withCentralCache(cacheKey("centralCardTeamNames", [clubId, fromStartYear]), async () => {
    const res = await centralDb.execute(sql`
      select distinct side.club_id as "clubId", side.team as "teamName", m.grade as "gradeLabel"
      from central.matches m
      cross join lateral (values (m.home_club_id, m.home_team), (m.away_club_id, m.away_team))
        as side(club_id, team)
      where (m.home_club_id = ${clubId} or m.away_club_id = ${clubId})
        and side.club_id is not null
        and coalesce(side.team, '') <> ''
        and coalesce(substring(m.season from '(\\d{4})')::int, 0) >= ${fromStartYear}
    `);
    return (res.rows as Array<{ clubId: number; teamName: string; gradeLabel: string | null }>)
      .map((r) => ({
        clubId: Number(r.clubId),
        teamName: r.teamName,
        gradeLabel: r.gradeLabel,
        gradeKey: classifyCentralGrade(r.gradeLabel).appGrade,
      }))
      .sort(
        (a, b) =>
          a.clubId - b.clubId ||
          a.teamName.localeCompare(b.teamName) ||
          (a.gradeLabel ?? "").localeCompare(b.gradeLabel ?? ""),
      );
  });
}

/** A central club as cards name it: its register name, short code and earlier names. */
export interface CentralCardClub {
  clubId: number;
  name: string | null;
  shortName: string | null;
  /** Earlier names (`central.club_name_history`) and its PlayHQ organisation names. */
  otherNames: string[];
  /** The PlayHQ organisation crest, when the club maps to one that has a logo. */
  crestUrl: string | null;
}

/** The register entry, other names and crest of each club in `clubIds`. */
export async function centralCardClubs(clubIds: readonly number[]): Promise<CentralCardClub[]> {
  const ids = [...new Set(clubIds)].filter((id) => Number.isInteger(id)).sort((a, b) => a - b);
  if (ids.length === 0) return [];
  return withCentralCache(cacheKey("centralCardClubs", [ids.join(",")]), async () => {
    const idList = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );
    const clubs = await centralDb.execute(sql`
      select c.club_id as "clubId", c.name, c.short_name as "shortName",
             coalesce(
               (select array_agg(distinct h.name) from central.club_name_history h
                 where h.club_id = c.club_id and h.name is not null),
               '{}'
             ) as "history"
      from central.clubs c
      where c.club_id in (${idList})
      order by c.club_id
    `);
    const orgs = await playhqOrgsForClubs(ids, idList);
    return (
      clubs.rows as Array<{
        clubId: number;
        name: string | null;
        shortName: string | null;
        history: string[] | null;
      }>
    ).map((c) => {
      const clubOrgs = orgs.get(Number(c.clubId)) ?? [];
      const otherNames = [
        ...new Set(
          [...(c.history ?? []), ...clubOrgs.map((o) => o.name ?? "")].filter(
            (n) => n && n !== c.name,
          ),
        ),
      ].sort();
      return {
        clubId: Number(c.clubId),
        name: c.name,
        shortName: c.shortName,
        otherNames,
        crestUrl: clubOrgs.find((o) => o.logoUrl)?.logoUrl ?? null,
      };
    });
  });
}

/**
 * PlayHQ organisations per central club, best first: the crosswalk where it
 * has the club, else the one organisation the club's projected matches clearly
 * make it (`pickClubOrgs` in crest-orgs.ts has the rules), else none, and the
 * card shows the initials badge. A database without the crosswalk or the
 * PlayHQ tables (a bare central fixture) has no crests.
 */
async function playhqOrgsForClubs(
  clubIds: readonly number[],
  idList: ReturnType<typeof sql.join>,
): Promise<Map<number, Array<{ name: string | null; logoUrl: string | null }>>> {
  const out = new Map<number, Array<{ name: string | null; logoUrl: string | null }>>();
  try {
    // Every crosswalk row: a club's own, and the organisations no other club may take.
    const crosswalk = await centralDb.execute(sql`
      select x.club_id as "clubId", lower(x.playhq_org_id) as "orgId"
        from central.club_playhq_orgs x
       order by (x.source = 'manual') desc, x.votes desc, x.playhq_org_id
    `);
    const sides = await centralDb.execute(sql`
      select side.club_id as "clubId", m.match_id as "matchId", side.team,
             p.home_team_name as "homeTeam", p.away_team_name as "awayTeam",
             lower(p.home_org_id::text) as "homeOrg", lower(p.away_org_id::text) as "awayOrg"
        from central.matches m
        join playhq.matches p on p.id::text = m.playhq_match_id
        cross join lateral (values (m.home_club_id, m.home_team), (m.away_club_id, m.away_team))
          as side(club_id, team)
       where side.club_id in (${idList})
         and side.club_id not in (select x.club_id from central.club_playhq_orgs x)
    `);
    const crosswalkRows = (crosswalk.rows as Array<{ clubId: number; orgId: string }>).map((r) => ({
      clubId: Number(r.clubId),
      orgId: r.orgId,
    }));
    const wanted = new Set(clubIds);
    const picked = pickClubOrgs(
      clubIds,
      crosswalkRows,
      (sides.rows as Array<Omit<MatchSideLink, "clubId"> & { clubId: number }>).map((r) => ({
        ...r,
        clubId: Number(r.clubId),
      })),
    );
    for (const clubId of [...picked.keys()]) if (!wanted.has(clubId)) picked.delete(clubId);
    const orgIds = [...new Set([...picked.values()].flat())];
    if (orgIds.length === 0) return out;
    const orgs = await centralDb.execute(sql`
      select lower(o.id::text) as "orgId", o.name, o.logo_url as "logoUrl"
        from playhq.organisations o
       where lower(o.id::text) in (${sql.join(
         orgIds.map((id) => sql`${id}`),
         sql`, `,
       )})
    `);
    const byId = new Map(
      (orgs.rows as Array<{ orgId: string; name: string | null; logoUrl: string | null }>).map(
        (o) => [o.orgId, o],
      ),
    );
    for (const [clubId, list] of picked) {
      const found = list.flatMap((id) => {
        const o = byId.get(id);
        return o ? [{ name: o.name, logoUrl: o.logoUrl }] : [];
      });
      if (found.length) out.set(clubId, found);
    }
  } catch (err) {
    // The crosswalk or PlayHQ tables aren't there: crests then fall back to monograms.
    if (!isUndefinedTable(err)) throw err;
  }
  return out;
}

/** Postgres undefined_table (42P01), however deep Drizzle wrapped it. */
function isUndefinedTable(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    if ((e as { code?: unknown }).code === "42P01") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** A crest Ovation already knows: a PlayHQ organisation's logo. */
export interface KnownCardCrest {
  orgId: string;
  name: string;
  logoUrl: string;
}

/**
 * Every PlayHQ organisation with a logo, by name: the crests a club can pick
 * for a team whose automatic crest is wrong or missing. Neutral reference
 * data. A database without the PlayHQ tables knows none.
 */
export async function centralKnownCrests(): Promise<KnownCardCrest[]> {
  return withCentralCache(cacheKey("centralKnownCrests", []), async () => {
    try {
      const res = await centralDb.execute(sql`
        select lower(o.id::text) as "orgId", o.name, o.logo_url as "logoUrl"
          from playhq.organisations o
         where coalesce(o.logo_url, '') <> '' and coalesce(o.name, '') <> ''
         order by o.name, o.id
      `);
      return res.rows as unknown as KnownCardCrest[];
    } catch (err) {
      if (!isUndefinedTable(err)) throw err;
      return [];
    }
  });
}
