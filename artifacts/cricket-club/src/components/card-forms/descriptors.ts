/**
 * Per-kind form descriptors (U8).
 *
 * A compact, declarative spec of the editable fields for each card kind, driving
 * the generic descriptor form. `matchSummary` is bespoke (nested teams/innings)
 * and marked accordingly. Field keys match the `ShareCardInput` field names
 * one-for-one so the built state is the input minus `kind`.
 */

import type { CardKind } from "@/lib/share-card";

export type ScalarType =
  | "text"
  | "number"
  | "textarea"
  | "switch"
  | "select"
  // An image slot: upload (presigned object storage) or paste a URL. The state
  // value is a plain URL string, exactly like the legacy free-text photo field,
  // so nothing downstream (input binding, save, server render) changes shape.
  | "image";

export interface ScalarField {
  key: string;
  label: string;
  type: ScalarType;
  placeholder?: string;
  /** For `select`. */
  options?: readonly { value: string; label: string }[];
  /** Span the full grid width. */
  full?: boolean;
}

export interface RepeatColumn {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "switch";
  options?: readonly { value: string; label: string }[];
  /** Tailwind width class for the column input; omit for a flexible column. */
  width?: string;
}

export interface RepeatSpec {
  /** State array key. */
  key: string;
  label: string;
  addLabel: string;
  columns: RepeatColumn[];
  /** Factory for a fresh row appended by the admin. */
  newRow: () => Record<string, unknown>;
}

/** Which prefill panel a kind offers (or none). */
export type PrefillSource = "match" | "fixture" | "stats" | "none";

export interface KindDescriptor {
  /** Bespoke kinds render their own editor (matchSummary). */
  bespoke?: boolean;
  fields: ScalarField[];
  repeat?: RepeatSpec;
  /** A player typeahead that writes into these name field(s). */
  playerField?: { key: string } | { firstKey: string; lastKey: string };
  prefill: PrefillSource;
}

const RUNS_WICKETS = [
  { value: "Runs", label: "Runs" },
  { value: "Wickets", label: "Wickets" },
] as const;

const HOME_AWAY = [
  { value: "HOME", label: "Home" },
  { value: "AWAY", label: "Away" },
] as const;

const CAP_CATEGORY = [
  { value: "male", label: "Male (A Grade)" },
  { value: "female", label: "Female (Female A Grade)" },
] as const;

const TEAM_ROLE = [
  { value: "", label: "—" },
  { value: "C", label: "Captain" },
  { value: "WK", label: "Keeper" },
  { value: "C/WK", label: "Capt + Keeper" },
] as const;

const WRAP_OUTCOME = [
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "draw", label: "Draw" },
] as const;

const photo = (label = "Photo URL"): ScalarField => ({
  key: "photoUrl",
  label,
  type: "text",
  placeholder: "https://…",
  full: true,
});

export const DESCRIPTORS: Record<CardKind, KindDescriptor> = {
  matchSummary: { bespoke: true, fields: [], prefill: "match" },

  milestone: {
    prefill: "none",
    playerField: { key: "playerName" },
    fields: [
      { key: "playerName", label: "Player name", type: "text" },
      { key: "tierLabel", label: "Tier label", type: "text", placeholder: "Centurion" },
      { key: "tierIndex", label: "Tier index (0–6)", type: "number" },
      { key: "milestoneLabel", label: "Milestone label", type: "text", placeholder: "Career Runs" },
      { key: "currentValue", label: "Current value", type: "number" },
      { key: "threshold", label: "Threshold", type: "number" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  player: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "playerName", label: "Player name", type: "text" },
      { key: "gradesPlayed", label: "Grades played", type: "text", placeholder: "A Grade" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
    repeat: {
      key: "stats",
      label: "Stats (up to 3)",
      addLabel: "Add stat",
      columns: [
        { key: "value", label: "Value", type: "text", width: "w-28" },
        { key: "label", label: "Label", type: "text" },
      ],
      newRow: () => ({ label: "", value: "" }),
    },
  },

  record: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "title", label: "Record title", type: "text", placeholder: "Highest Score" },
      { key: "playerName", label: "Player name", type: "text" },
      { key: "value", label: "Value", type: "text", placeholder: "187*" },
      { key: "grade", label: "Grade", type: "text" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  gradeLeader: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "grade", label: "Grade", type: "text" },
      { key: "category", label: "Category", type: "select", options: RUNS_WICKETS },
      { key: "playerName", label: "Player name", type: "text" },
      { key: "value", label: "Value", type: "text" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  premiership: {
    prefill: "none",
    fields: [
      { key: "grade", label: "Grade", type: "text" },
      { key: "year", label: "Season start year", type: "number", placeholder: "2024" },
      { key: "competition", label: "Competition", type: "text" },
      { key: "result", label: "Result", type: "text", placeholder: "Champions" },
      { key: "mom", label: "Player of the final", type: "text" },
      { key: "teamPhotoUrl", label: "Team photo", type: "image", full: true },
      { key: "headline", label: "Headline", type: "text", full: true },
    ],
  },

  debut: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "playerName", label: "Player name", type: "text" },
      { key: "grade", label: "Grade", type: "text" },
      { key: "capNumber", label: "Cap number", type: "number" },
      { key: "season", label: "Season", type: "text", placeholder: "2024/25" },
      { key: "opponent", label: "Opponent", type: "text" },
      { key: "round", label: "Round", type: "number" },
      { key: "headline", label: "Tribute line", type: "text", full: true },
      photo(),
    ],
  },

  newCap: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "playerName", label: "Player name", type: "text" },
      { key: "grade", label: "Grade", type: "text" },
      { key: "category", label: "Cap list", type: "select", options: CAP_CATEGORY },
      { key: "capNumber", label: "Cap number", type: "number" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  century: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "playerName", label: "Player name", type: "text" },
      { key: "grade", label: "Grade", type: "text" },
      { key: "runs", label: "Runs", type: "number" },
      { key: "balls", label: "Balls", type: "number" },
      { key: "notOut", label: "Not out", type: "switch" },
      { key: "opponent", label: "Opponent", type: "text" },
      { key: "round", label: "Round", type: "number" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  fiveFor: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "playerName", label: "Player name", type: "text" },
      { key: "grade", label: "Grade", type: "text" },
      { key: "wickets", label: "Wickets", type: "number" },
      { key: "runsConceded", label: "Runs conceded", type: "number" },
      { key: "overs", label: "Overs", type: "text", placeholder: "9.2" },
      { key: "figures", label: "Figures", type: "text", placeholder: "5/24" },
      { key: "opponent", label: "Opponent", type: "text" },
      { key: "round", label: "Round", type: "number" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  matchDay: {
    prefill: "fixture",
    fields: [
      { key: "roundLabel", label: "Round label", type: "text", placeholder: "ROUND 8" },
      { key: "oppositionName", label: "Opposition", type: "text" },
      { key: "oppositionLogoUrl", label: "Opposition logo URL", type: "text", placeholder: "https://…", full: true },
      { key: "homeAway", label: "Home / away", type: "select", options: HOME_AWAY },
      { key: "venue", label: "Venue", type: "text" },
      { key: "date", label: "Date", type: "text", placeholder: "SAT 14 DEC" },
      { key: "startTime", label: "Start time", type: "text", placeholder: "12:00 PM" },
      { key: "noteTitle", label: "Note title", type: "text" },
      { key: "noteBody", label: "Note body", type: "textarea", full: true },
    ],
  },

  teamList: {
    prefill: "fixture",
    fields: [
      { key: "gradeRound", label: "Grade / round heading", type: "text" },
      { key: "competitionLine", label: "Competition line", type: "text" },
      { key: "venueDateTime", label: "Venue / date / time", type: "text", full: true },
      { key: "squadPhotoUrl", label: "Squad photo", type: "image", full: true },
    ],
    repeat: {
      key: "players",
      label: "Players (up to 12)",
      addLabel: "Add player",
      columns: [
        { key: "order", label: "#", type: "number", width: "w-14" },
        { key: "surname", label: "Surname", type: "text" },
        { key: "role", label: "Role", type: "select", options: TEAM_ROLE, width: "w-32" },
      ],
      newRow: () => ({ order: 0, surname: "", role: undefined }),
    },
  },

  weekendWrap: {
    prefill: "stats",
    fields: [
      { key: "roundLabel", label: "Round label", type: "text", placeholder: "ROUND 8 WRAP" },
      { key: "dateRange", label: "Date range", type: "text", placeholder: "13–14 DEC" },
    ],
    repeat: {
      key: "matches",
      label: "Matches (up to 4)",
      addLabel: "Add match",
      columns: [
        { key: "gradeLabel", label: "Grade", type: "text", width: "w-28" },
        { key: "resultLine", label: "Result line", type: "text" },
        { key: "performers", label: "Performers", type: "text" },
        { key: "outcome", label: "Outcome", type: "select", options: WRAP_OUTCOME, width: "w-28" },
      ],
      newRow: () => ({ gradeLabel: "", resultLine: "", performers: "", outcome: "won" }),
    },
  },

  ladder: {
    prefill: "stats",
    fields: [
      { key: "competitionName", label: "Competition name", type: "text" },
      { key: "gradeLabel", label: "Grade label", type: "text" },
      { key: "asOfLabel", label: "As-of label", type: "text", placeholder: "AFTER ROUND 8", full: true },
    ],
    repeat: {
      key: "rows",
      label: "Standings (up to 7)",
      addLabel: "Add row",
      columns: [
        { key: "pos", label: "Pos", type: "number", width: "w-14" },
        { key: "team", label: "Team", type: "text" },
        { key: "played", label: "P", type: "number", width: "w-14" },
        { key: "won", label: "W", type: "number", width: "w-14" },
        { key: "lost", label: "L", type: "number", width: "w-14" },
        { key: "points", label: "Pts", type: "text", width: "w-16" },
        { key: "isClub", label: "Us", type: "switch", width: "w-12" },
      ],
      newRow: () => ({ pos: 0, team: "", played: 0, won: 0, lost: 0, points: 0, isClub: false }),
    },
  },

  bigMoment: {
    prefill: "match",
    playerField: { key: "playerName" },
    fields: [
      { key: "momentLabel", label: "Moment label", type: "text", placeholder: "CENTURY ALERT" },
      { key: "playerName", label: "Player name", type: "text" },
      { key: "runs", label: "Runs", type: "number" },
      { key: "balls", label: "Balls", type: "number" },
      { key: "boundaryDetail", label: "Boundary detail", type: "text" },
      { key: "oppositionName", label: "Opposition", type: "text" },
      { key: "inningsLabel", label: "Innings label", type: "text" },
      { key: "liveScore", label: "Live score", type: "text", placeholder: "4/218" },
      { key: "oversChaseLine", label: "Overs / chase line", type: "text" },
      { key: "equation", label: "Equation / note", type: "text", full: true },
      photo(),
    ],
  },

  newSigning: {
    prefill: "none",
    playerField: { firstKey: "playerFirstName", lastKey: "playerLastName" },
    fields: [
      { key: "playerFirstName", label: "First name", type: "text" },
      { key: "playerLastName", label: "Last name", type: "text" },
      { key: "role", label: "Role", type: "text", placeholder: "All-rounder" },
      { key: "formerClub", label: "Former club", type: "text" },
      { key: "season", label: "Season", type: "text", placeholder: "2024/25" },
      { key: "headline", label: "Headline", type: "text", full: true },
      photo(),
    ],
  },

  countdown: {
    prefill: "fixture",
    fields: [
      { key: "daysToGo", label: "Days to go", type: "text", placeholder: "2" },
      { key: "eventLabel", label: "Event label", type: "text", placeholder: "SEASON OPENER" },
      { key: "hypeLine1", label: "Hype line 1", type: "text" },
      { key: "hypeLine2", label: "Hype line 2", type: "text" },
      { key: "dateVenue", label: "Date / venue", type: "text" },
      { key: "fixtureLine", label: "Fixture line", type: "text", full: true },
    ],
  },

  clubLeaderboard: {
    prefill: "stats",
    fields: [
      { key: "title", label: "Title", type: "text", placeholder: "CLUB RUN SCORERS" },
      { key: "subtitle", label: "Subtitle", type: "text" },
      { key: "season", label: "Season", type: "text", placeholder: "2024/25" },
      { key: "category", label: "Category", type: "select", options: RUNS_WICKETS },
    ],
    repeat: {
      key: "leaders",
      label: "Leaders (up to 4)",
      addLabel: "Add leader",
      columns: [
        { key: "gradeLabel", label: "Grade", type: "text", width: "w-28" },
        { key: "playerName", label: "Player", type: "text" },
        { key: "value", label: "Value", type: "text", width: "w-24" },
      ],
      newRow: () => ({ gradeLabel: "", playerName: "", value: "" }),
    },
  },
};
