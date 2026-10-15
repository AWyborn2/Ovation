import { describe, expect, it } from "vitest";
import { JUNIOR_SYNC_ID_START } from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { effectiveDraftStatus, juniorAutoPostClear } from "./effective-draft-state";

/**
 * The read model of a draft's status, and the junior auto-post guard's scope (junior
 * PlayHQ sync review, correctness P2). Pure: no query runs.
 */

const NOW = new Date("2026-10-14T08:00:00.000Z");
const PAST = new Date("2026-10-14T07:00:00.000Z");
const on = { enabled: true };

describe("effectiveDraftStatus", () => {
  it("a senior draft past its deadline reads as ready while auto-post is on", () => {
    expect(
      effectiveDraftStatus(
        { status: "awaiting_review", autoReadyAt: PAST, sourceKey: "matchSummary:42" },
        on,
        NOW,
      ),
    ).toBe("ready");
  });

  it("a loader-era junior result card keeps the pre-sync behaviour", () => {
    expect(
      effectiveDraftStatus(
        { status: "awaiting_review", autoReadyAt: PAST, sourceKey: "matchSummary:junior:1234" },
        on,
        NOW,
      ),
    ).toBe("ready");
  });

  it("a synced junior draft past its deadline reads as awaiting until promotion stores it", () => {
    // Promotion checks the team's publishing mode (persistDueDrafts); the read model
    // cannot, so it waits for the stored status rather than showing 'ready' early.
    for (const sourceKey of [
      "juniorteamlist:7",
      `matchSummary:junior:${JUNIOR_SYNC_ID_START + 5}`,
    ]) {
      expect(
        effectiveDraftStatus({ status: "awaiting_review", autoReadyAt: PAST, sourceKey }, on, NOW),
      ).toBe("awaiting_review");
      expect(effectiveDraftStatus({ status: "ready", autoReadyAt: PAST, sourceKey }, on, NOW)).toBe(
        "ready",
      );
    }
  });
});

describe("juniorAutoPostClear scope", () => {
  const text = new PgDialect().sqlToQuery(juniorAutoPostClear).sql;

  it("applies only to synced junior drafts (team-list keys and the sync id band)", () => {
    expect(text).toContain("juniorteamlist:");
    expect(text).toContain("matchSummary:junior:");
    const params = new PgDialect().sqlToQuery(juniorAutoPostClear).params;
    expect(params).toContain(JUNIOR_SYNC_ID_START);
  });

  it("no longer exempts only senior drafts by marker", () => {
    expect(text).not.toContain("->>'junior'");
  });
});
