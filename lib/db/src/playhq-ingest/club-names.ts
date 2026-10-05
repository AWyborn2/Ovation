/**
 * PlayHQ organisation → central club by NAME, for clubs the crosswalk and tenant settings don't
 * cover — typically the opposition of a tenant (docs/plans/2026-10-04-001-feat-playhq-central-
 * projection-plan.md). Without it the other side of a tenant's match is projected with no club,
 * so the scorecard shows one team only.
 *
 * PlayHQ and the central builder spell clubs differently ("Perth Cricket Club (WA)" vs
 * "Perth WA", "Subiaco-Floreat Cricket Club" vs "Subiaco-Floreat"), so names are compared after
 * {@link clubNameKey}. A match must be unambiguous: one central club, or one ACTIVE club when
 * several share the key. Anything else stays unmapped (better one team than the wrong club).
 */

/** Words that carry no identity in a club name. */
const NOISE = new Set(["cricket", "club", "inc", "incorporated", "the", "cc"]);

/**
 * Comparable form of a club name: lower case, brackets and punctuation dropped (their words
 * kept: "(WA)" → "wa"), filler words removed, whitespace collapsed.
 */
export function clubNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE.has(w))
    .join(" ");
}

export interface CentralClubName {
  clubId: number;
  name: string | null;
  /** True when the club still plays (no `active_to`). */
  active: boolean;
}

/**
 * Resolve each organisation name to a central club, unambiguously or not at all. `clubs` may
 * list a club more than once (its current name and its historical names).
 */
export function matchOrgsToClubs(
  orgs: readonly { orgId: string; name: string | null }[],
  clubs: readonly CentralClubName[],
): Map<string, number> {
  const byKey = new Map<string, Map<number, boolean>>();
  for (const c of clubs) {
    const key = clubNameKey(c.name);
    if (!key) continue;
    const ids = byKey.get(key) ?? new Map<number, boolean>();
    ids.set(c.clubId, (ids.get(c.clubId) ?? false) || c.active);
    byKey.set(key, ids);
  }
  const out = new Map<string, number>();
  for (const o of orgs) {
    const ids = byKey.get(clubNameKey(o.name));
    if (!ids) continue;
    const all = [...ids.keys()];
    const active = all.filter((id) => ids.get(id));
    const pick = all.length === 1 ? all : active.length === 1 ? active : [];
    if (pick.length === 1) out.set(o.orgId.toLowerCase(), pick[0]!);
  }
  return out;
}
