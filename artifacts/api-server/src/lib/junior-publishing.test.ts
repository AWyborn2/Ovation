import { JUNIOR_SYNC_ID_START } from "@workspace/db";
import { describe, expect, it } from "vitest";
import type { FamilyConfig } from "./social-families";
import {
  JUNIOR_TEAM_LIST_KEY_PREFIX,
  isSyncedJuniorDraft,
  juniorDraftMayAutoPost,
  juniorFamilyAllows,
  juniorResultAutoReady,
  juniorRetimeAction,
  juniorTeamListFixtureIdOf,
  juniorTeamListKey,
  juniorTeamPublishMode,
  syncedJuniorMatchIdOf,
} from "./junior-publishing";

/**
 * Junior social publishing rules (junior PlayHQ sync plan U8; KTD13-KTD15, R19, R23,
 * AE5). Pure — no database.
 */

describe("juniorTeamPublishMode", () => {
  const publishing = {
    "Year 10-11": { "Halls Head Hawks": "auto" as const },
    "Year 5": { "Halls Head Gold": "approval" as const },
  };

  it("an explicitly auto team is auto", () => {
    expect(juniorTeamPublishMode(publishing, "Year 10-11", "Halls Head Hawks")).toBe("auto");
  });

  it("an explicitly approval team is approval", () => {
    expect(juniorTeamPublishMode(publishing, "Year 5", "Halls Head Gold")).toBe("approval");
  });

  it("a team missing from its age group is approval", () => {
    expect(juniorTeamPublishMode(publishing, "Year 10-11", "Halls Head Kites")).toBe("approval");
  });

  it("an age group missing from the map is approval", () => {
    expect(juniorTeamPublishMode(publishing, "Year 9", "Halls Head Hawks")).toBe("approval");
  });

  it("an unknown age group or team is approval", () => {
    expect(juniorTeamPublishMode(publishing, null, "Halls Head Hawks")).toBe("approval");
    expect(juniorTeamPublishMode(publishing, "Year 10-11", null)).toBe("approval");
    expect(juniorTeamPublishMode({}, "Year 10-11", "Halls Head Hawks")).toBe("approval");
  });

  it("a malformed stored map is approval", () => {
    expect(juniorTeamPublishMode({ x: "auto" } as never, "x", "auto")).toBe("approval");
    expect(juniorTeamPublishMode(null as never, "Year 5", "Halls Head Gold")).toBe("approval");
  });
});

describe("juniorFamilyAllows", () => {
  const config = (enabled: boolean, grades: Record<string, boolean> = {}): FamilyConfig => ({
    results: { enabled, grades },
    achievements: { enabled: false, grades: {} },
    roundup: { enabled: false, grades: {} },
    matchday: { enabled, grades },
  });

  it("a switched-off family drafts nothing", () => {
    expect(juniorFamilyAllows(config(false), "matchday", "Year 9")).toBe(false);
  });

  it("within an enabled family a junior age group drafts unless turned off", () => {
    expect(juniorFamilyAllows(config(true), "matchday", "Year 9")).toBe(true);
    expect(juniorFamilyAllows(config(true), "results", null)).toBe(true);
  });

  it("an age group the club turned off drafts nothing", () => {
    expect(juniorFamilyAllows(config(true, { "Year 9": false }), "matchday", "Year 9")).toBe(false);
    expect(juniorFamilyAllows(config(true, { "Year 9": true }), "matchday", "Year 9")).toBe(true);
  });
});

describe("juniorDraftMayAutoPost (the promotion guard)", () => {
  const synced = `matchSummary:junior:${JUNIOR_SYNC_ID_START + 1}`;

  it("a senior draft is never held by the junior guard", () => {
    expect(juniorDraftMayAutoPost({ sourceKey: "matchSummary:42" }, null)).toBe(true);
  });

  it("a synced junior draft only auto-posts for an explicitly auto team", () => {
    for (const sourceKey of ["juniorteamlist:9", synced]) {
      expect(juniorDraftMayAutoPost({ sourceKey }, "auto")).toBe(true);
      expect(juniorDraftMayAutoPost({ sourceKey }, "approval")).toBe(false);
    }
  });

  it("a synced junior draft whose team cannot be resolved never auto-posts", () => {
    expect(juniorDraftMayAutoPost({ sourceKey: synced }, null)).toBe(false);
  });

  it("loader-era junior summaries and junior round sets keep the previous behaviour (correctness review P2)", () => {
    expect(juniorDraftMayAutoPost({ sourceKey: "matchSummary:junior:1234" }, null)).toBe(true);
    expect(juniorDraftMayAutoPost({ sourceKey: "gameday-round:2026/27:R3:junior" }, null)).toBe(
      true,
    );
    expect(juniorDraftMayAutoPost({ sourceKey: null }, null)).toBe(true);
  });
});

describe("juniorResultAutoReady", () => {
  it("only a synced result card follows its team's mode; a loader-era one auto-readies as before", () => {
    expect(juniorResultAutoReady(JUNIOR_SYNC_ID_START + 3, "approval")).toBe(false);
    expect(juniorResultAutoReady(JUNIOR_SYNC_ID_START + 3, "auto")).toBe(true);
    expect(juniorResultAutoReady(1234, "approval")).toBe(true);
  });
});

describe("isSyncedJuniorDraft", () => {
  it("recognises team-list keys and result cards in the sync id band only", () => {
    expect(isSyncedJuniorDraft({ sourceKey: "juniorteamlist:1" })).toBe(true);
    expect(isSyncedJuniorDraft({ sourceKey: `matchSummary:junior:${JUNIOR_SYNC_ID_START}` })).toBe(
      true,
    );
    expect(
      isSyncedJuniorDraft({ sourceKey: `matchSummary:junior:${JUNIOR_SYNC_ID_START - 1}` }),
    ).toBe(false);
    expect(isSyncedJuniorDraft({ sourceKey: "teamlist:1" })).toBe(false);
    expect(isSyncedJuniorDraft({ sourceKey: undefined })).toBe(false);
  });
});

describe("juniorRetimeAction", () => {
  const base = { untouched: true, status: "awaiting_review" };

  it("switch-off holds every unposted junior draft", () => {
    expect(
      juniorRetimeAction({ ...base, syncEnabled: false, mode: "auto", autoReadyAt: new Date() }),
    ).toBe("hold");
    expect(
      juniorRetimeAction({ ...base, syncEnabled: false, mode: "auto", autoReadyAt: null }),
    ).toBe("hold");
  });

  it("an approval team's draft loses its auto-ready time", () => {
    expect(
      juniorRetimeAction({ ...base, syncEnabled: true, mode: "approval", autoReadyAt: new Date() }),
    ).toBe("clear");
    expect(
      juniorRetimeAction({ ...base, syncEnabled: true, mode: "approval", autoReadyAt: null }),
    ).toBe("keep");
  });

  it("an auto-promoted draft of an approval team goes back to review", () => {
    expect(
      juniorRetimeAction({
        ...base,
        status: "ready",
        syncEnabled: true,
        mode: "approval",
        autoReadyAt: new Date(),
      }),
    ).toBe("hold");
  });

  it("an admin-approved draft (ready, no auto-ready time) stays ready", () => {
    expect(
      juniorRetimeAction({
        ...base,
        status: "ready",
        syncEnabled: true,
        mode: "approval",
        autoReadyAt: null,
      }),
    ).toBe("keep");
  });

  it("a draft an admin approved while its team was auto stays ready when the team moves to approval", () => {
    // POST /social-drafts/:id/approve sets reviewedAt but leaves autoReadyAt in place
    // (correctness review P2): only untouched, auto-promoted drafts are held.
    expect(
      juniorRetimeAction({
        ...base,
        untouched: false,
        status: "ready",
        syncEnabled: true,
        mode: "approval",
        autoReadyAt: new Date(),
      }),
    ).toBe("keep");
  });

  it("switch-off still holds an admin-approved draft (R23)", () => {
    expect(
      juniorRetimeAction({
        ...base,
        untouched: false,
        status: "ready",
        syncEnabled: false,
        mode: "auto",
        autoReadyAt: null,
      }),
    ).toBe("hold");
  });

  it("an auto team's untouched draft gets an auto-ready time", () => {
    expect(
      juniorRetimeAction({ ...base, syncEnabled: true, mode: "auto", autoReadyAt: null }),
    ).toBe("set");
    expect(
      juniorRetimeAction({ ...base, syncEnabled: true, mode: "auto", autoReadyAt: new Date() }),
    ).toBe("keep");
  });

  it("an auto team's draft an admin touched keeps no auto-ready time", () => {
    expect(
      juniorRetimeAction({
        ...base,
        untouched: false,
        syncEnabled: true,
        mode: "auto",
        autoReadyAt: null,
      }),
    ).toBe("keep");
  });
});

describe("junior draft keys", () => {
  it("one team-list key per junior fixture, parsed back", () => {
    expect(juniorTeamListKey(42)).toBe("juniorteamlist:42");
    expect(juniorTeamListKey(42).startsWith(JUNIOR_TEAM_LIST_KEY_PREFIX)).toBe(true);
    expect(juniorTeamListFixtureIdOf("juniorteamlist:42")).toBe(42);
    expect(juniorTeamListFixtureIdOf("teamlist:42")).toBeNull();
    expect(juniorTeamListFixtureIdOf(null)).toBeNull();
  });

  it("only synced junior match summaries are recognised", () => {
    expect(syncedJuniorMatchIdOf("matchSummary:junior:200000123")).toBe(200000123);
    expect(syncedJuniorMatchIdOf("matchSummary:junior:1234")).toBeNull();
    expect(syncedJuniorMatchIdOf("matchSummary:senior:200000123")).toBeNull();
    expect(syncedJuniorMatchIdOf(null)).toBeNull();
  });
});
