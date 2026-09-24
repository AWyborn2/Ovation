/**
 * Social Studio automation U2 — one draft per event, correction refresh with
 * revisions, stale marking and withdrawal. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  socialDraftsTable,
  milestoneEventsTable,
} from "@workspace/db";
import { draftKeys, upsertDraftByKey, withdrawDraft, findDraftByKey } from "./draft-upsert";
import { listDraftRevisions } from "./draft-revisions";
import {
  detectAndQueueMatchMilestones,
  type MatchMilestoneContext,
} from "./match-milestone-detector";

const STAMP = Date.now();
let tenantId: number;
let otherTenantId: number;
let playerId: number;

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `upsert-${STAMP}`, centralClubId: 9921, name: "Upsert Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `upsert-o-${STAMP}`, centralClubId: 9922, name: "Other", plan: "pro" })
    .returning();
  otherTenantId = o.id;
  const [p] = await db
    .insert(playersTable)
    .values({ surname: `Keeper${STAMP}`, givenName: "Sam" })
    .returning();
  playerId = p.id;
});

afterAll(async () => {
  await db
    .delete(socialDraftsTable)
    .where(inArray(socialDraftsTable.tenantId, [tenantId, otherTenantId]));
  await db
    .delete(milestoneEventsTable)
    .where(inArray(milestoneEventsTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(playersTable).where(eq(playersTable.id, playerId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

const base = (key: string, cardInput: Record<string, unknown>, tenant = tenantId) => ({
  tenantId: tenant,
  engine: "roundup",
  family: "roundup",
  sourceKey: key,
  cardInput,
  appPath: "/players/1",
});

describe("upsertDraftByKey", () => {
  it("running the same event twice keeps one draft", async () => {
    const key = `test:${STAMP}:twice`;
    const a = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 10 }));
    const b = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 10 }));
    expect(a.action).toBe("inserted");
    expect(b.action).toBe("unchanged");
    const rows = await db
      .select()
      .from(socialDraftsTable)
      .where(and(eq(socialDraftsTable.tenantId, tenantId), eq(socialDraftsTable.sourceKey, key)));
    expect(rows).toHaveLength(1);
  });

  it("changed input refreshes an unposted draft and keeps a revision", async () => {
    const key = `test:${STAMP}:refresh`;
    const first = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 10 }));
    // An admin edit on the unposted draft is recoverable after a refresh.
    await db
      .update(socialDraftsTable)
      .set({ caption: "my edit", editedAt: new Date() })
      .where(eq(socialDraftsTable.id, first.draft.id));
    const refreshed = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 12 }));
    expect(refreshed.action).toBe("refreshed");
    expect(refreshed.draft.cardInput).toEqual({ kind: "gradeLeader", value: 12 });
    const revs = await listDraftRevisions(tenantId, first.draft.id);
    expect(revs).toHaveLength(1);
    expect(revs[0].reason).toBe("refresh");
    expect(revs[0].cardInput).toEqual({ kind: "gradeLeader", value: 10 });
    expect(revs[0].caption).toBe("my edit");
  });

  it("a posted draft keeps its content and is marked stale", async () => {
    const key = `test:${STAMP}:posted`;
    const first = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 10 }));
    await db
      .update(socialDraftsTable)
      .set({ status: "posted" })
      .where(eq(socialDraftsTable.id, first.draft.id));
    const res = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 99 }));
    expect(res.action).toBe("stale");
    expect(res.draft.cardInput).toEqual({ kind: "gradeLeader", value: 10 });
    expect(res.draft.staleSince).not.toBeNull();
  });

  it("a dismissed draft does not block a new one for the same key", async () => {
    const key = `test:${STAMP}:dismissed`;
    const first = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 1 }));
    await withdrawDraft(first.draft);
    const again = await upsertDraftByKey(base(key, { kind: "gradeLeader", value: 1 }));
    expect(again.action).toBe("inserted");
    expect(again.draft.id).not.toBe(first.draft.id);
  });

  it("the same key in two tenants gives independent drafts", async () => {
    const key = `test:${STAMP}:tenants`;
    const a = await upsertDraftByKey(base(key, { kind: "x" }));
    const b = await upsertDraftByKey(base(key, { kind: "x" }, otherTenantId));
    expect(a.action).toBe("inserted");
    expect(b.action).toBe("inserted");
    expect(a.draft.id).not.toBe(b.draft.id);
  });
});

describe("per-match feats", () => {
  const ctx = (runs: number, round: number): MatchMilestoneContext => ({
    tenantId,
    importId: 1,
    grade: "B Grade",
    season: 2025,
    round,
    opponent: "Rivals",
    abandoned: false,
    lines: [
      {
        playerId,
        runs,
        balls: 120,
        notOut: false,
        wickets: 0,
        runsConceded: null,
        overs: null,
      },
    ],
    createdCaps: [],
    gradeGamesBefore: new Map([[playerId, 5]]),
  });

  it("a corrected score refreshes the century; a correction below 100 withdraws it", async () => {
    const key = draftKeys.matchFeat("century", playerId, "B Grade", 2025, 7);
    await detectAndQueueMatchMilestones(ctx(104, 7));
    const drafted = await findDraftByKey(tenantId, key);
    expect(drafted?.cardInput).toMatchObject({ kind: "century", runs: 104 });

    await detectAndQueueMatchMilestones(ctx(112, 7));
    expect((await findDraftByKey(tenantId, key))?.cardInput).toMatchObject({ runs: 112 });

    await detectAndQueueMatchMilestones(ctx(98, 7));
    expect(await findDraftByKey(tenantId, key)).toBeNull();
  });

  it("importing the next round leaves the previous round's card alone", async () => {
    const r8 = draftKeys.matchFeat("century", playerId, "B Grade", 2025, 8);
    await detectAndQueueMatchMilestones(ctx(130, 8));
    const before = await findDraftByKey(tenantId, r8);
    await detectAndQueueMatchMilestones(ctx(40, 9));
    const after = await findDraftByKey(tenantId, r8);
    expect(after?.id).toBe(before?.id);
    expect(after?.cardInput).toEqual(before?.cardInput);
  });
});
