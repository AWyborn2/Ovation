/**
 * Mobile brand config — tenant #1 (Halls Head) values. This is the single seam
 * for white-labeling the mobile app: all club copy reads from here rather than
 * inline literals.
 *
 * Per-tenant mobile builds (and fetching the brand from the API like the web app)
 * are a later phase. `app.json` keeps the Halls Head store identity (name, slug,
 * bundle id, icons) for now — see the TODO there.
 */
export const BRAND = {
  /** Full club name. */
  name: "Halls Head Cricket Club",
  /** Short label used in tight UI (scorecards, headings). */
  shortName: "Halls Head",
  /** Possessive form for body copy ("…for Halls Head's players"). */
  possessive: "Halls Head's",
  /** Founding year, shown on the home hero. */
  foundedYear: 1991,
} as const;
