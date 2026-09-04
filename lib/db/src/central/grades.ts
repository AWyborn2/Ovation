// ---------------------------------------------------------------------------
// Grade / season / round label parsing for the central PCA database. Central
// `matches.grade`, `.season` and `.round` are free text; every read maps them
// to the app's grade names, integer start-years and MatchStage values through
// the pure functions here. No database access in this module.
// ---------------------------------------------------------------------------

/**
 * Resolve a central `matches.grade` label to the app's grade name plus an
 * optional attributable `note` (sub-competition folding, divisions, sponsor
 * labels, deliberate exclusions). The note is for the comparison script's
 * output so mismatches are explainable.
 *
 * Built from the dump's ground-truth distinct labels. App grades:
 * "A Grade".."F Grade", "Female A Grade", "Female B Grade", "PPL", "Colts".
 * `appGrade: null` means deliberately unmapped (charity one-offs, Female C the
 * app doesn't have, the Ladies-T20 Female-B predecessor we don't auto-merge).
 */
export interface CentralGradeMapping {
  appGrade: string | null;
  note?: string;
}

export function classifyCentralGrade(
  centralGrade: string | null,
): CentralGradeMapping {
  if (!centralGrade) return { appGrade: null };
  const raw = centralGrade.trim();
  if (!raw) return { appGrade: null };
  const lower = raw.toLowerCase();

  // Format caveats — these comps were ingested into the base grade's season in
  // the HH app (per-match workbooks), so they belong to the base grade but are
  // worth flagging when numbers diverge.
  const thorny = /thorny devil/.test(lower);
  const midYear = /mid-?year/.test(lower);
  const t20 = /\bt20\b/.test(lower) || /\b20 match\b/.test(lower);
  const formatNote = thorny
    ? "Thorny Devil Mid-Year T20 — ingested into the base grade's season in the app"
    : midYear
      ? "Mid-Year T20 — ingested into the base grade's season in the app"
      : t20
        ? "T20 sub-competition — folded into the base grade in the app"
        : undefined;

  // Deliberate exclusion: charity one-offs.
  if (/charity/.test(lower) || /glen dehring/.test(lower)) {
    return { appGrade: null, note: "excluded: charity one-off" };
  }

  // PPL / Premier League, including the RetraVision/Retravision sponsor labels.
  if (
    /\bppl\b/.test(lower) ||
    /retravision/.test(lower) ||
    /peel premier/.test(lower) ||
    (/premier/.test(lower) && /league/.test(lower))
  ) {
    return {
      appGrade: "PPL",
      note: "PPL — the app recorded PPL as A Grade before 2019/20 (replit.md)",
    };
  }

  // Colts (incl. sponsor-prefixed "ID Athletic PCA Colts Competition").
  if (/\bcolts?\b/.test(lower)) return { appGrade: "Colts" };

  // Female grades — MUST precede the generic "<letter> Grade" matcher, since
  // "Female A Grade" contains "A Grade".
  if (/\bfemale\s*a\b/.test(lower)) {
    return { appGrade: "Female A Grade", note: formatNote };
  }
  if (/\bladies\s*t20\b/.test(lower)) {
    return {
      appGrade: null,
      note: "Female B predecessor (Ladies T20) — review, not auto-merged",
    };
  }
  if (/\bfemale\s*b\b/.test(lower)) {
    return { appGrade: "Female B Grade", note: formatNote };
  }
  if (/\bfemale\s*c\b/.test(lower)) {
    return { appGrade: null, note: "app has no Female C Grade (unmapped)" };
  }

  // C1 / C2 divisions — the generic matcher won't catch "C1 Grade" / "C2 Grade".
  if (/\bc1\s*grade\b/.test(lower)) {
    return { appGrade: "C Grade", note: "C1 division → C Grade" };
  }
  if (/\bc2\s*grade\b/.test(lower)) {
    return {
      appGrade: "C Grade",
      note: "C2 division → C Grade — verify the app didn't treat it separately",
    };
  }

  // Generic "<letter> Grade", with or without a cup suffix or sponsor prefix
  // ("A Grade", "A Grade: Wyllie Cup", "D Grade Ritchie Cup", "T20: B Grade").
  const labelled = /\b([a-f])\s*grade\b/.exec(lower);
  if (labelled) {
    return { appGrade: `${labelled[1].toUpperCase()} Grade`, note: formatNote };
  }
  // Bare single-letter grade code ("A", "B", …) with no "Grade" word.
  if (/^[a-f]$/.test(lower)) {
    return { appGrade: `${lower.toUpperCase()} Grade`, note: formatNote };
  }

  return { appGrade: null };
}

/**
 * The app grade a central `matches.grade` label rolls up to, or null when it
 * doesn't map (which excludes it from the central read). Thin wrapper over
 * {@link classifyCentralGrade} used for the leaderboard's grade filter.
 */
export function appGradeFromCentral(centralGrade: string | null): string | null {
  return classifyCentralGrade(centralGrade).appGrade;
}

/**
 * True when a central `matches.season` text (e.g. "Summer 2002/03") belongs to
 * the app's integer start-year season (2002). Used only by the optional
 * season-scoped comparison; the live endpoint aggregates all seasons (career).
 */
export function centralSeasonMatchesStartYear(
  centralSeason: string | null,
  startYear: number,
): boolean {
  if (!centralSeason) return false;
  const yy = String((startYear + 1) % 100).padStart(2, "0");
  // Match "<startYear>/<yy>" (e.g. "2002/03"); fall back to a bare year token.
  return (
    centralSeason.includes(`${startYear}/${yy}`) ||
    new RegExp(`\\b${startYear}\\b`).test(centralSeason)
  );
}

/** Parse a central season text ("Summer 2002/03") to the app's int start year. */
export function parseSeasonStartYear(season: string | null): number | null {
  if (!season) return null;
  const m = /(\d{4})/.exec(season);
  return m ? Number(m[1]) : null;
}

/** Inverse of {@link parseSeasonStartYear} for display: 2002 → "2002/03". */
export function seasonLabelFromStartYear(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Parse a central round text to an int round, or null for finals/unparseable. */
export function parseRound(round: string | null): number | null {
  if (!round) return null;
  if (/final|semi|grand|qualif|elimin|prelim/i.test(round)) return null;
  const m = /(\d+)/.exec(round);
  return m ? Number(m[1]) : null;
}

/** Map a central round/comp text to the app's MatchStage, or null for non-finals. */
export function parseStage(text: string | null): string | null {
  if (!text) return null;
  if (/grand\s*final/i.test(text)) return "Grand Final";
  if (/qualif/i.test(text)) return "Qualifying Final";
  if (/elimin/i.test(text)) return "Elimination Final";
  if (/prelim/i.test(text)) return "Preliminary Final";
  if (/semi/i.test(text)) return "Semi Final";
  if (/\bfinal\b/i.test(text)) return "Grand Final";
  return null;
}
