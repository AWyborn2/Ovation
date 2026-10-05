/**
 * Photo type tags on club library photos (Social Studio). A photo can carry
 * several; each card type prefers certain tags when its photo is picked
 * automatically, and falls back to any photo when none match.
 */
export const PHOTO_TYPES = [
  "batting",
  "bowling",
  "fielding",
  "team",
  "celebrating",
  "premiership",
  "batting_milestone",
  "bowling_milestone",
] as const;

export type PhotoType = (typeof PHOTO_TYPES)[number];

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  batting: "Batting",
  bowling: "Bowling",
  fielding: "Fielding",
  team: "Team",
  celebrating: "Celebrating",
  premiership: "Premiership",
  batting_milestone: "Batting milestone",
  bowling_milestone: "Bowling milestone",
};

export function isPhotoType(value: unknown): value is PhotoType {
  return typeof value === "string" && (PHOTO_TYPES as readonly string[]).includes(value);
}

const BATTING_MILESTONE: readonly PhotoType[] = ["batting_milestone", "batting"];
const BOWLING_MILESTONE: readonly PhotoType[] = ["bowling_milestone", "bowling"];
const TEAM: readonly PhotoType[] = ["team", "celebrating"];
const CELEBRATING_FIRST: readonly PhotoType[] = ["celebrating", "team"];
const PREMIERSHIP: readonly PhotoType[] = ["premiership", "team", "celebrating"];

/** A stat label ("Runs", "Wickets", "Dismissals", …) → the tag that pictures it. */
function statPhotoType(label: unknown): PhotoType | null {
  const s = typeof label === "string" ? label.trim().toLowerCase() : "";
  if (!s) return null;
  if (s.includes("run") || s.includes("bat")) return "batting";
  if (s.includes("wicket") || s.includes("bowl")) return "bowling";
  if (s.includes("catch") || s.includes("dismissal") || s.includes("field")) return "fielding";
  return null;
}

/**
 * The photo types a card prefers, most preferred first; empty = no preference
 * (any photo, in the usual newest-first order).
 *
 *   - century → batting milestone, batting; fiveFor → bowling milestone, bowling
 *   - milestone → by its stat (`milestoneLabel`): runs → batting milestone,
 *     batting; wickets → bowling milestone, bowling; games, dismissals and
 *     anything else → celebrating, team
 *   - gradeLeader / clubLeaderboard → by `category`: runs → batting,
 *     wickets → bowling, catches/dismissals → fielding
 *   - premiership → premiership, team, celebrating
 *   - matchSummary, teamList, weekendWrap, ladder → team, celebrating
 *   - bigMoment → celebrating
 *   - debut, player, record, newSigning, matchDay, countdown → no preference
 *     (a debut or signing is about the person, a record or player card can be
 *     any discipline, and a match day / countdown looks ahead of the game)
 */
export function preferredPhotoTypes(cardInput: Record<string, unknown>): readonly PhotoType[] {
  switch (cardInput.kind) {
    case "century":
      return BATTING_MILESTONE;
    case "fiveFor":
      return BOWLING_MILESTONE;
    case "milestone": {
      const stat = statPhotoType(cardInput.milestoneLabel);
      if (stat === "batting") return BATTING_MILESTONE;
      if (stat === "bowling") return BOWLING_MILESTONE;
      return CELEBRATING_FIRST;
    }
    case "gradeLeader":
    case "clubLeaderboard": {
      const stat = statPhotoType(cardInput.category);
      return stat ? [stat] : [];
    }
    case "premiership":
      return PREMIERSHIP;
    case "matchSummary":
    case "teamList":
    case "weekendWrap":
    case "ladder":
      return TEAM;
    case "bigMoment":
      return ["celebrating"];
    default:
      return [];
  }
}

/**
 * The match format a library photo can be tagged with, alongside its photo
 * type (a photo has one type, its folder; the format is a separate tag).
 */
export const MATCH_FORMATS = ["one_day", "t20", "two_day"] as const;

export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const MATCH_FORMAT_LABELS: Record<MatchFormat, string> = {
  one_day: "One Day",
  t20: "T20",
  two_day: "Two Day",
};

export function isMatchFormat(value: unknown): value is MatchFormat {
  return typeof value === "string" && (MATCH_FORMATS as readonly string[]).includes(value);
}

/** The match format named in a label ("D Grade T20", "Two Day Cup", …), or null. */
export function matchFormatFromLabel(label: unknown): MatchFormat | null {
  const s = typeof label === "string" ? label.toLowerCase() : "";
  if (/\bt20\b|twenty ?20/.test(s)) return "t20";
  if (/\b(one|1)[\s-]?day\b/.test(s)) return "one_day";
  if (/\b(two|2)[\s-]?day\b/.test(s)) return "two_day";
  return null;
}

/**
 * The match format a card prefers its photo to be from: an explicit
 * `matchFormat` on the card, else one named in its competition or grade
 * (a "T20" premiership prefers T20 photos). Null = no preference.
 */
export function preferredMatchFormat(cardInput: Record<string, unknown>): MatchFormat | null {
  if (isMatchFormat(cardInput.matchFormat)) return cardInput.matchFormat;
  return matchFormatFromLabel(cardInput.competition) ?? matchFormatFromLabel(cardInput.grade);
}
