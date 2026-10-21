// ---------------------------------------------------------------------------
// Which PlayHQ organisation a central club is, for its crest and other names on
// social cards (ADR-010 P1). Pure: card-names.ts reads the rows, this decides.
//
// The explicit crosswalk (`central.club_playhq_orgs`) is trusted as it stands.
// A club the crosswalk lacks is linked through its projected matches, and that
// link has to be earned:
//   - each side is paired with PlayHQ's side by TEAM NAME, never by position:
//     central stores the lower club id as "home" (central-transform.ts), so
//     home ↔ home pairs a club with its opponent in about half its matches.
//     That is how Murdoch University Melville came to wear the Rockingham
//     Hornets crest. A side whose name matches neither PlayHQ team counts for
//     both organisations (ambiguous), so it can never settle a link alone;
//   - an organisation that is another club's crosswalk organisation is never
//     taken;
//   - the organisation must be the club's side in MOST of its matches (more
//     than half), and clearly ahead of any other candidate. Anything less is a
//     doubtful crest, and the card shows the initials badge instead.
// ---------------------------------------------------------------------------

/** One explicit crosswalk row: PlayHQ organisation → central club. */
export interface CrosswalkLink {
  clubId: number;
  orgId: string;
}

/** One side of a projected match, with the PlayHQ match's two teams. */
export interface MatchSideLink {
  clubId: number;
  /** The central match (or any id unique per match). */
  matchId: number | string;
  /** The side's team name in central. */
  team: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeOrg: string | null;
  awayOrg: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const orgKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Each club's PlayHQ organisations, best first: its crosswalk organisations
 * when it has any, else the one organisation its matches clearly make it (or
 * none). Organisation ids come back lower-cased.
 */
export function pickClubOrgs(
  clubIds: readonly number[],
  crosswalk: readonly CrosswalkLink[],
  sides: readonly MatchSideLink[],
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const explicitOwner = new Map<string, number>();
  for (const x of crosswalk) {
    const org = orgKey(x.orgId);
    if (!org) continue;
    explicitOwner.set(org, x.clubId);
    const list = out.get(x.clubId) ?? [];
    if (!list.includes(org)) list.push(org);
    out.set(x.clubId, list);
  }

  for (const clubId of new Set(clubIds)) {
    if (out.has(clubId)) continue;
    const matches = new Map<string, Set<string>>();
    for (const s of sides) {
      if (s.clubId !== clubId) continue;
      const team = norm(s.team);
      const home = orgKey(s.homeOrg);
      const away = orgKey(s.awayOrg);
      const byName =
        team && team === norm(s.homeTeam) && team !== norm(s.awayTeam)
          ? [home]
          : team && team === norm(s.awayTeam) && team !== norm(s.homeTeam)
            ? [away]
            : [home, away];
      const candidates = byName.filter((o) => o && (explicitOwner.get(o) ?? clubId) === clubId);
      const key = String(s.matchId);
      const set = matches.get(key) ?? new Set<string>();
      for (const o of candidates) set.add(o);
      matches.set(key, set);
    }
    const total = matches.size;
    if (total === 0) continue;
    const counts = new Map<string, number>();
    for (const set of matches.values())
      for (const o of set) counts.set(o, (counts.get(o) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [best, runnerUp] = ranked;
    if (!best || best[1] * 2 <= total) continue;
    if (runnerUp && runnerUp[1] === best[1]) continue;
    out.set(clubId, [best[0]]);
  }
  return out;
}
