import { describe, it, expect } from "vitest";
import { PHOTO_TYPES, PHOTO_TYPE_LABELS, isPhotoType, preferredPhotoTypes } from "./photo-types";

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
    for (const kind of ["matchSummary", "premiership", "teamList", "weekendWrap", "ladder"]) {
      expect(preferredPhotoTypes({ kind })).toEqual(["team", "celebrating"]);
    }
    expect(preferredPhotoTypes({ kind: "bigMoment" })).toEqual(["celebrating"]);
  });

  it("has no preference for person and preview cards", () => {
    for (const kind of ["debut", "player", "record", "newSigning", "matchDay", "countdown", "x"]) {
      expect(preferredPhotoTypes({ kind })).toEqual([]);
    }
  });
});
