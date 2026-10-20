import { sql } from "drizzle-orm";
import { centralDb } from "../central";
import { cacheKey, withCentralCache } from "./cache";
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
//     crosswalk (or, where that has no row, the PlayHQ side of a projected
//     match).
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
    const orgs = await playhqOrgsForClubs(idList);
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
 * PlayHQ organisations per central club: the crosswalk first, then the PlayHQ
 * side of a projected match for a club the crosswalk lacks. A database without
 * the crosswalk or the PlayHQ tables (a bare central fixture) has no crests.
 */
async function playhqOrgsForClubs(
  idList: ReturnType<typeof sql.join>,
): Promise<Map<number, Array<{ name: string | null; logoUrl: string | null }>>> {
  const out = new Map<number, Array<{ name: string | null; logoUrl: string | null }>>();
  try {
    const res = await centralDb.execute(sql`
      with links as (
        select x.club_id, lower(x.playhq_org_id) as org_id, 0 as rank
          from central.club_playhq_orgs x
         where x.club_id in (${idList})
        union
        select side.club_id, lower(side.org_id::text), 1
          from central.matches m
          join playhq.matches p on p.id::text = m.playhq_match_id
          cross join lateral (values (m.home_club_id, p.home_org_id), (m.away_club_id, p.away_org_id))
            as side(club_id, org_id)
         where side.club_id in (${idList}) and side.org_id is not null
      )
      select distinct on (l.club_id, o.id) l.club_id as "clubId", o.name, o.logo_url as "logoUrl", l.rank
        from links l
        join playhq.organisations o on lower(o.id::text) = l.org_id
       order by l.club_id, o.id, l.rank
    `);
    const rows = (
      res.rows as Array<{
        clubId: number;
        name: string | null;
        logoUrl: string | null;
        rank: number;
      }>
    ).sort((a, b) => a.rank - b.rank);
    for (const r of rows) {
      const list = out.get(Number(r.clubId)) ?? [];
      list.push({ name: r.name, logoUrl: r.logoUrl });
      out.set(Number(r.clubId), list);
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
