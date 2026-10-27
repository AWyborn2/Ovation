/**
 * Player sponsors: a sweep draft records the one player its card is about
 * (player-centred kinds only, never a junior card), on insert and refresh.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  captionTemplatesTable,
  socialDraftsTable,
  socialSettingsTable,
  tenantsTable,
} from "@workspace/db";
import { upsertDraftByKey } from "./draft-upsert";

const STAMP = Date.now();
let tenantId = 0;

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `subject-${STAMP}`, centralClubId: 9880, name: "Subject Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const upsert = (key: string, cardInput: Record<string, unknown>, extra: object = {}) =>
  upsertDraftByKey({
    tenantId,
    engine: "milestone",
    family: "achievements",
    sourceKey: `${key}:${STAMP}`,
    cardInput: cardInput as never,
    appPath: "/players/42",
    ...extra,
  });

describe("draft subject player", () => {
  it("a player-centred card records its player from the link, and keeps it on refresh", async () => {
    const first = await upsert("century", { kind: "century", playerName: "Sam", runs: 101 });
    expect(first.draft.subjectPlayerId).toBe(42);
    const again = await upsert("century", { kind: "century", playerName: "Sam", runs: 102 });
    expect(again.action).toBe("refreshed");
    expect(again.draft.subjectPlayerId).toBe(42);
  });

  it("the sweep's own player id wins over the link", async () => {
    const r = await upsert("debut", { kind: "debut", playerName: "Kim" }, { playerId: 77 });
    expect(r.draft.subjectPlayerId).toBe(77);
  });

  it("other kinds and junior cards record none", async () => {
    const result = await upsert("result", { kind: "record", playerName: "Sam" });
    expect(result.draft.subjectPlayerId).toBeNull();
    const junior = await upsert(
      "junior",
      { kind: "milestone", playerName: "Kid", junior: true },
      { sourceMatchIsJunior: true },
    );
    expect(junior.draft.subjectPlayerId).toBeNull();
  });
});
