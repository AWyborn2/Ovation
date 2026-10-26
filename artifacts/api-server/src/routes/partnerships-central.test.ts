import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Partnership records from fall-of-wicket data (honours kiosk redesign C4).
 *
 * Real-DB integration test against the CI central fixture
 * (seed-ci-central-fixture.ts), which has no fall-of-wicket rows: this suite
 * adds a few for Pinjarra (club 3) and removes them afterwards. Pinjarra bats
 * Drew (1) then Eli (2) in both its matches: second in match 1002 (innings 2)
 * and first in match 1003 (innings 1). Skipped without a database; imports are
 * dynamic because `@workspace/db` throws at load when DATABASE_URL is unset.
 */

const HAS_DB = !!process.env.DATABASE_URL && !!process.env.CENTRAL_DATABASE_URL;
const PINJARRA = 3;
const DREW = "55555555-5555-4555-8555-555555555555";
const ELI = "66666666-6666-4666-8666-666666666666";
const CASEY = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!HAS_DB)("central partnership records", () => {
  /** Removes this suite's fall-of-wicket rows. */
  let removeRows: (() => Promise<unknown>) | null = null;

  beforeAll(async () => {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    removeRows = () =>
      db.execute(sql`delete from central.fall_of_wickets where id in (990001, 990002, 990003)`);
    await removeRows();
    await db.execute(sql`
      insert into central.fall_of_wickets (id, match_id, innings, wicket, runs, participant_id)
      values
        -- Pinjarra's innings in match 1002: Drew and Eli put on 60 before Eli fell.
        (990001, 1002, 2, 1, 60, ${ELI}),
        -- Pinjarra's innings in match 1003: 45 for the first wicket.
        (990002, 1003, 1, 1, 45, ${DREW}),
        -- Mandurah's innings in match 1002: not Pinjarra's, never counted.
        (990003, 1002, 1, 1, 99, ${CASEY})
    `);
  });

  afterAll(async () => {
    await removeRows?.();
  });

  it("keeps the club's best completed stand per wicket, from its own innings only", async () => {
    const { centralPartnershipRecords } = await import("@workspace/db/central-queries");
    const records = await centralPartnershipRecords(PINJARRA);
    expect(records).toEqual([
      {
        grade: "A Grade",
        wicket: 1,
        runs: 60,
        matchId: 1002,
        season: "2024/25",
        batters: [
          { participantId: DREW, displayName: "Drew Fixture" },
          { participantId: ELI, displayName: "Eli Fixture" },
        ],
      },
    ]);
  });
});
