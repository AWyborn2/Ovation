import { describe, it, expect } from "vitest";
import {
  MATCH_FORMATS,
  MATCH_FORMAT_LABELS,
  PHOTO_TYPES,
  PHOTO_TYPE_LABELS,
  isMatchFormat,
  isPhotoType,
  matchFormatFromLabel,
  preferredMatchFormat,
  preferredPhotoTypes,
} from "./photo-types";

describe("photo types", () => {
  it("has a label for every type", () => {
    expect(Object.keys(PHOTO_TYPE_LABELS).sort()).toEqual([...PHOTO_TYPES].sort());
    expect(PHOTO_TYPE_LABELS.batting_milestone).toBe("Batting milestone");
  });

  it("recognises only the known values", () => {
    expect(isPhotoType("bowling")).toBe(true);
    expect(isPhotoType("Bowling")).toBe(false);
    expect(isPhotoType("selfie")).toBe(false);
    expect(isPhotoType(3)).toBe(false);
  });
});

describe("preferredPhotoTypes", () => {
  it("prefers milestone shots for centuries and five-fors", () => {
    expect(preferredPhotoTypes({ kind: "century" })).toEqual(["batting_milestone", "batting"]);
    expect(preferredPhotoTypes({ kind: "fiveFor" })).toEqual(["bowling_milestone", "bowling"]);
  });

  it("splits career milestones by their stat", () => {
    expect(preferredPhotoTypes({ kind: "milestone", milestoneLabel: "Runs" })).toEqual([
      "batting_milestone",
      "batting",
    ]);
    expect(preferredPhotoTypes({ kind: "milestone", milestoneLabel: "Wickets" })).toEqual([
      "bowling_milestone",
      "bowling",
    ]);
    expect(preferredPhotoTypes({ kind: "milestone", milestoneLabel: "Games" })).toEqual([
      "celebrating",
      "team",
    ]);
    expect(preferredPhotoTypes({ kind: "milestone", milestoneLabel: "Dismissals" })).toEqual([
      "celebrating",
      "team",
    ]);
    expect(preferredPhotoTypes({ kind: "milestone" })).toEqual(["celebrating", "team"]);
  });

  it("follows a leaderboard's category", () => {
    expect(preferredPhotoTypes({ kind: "gradeLeader", category: "Runs" })).toEqual(["batting"]);
    expect(preferredPhotoTypes({ kind: "gradeLeader", category: "Wickets" })).toEqual(["bowling"]);
    expect(preferredPhotoTypes({ kind: "clubLeaderboard", category: "Dismissals" })).toEqual([
      "fielding",
    ]);
    expect(preferredPhotoTypes({ kind: "gradeLeader", category: "Catches" })).toEqual(["fielding"]);
    expect(preferredPhotoTypes({ kind: "gradeLeader", category: "Average" })).toEqual([]);
  });

  it("prefers team shots for team cards and celebrations for big moments", () => {
    for (const kind of ["matchSummary", "teamList", "weekendWrap", "ladder"]) {
      expect(preferredPhotoTypes({ kind })).toEqual(["team", "celebrating"]);
    }
    expect(preferredPhotoTypes({ kind: "premiership" })).toEqual([
      "premiership",
      "team",
      "celebrating",
    ]);
    expect(preferredPhotoTypes({ kind: "bigMoment" })).toEqual(["celebrating"]);
  });

  it("has no preference for person and preview cards", () => {
    for (const kind of ["debut", "player", "record", "newSigning", "matchDay", "countdown", "x"]) {
      expect(preferredPhotoTypes({ kind })).toEqual([]);
    }
  });
});

describe("match formats", () => {
  it("has a label for every format", () => {
    expect(Object.keys(MATCH_FORMAT_LABELS).sort()).toEqual([...MATCH_FORMATS].sort());
    expect(MATCH_FORMAT_LABELS.two_day).toBe("Two Day");
    expect(isMatchFormat("t20")).toBe(true);
    expect(isMatchFormat("T20")).toBe(false);
  });

  it("reads the format from a competition or grade label", () => {
    expect(matchFormatFromLabel("D Grade T20 Premiership")).toBe("t20");
    expect(matchFormatFromLabel("Twenty20 Cup")).toBe("t20");
    expect(matchFormatFromLabel("One-Day Final")).toBe("one_day");
    expect(matchFormatFromLabel("2 Day")).toBe("two_day");
    expect(matchFormatFromLabel("Two Day Cup")).toBe("two_day");
    expect(matchFormatFromLabel("A Grade")).toBeNull();
    expect(matchFormatFromLabel(undefined)).toBeNull();
  });

  it("a card prefers its explicit format, then its competition, then its grade", () => {
    expect(preferredMatchFormat({ kind: "premiership", matchFormat: "two_day" })).toBe("two_day");
    expect(preferredMatchFormat({ kind: "premiership", competition: "T20 Final" })).toBe("t20");
    expect(preferredMatchFormat({ kind: "premiership", grade: "Ladies T20" })).toBe("t20");
    expect(preferredMatchFormat({ kind: "premiership", grade: "A Grade" })).toBeNull();
  });
});
