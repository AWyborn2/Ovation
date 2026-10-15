/**
 * The auto-queue criteria release SQL (plan 2026-10-15-001 U9, AE7) against a real
 * database: open drafts of the retired kinds are dismissed and their waiting
 * publications cancelled, posted cards stay, every junior team goes back to
 * "approval", and a second run changes nothing.
 *
 * CI only: needs DATABASE_URL (like junior-social.db.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  socialDraftsTable,
  socialPublicationsTable,
  juniorMatchDisplaySettingsTable,
} from "@workspace/db";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

const STAMP = Date.now();
const SQL = fs.readFileSync(
  path.resolve(__dirname, "../../../../scripts/sql/auto-queue-release.sql"),
  "utf8",
);

let tenantId: number;
const draftIds: Record<string, number> = {};

async function draft(kind: string, status: string, key: string): Promise<number> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "test",
      family: "roundup",
      sourceKey: `release-test:${STAMP}:${key}`,
      cardInput: { kind, grade: "A Grade", playerName: "Test Player" },
      appPath: "/players",
      status,
    })
    .returning({ id: socialDraftsTable.id });
  return row.id;
}

const release = () => db.execute(sql.raw(SQL));

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `aq-release-${STAMP}`,
      centralClubId: 97_700 + (STAMP % 200),
      name: "Auto-queue release",
      plan: "pro",
      playhqOrgId: randomUUID(),
    })
    .returning();
  tenantId = t.id;

  // 20 open grade-leader drafts, one posted one, one open card of a kept kind.
  for (let i = 0; i < 20; i++) {
    draftIds[`leader${i}`] = await draft(
      "gradeLeader",
      i % 2 ? "ready" : "awaiting_review",
      `l${i}`,
    );
  }
  draftIds.posted = await draft("gradeLeader", "posted", "posted");
  draftIds.kept = await draft("matchSummary", "awaiting_review", "kept");
  draftIds.trading = await draft("tradingCard", "ready", "trading");

  const at = new Date(Date.now() + 3_600_000);
  await db.insert(socialPublicationsTable).values([
    {
      tenantId,
      draftId: draftIds.leader1,
      platform: "facebook",
      status: "scheduled",
      scheduledFor: at,
      nextAttemptAt: at,
    },
    {
      tenantId,
      draftId: draftIds.posted,
      platform: "facebook",
      status: "published",
      scheduledFor: at,
      nextAttemptAt: at,
    },
    {
      tenantId,
      draftId: draftIds.kept,
      platform: "facebook",
      status: "scheduled",
      scheduledFor: at,
      nextAttemptAt: at,
    },
  ]);

  await db.insert(juniorMatchDisplaySettingsTable).values({
    tenantId,
    teamPublishing: {
      "Year 9": { Hawks: "auto", Eagles: "approval" },
      "Year 4": { Falcons: "auto" },
      "Year 5": {},
    },
  });
});

afterAll(async () => {
  await purgeTestTenants([tenantId]);
});

const draftRows = () =>
  db
    .select({ id: socialDraftsTable.id, status: socialDraftsTable.status })
    .from(socialDraftsTable)
    .where(eq(socialDraftsTable.tenantId, tenantId));
const publicationStatus = async (draftId: number) =>
  (
    await db
      .select({ status: socialPublicationsTable.status })
      .from(socialPublicationsTable)
      .where(
        and(
          eq(socialPublicationsTable.tenantId, tenantId),
          eq(socialPublicationsTable.draftId, draftId),
        ),
      )
  )[0]?.status;
const teamPublishing = async () =>
  (
    await db
      .select({ map: juniorMatchDisplaySettingsTable.teamPublishing })
      .from(juniorMatchDisplaySettingsTable)
      .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId))
  )[0]?.map;

describe("auto-queue release SQL", () => {
  it("dismisses open retired-kind drafts, cancels their publications and leaves the rest", async () => {
    await release();

    const byId = new Map((await draftRows()).map((r) => [r.id, r.status]));
    for (let i = 0; i < 20; i++) expect(byId.get(draftIds[`leader${i}`])).toBe("dismissed");
    expect(byId.get(draftIds.trading)).toBe("dismissed");
    expect(byId.get(draftIds.posted)).toBe("posted");
    expect(byId.get(draftIds.kept)).toBe("awaiting_review");

    expect(await publicationStatus(draftIds.leader1)).toBe("cancelled");
    expect(await publicationStatus(draftIds.posted)).toBe("published");
    expect(await publicationStatus(draftIds.kept)).toBe("scheduled");
  });

  it("puts every junior team back on approval, keeping the map's shape", async () => {
    expect(await teamPublishing()).toEqual({
      "Year 9": { Hawks: "approval", Eagles: "approval" },
      "Year 4": { Falcons: "approval" },
      "Year 5": {},
    });
  });

  it("a second run changes nothing", async () => {
    const before = {
      drafts: (await draftRows()).sort((a, b) => a.id - b.id),
      publishing: await teamPublishing(),
      kept: await publicationStatus(draftIds.kept),
    };
    await release();
    expect((await draftRows()).sort((a, b) => a.id - b.id)).toEqual(before.drafts);
    expect(await teamPublishing()).toEqual(before.publishing);
    expect(await publicationStatus(draftIds.kept)).toBe(before.kept);
  });
});
