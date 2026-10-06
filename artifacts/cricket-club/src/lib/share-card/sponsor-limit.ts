/**
 * Card kinds that carry a single sponsor logo: a match result and a
 * premiership card keep the spotlight on the result, and a team list carries
 * its team's own sponsor, so their "Supported by" strip shows one logo rather
 * than the usual row.
 */
const ONE_SPONSOR_KINDS: ReadonlySet<string> = new Set(["matchSummary", "premiership", "teamList"]);

/** The most sponsor logos a card of `kind` shows; undefined = the renderer's own cap. */
export function maxSponsorLogos(kind: string): number | undefined {
  return ONE_SPONSOR_KINDS.has(kind) ? 1 : undefined;
}

/** A grade label for matching ("A Grade", "a-grade " → "agrade"). */
export function gradeMatchKey(grade: string | null | undefined): string {
  return (grade ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type SponsorLike = {
  cardKinds?: string[] | null;
  grades?: string[] | null;
  isPresenting?: boolean | null;
};

/**
 * The sponsors a card carries, in strip order (sponsor per team):
 *
 *  - a team list whose grade has its own sponsor carries that sponsor only;
 *  - otherwise the sponsors that apply to the kind, the presenting sponsor
 *    first, leaving out sponsors that belong to some other team on a team
 *    list (so a team without its own sponsor falls back to the presenting one).
 *
 * `appliesToKind` is the card-kind rule (`sponsorAppliesToKind`), passed in to
 * keep this module free of the share-card barrel.
 */
export function sponsorsForCard<S extends SponsorLike, K extends string>(
  sponsors: readonly S[],
  kind: K,
  grade: string | null | undefined,
  appliesToKind: (cardKinds: string[] | null | undefined, kind: K) => boolean,
): S[] {
  const hasTeams = (sp: S) => (sp.grades ?? []).some((g) => gradeMatchKey(g));
  if (kind === "teamList") {
    const key = gradeMatchKey(grade);
    const own = key
      ? sponsors.filter((sp) => (sp.grades ?? []).some((g) => gradeMatchKey(g) === key))
      : [];
    if (own.length > 0) return [...own];
    return sponsors
      .filter((sp) => !hasTeams(sp) && appliesToKind(sp.cardKinds, kind))
      .sort((a, b) => Number(!!b.isPresenting) - Number(!!a.isPresenting));
  }
  return sponsors
    .filter((sp) => appliesToKind(sp.cardKinds, kind))
    .sort((a, b) => Number(!!b.isPresenting) - Number(!!a.isPresenting));
}
