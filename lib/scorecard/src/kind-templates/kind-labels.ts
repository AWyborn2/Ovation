/**
 * A template kind's readable name, for names the server makes up (a club's
 * first template of a kind, when no library look stands in). The web's card
 * kind picker (`CARD_KIND_OPTIONS`) uses the same labels; a test keeps them
 * in step. Retired kinds keep a name, since saved designs of them still show.
 */
import { SET_TYPE_LABELS, setTypeOfKind } from "./set-document";

export const CARD_KIND_LABELS: Readonly<Record<string, string>> = {
  milestone: "Milestone",
  player: "Player",
  record: "Record",
  premiership: "Premiership",
  debut: "Debut",
  century: "Century",
  fiveFor: "Five-for",
  matchSummary: "Match Summary",
  matchDay: "Match Day",
  teamList: "Team List",
  weekendWrap: "Weekend Wrap",
  ladder: "Ladder",
  bigMoment: "Big Moment",
  newSigning: "New Signing",
  clubLeaderboard: "Club Leaderboard",
  roundFixtures: "Game Day",
  juniorHighlights: "Junior Highlights",
  teamListRound: "Round Team Lists",
  announcement: "Announcement",
  sponsor: "Sponsor",
  resultsSummary: "Results",
  teamOfWeek: "Team of the Week",
  // Retired (plan 2026-10-15-001 R5): no new cards, but saved designs still show.
  gradeLeader: "Grade Leader",
  countdown: "Countdown",
  tradingCard: "Trading Card",
};

/** A card kind's or set kind's (`set:<type>`) readable name; the raw kind only for one nothing names. */
export function kindDisplayLabel(kind: string): string {
  const set = setTypeOfKind(kind);
  if (set) return `${SET_TYPE_LABELS[set]} set`;
  return CARD_KIND_LABELS[kind] ?? kind;
}

/** The name the server gives a club's first template of a kind when no library look stands in. */
export const fallbackTemplateName = (kind: string): string => `${kindDisplayLabel(kind)} template`;

/**
 * A club template's name as shown. Templates the server named before this
 * fallback used the kind's key (dev retest 4: "tradingCard template") and read
 * with its label instead; any other name, an admin's own included, is shown
 * as it is.
 */
export function templateDisplayName(name: string, kind: string): string {
  return kind && name === `${kind} template` ? fallbackTemplateName(kind) : name;
}

/**
 * A bundle template's library name. Bundle files name a template "<Look>
 * <kind key>" ("Club Kit tradingCard"); the library shows the kind's label
 * ("Club Kit Trading Card"). A name the bundle chose otherwise stays.
 */
export function bundleTemplateName(fileName: string, lookName: string, kind: string): string {
  return fileName === `${lookName} ${kind}` ? `${lookName} ${kindDisplayLabel(kind)}` : fileName;
}
