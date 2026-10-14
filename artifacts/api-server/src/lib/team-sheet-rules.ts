/**
 * Junior Aged Player bowling restrictions for the printed senior team sheet.
 * Each association sets its own; a competition is matched to its rules by the
 * PlayHQ organisation that runs the grade (`fixtures.association_org_id`).
 * Pure — no DB.
 */

export type BowlingBand = {
  /** Highest age (on the cut-off date) the band covers. */
  maxAge: number;
  label: string;
  maxOversPerDay: number;
  maxSpell: number;
};

export type BowlingRuleSet = {
  key: string;
  /** Printed on the sheet: where the limits come from. */
  source: string;
  /** PlayHQ organisation GUIDs (lower case) of the associations that use it. */
  associationOrgIds: readonly string[];
  /** A player is a Junior Aged Player when aged this or under on the cut-off. */
  juniorMaxAge: number;
  /** Month and day of the cut-off, taken in the year the season starts. */
  cutoff: { month: number; day: number };
  /** Youngest first; the first band whose `maxAge` covers the age applies. */
  bands: readonly BowlingBand[];
  /** Other team-sheet lines from the same bylaws, printed under the list. */
  sheetNotes: readonly string[];
};

/**
 * Peel Cricket Association, Bylaw 5.9 (2026.1): players aged 16 or under on
 * 30 June before the season; pace bowling quotas by age (5.9.6). Bands above
 * 16 never apply on a senior sheet but are kept as the bylaw prints them.
 */
export const PCA_BYLAW_5_9: BowlingRuleSet = {
  key: "pca-5.9",
  source: "PCA Bylaw 5.9",
  associationOrgIds: ["c65c0bb8-87d8-eb11-a7ad-2818780da0cc"],
  juniorMaxAge: 16,
  cutoff: { month: 6, day: 30 },
  bands: [
    { maxAge: 10, label: "U11", maxOversPerDay: 4, maxSpell: 2 },
    { maxAge: 13, label: "11–13", maxOversPerDay: 8, maxSpell: 4 },
    { maxAge: 15, label: "14–15", maxOversPerDay: 12, maxSpell: 5 },
    { maxAge: 17, label: "16–17", maxOversPerDay: 16, maxSpell: 5 },
    { maxAge: 19, label: "18–19", maxOversPerDay: 18, maxSpell: 6 },
  ],
  // Bylaw 5.3.1.
  sheetNotes: ["All 12 named players may bowl."],
};

export const BOWLING_RULE_SETS: readonly BowlingRuleSet[] = [PCA_BYLAW_5_9];

/** The rules of the association that runs a competition, or null when none is known. */
export function bowlingRulesFor(
  associationOrgId: string | null | undefined,
): BowlingRuleSet | null {
  const id = (associationOrgId ?? "").trim().toLowerCase();
  if (!id) return null;
  return BOWLING_RULE_SETS.find((r) => r.associationOrgIds.includes(id)) ?? null;
}

/** Whole years between a YYYY-MM-DD birth date and a YYYY-MM-DD date; null when unreadable. */
export function ageOn(dateOfBirth: string | null | undefined, on: string): number | null {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const b = re.exec(dateOfBirth ?? "");
  const d = re.exec(on);
  if (!b || !d) return null;
  const [by, bm, bd] = b.slice(1).map(Number);
  const [y, m, dd] = d.slice(1).map(Number);
  const age = y - by - (m < bm || (m === bm && dd < bd) ? 1 : 0);
  return age >= 0 ? age : null;
}

export type JuniorBowlingLimit = {
  age: number;
  band: string;
  maxOversPerDay: number;
  maxSpell: number;
};

/**
 * A player's limits under `rules` for the season starting in `seasonStartYear`,
 * or null when they aren't a Junior Aged Player (or their birth date is unknown).
 */
export function juniorBowlingLimit(
  rules: BowlingRuleSet,
  dateOfBirth: string | null | undefined,
  seasonStartYear: number,
): JuniorBowlingLimit | null {
  const cutoff = `${seasonStartYear}-${String(rules.cutoff.month).padStart(2, "0")}-${String(rules.cutoff.day).padStart(2, "0")}`;
  const age = ageOn(dateOfBirth, cutoff);
  if (age == null || age > rules.juniorMaxAge) return null;
  const band = rules.bands.find((b) => age <= b.maxAge);
  if (!band) return null;
  return { age, band: band.label, maxOversPerDay: band.maxOversPerDay, maxSpell: band.maxSpell };
}

/** A starting overs value from PlayHQ's match format ("T20" → "20"); null when unknown. */
export function oversFromFormat(format: string | null | undefined): string | null {
  const m = /\bT(\d{2})\b/i.exec(format ?? "");
  return m ? String(Number(m[1])) : null;
}
