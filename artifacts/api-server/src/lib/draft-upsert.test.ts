/**
 * Social Studio automation U2 — one draft per event, correction refresh with
 * revisions, stale marking and withdrawal. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  socialDraftsTable,
  socialDraftRevisionsTable,
  milestoneEventsTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
  playerIdMapTable,
  playerPrivacyOverridesTable,
} from "@workspace/db";
import type * as CentralQueries from "@workspace/db/central-queries";
import { draftKeys, upsertDraftByKey, withdrawDraft, findDraftByKey } from "./draft-upsert";
import { listDraftRevisions } from "./draft-revisions";
import {
  detectAndQueueMatchMilestones,
  type MatchMilestoneContext,
} from "./match-milestone-detector";

/**
 * The central privacy read behind a draft's shirt-number lookup, switchable per
 * test: "passthrough" (the real read), "public" (no central needed), or "fail"
 * (a central outage, to prove a failed lookup is not a content change).
 */
const centralPrivacy = vi.hoisted(() => ({
  mode: "passthrough" as "passthrough" | "public" | "fail",
}));
vi.mock("@workspace/db/central-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof CentralQueries>();
  return {
    ...actual,
    isPrivateGroup: async (...args: Parameters<typeof actual.isPrivateGroup>) => {
      if (centralPrivacy.mode === "fail") throw new Error("central unreachable (test)");
      if (centralPrivacy.mode === "public") return false;
      return actual.isPrivateGroup(...args);
    },
  };
});

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

/**
 * Season shirt numbers stamped at upsert (shirt numbers plan U8, KTD11; AE4,
 * R1, R15). Real DB: the tenant's settings row and register entries decide the
 * `shirtNumber` on each player-centric draft.
 */
describe("season shirt numbers on drafts", () => {
  const S = `${STAMP}-shirt`;
  let shirtTenant: number;
  let numbered: number;
  let unnumbered: number;
  let privatePlayer: number;
  let flakyPlayer: number;
  const privateGuid = `priv-${S}`;
  // Crosswalked with no privacy override: its lookup reaches the (mocked) central read.
  const flakyGuid = `flaky-${S}`;

  const draft = (
    key: string,
    kind: string,
    playerId: number,
    season?: number,
    extra: Record<string, unknown> = {},
  ) => ({
    tenantId: shirtTenant,
    engine: "milestone",
    family: "achievements",
    sourceKey: `shirt:${S}:${key}`,
    cardInput: { kind, playerName: "Shirt Player", ...extra },
    appPath: `/players/${playerId}`,
    playerId,
    ...(season === undefined ? {} : { season }),
  });

  const setEnabled = (enabled: boolean) =>
    db
      .insert(shirtNumberSettingsTable)
      .values({ tenantId: shirtTenant, enabled })
      .onConflictDoUpdate({ target: shirtNumberSettingsTable.tenantId, set: { enabled } });

  const setNumber = (playerId: number, season: number, number: string | null) =>
    db
      .update(shirtNumbersTable)
      .set({ number })
      .where(
        and(
          eq(shirtNumbersTable.tenantId, shirtTenant),
          eq(shirtNumbersTable.playerId, playerId),
          eq(shirtNumbersTable.season, season),
        ),
      );

  beforeAll(async () => {
    const [t] = await db
      .insert(tenantsTable)
      .values({ slug: `shirt-${STAMP}`, centralClubId: 9923, name: "Shirt Club", plan: "pro" })
      .returning();
    shirtTenant = t.id;
    const ps = await db
      .insert(playersTable)
      .values([
        { surname: `Nine${STAMP}`, givenName: "Sam" },
        { surname: `Bare${STAMP}`, givenName: "Sam" },
        { surname: `Priv${STAMP}`, givenName: "Sam" },
        { surname: `Flaky${STAMP}`, givenName: "Sam" },
      ])
      .returning();
    [numbered, unnumbered, privatePlayer, flakyPlayer] = ps.map((p) => p.id);
    await db.insert(shirtNumbersTable).values([
      { tenantId: shirtTenant, season: 2025, name: "Sam Nine", playerId: numbered, number: "9" },
      { tenantId: shirtTenant, season: 2026, name: "Sam Nine", playerId: numbered, number: "4" },
      { tenantId: shirtTenant, season: 2025, name: "Sam Bare", playerId: unnumbered, number: null },
      {
        tenantId: shirtTenant,
        season: 2025,
        name: "Sam Priv",
        playerId: privatePlayer,
        number: "11",
      },
      {
        tenantId: shirtTenant,
        season: 2025,
        name: "Sam Flaky",
        playerId: flakyPlayer,
        number: "17",
      },
      // A held entry (no player yet) never reaches a draft (R16).
      {
        tenantId: shirtTenant,
        season: 2025,
        name: "Held",
        participantId: `held-${S}`,
        number: "23",
      },
    ]);
    // A private player: crosswalked, with a platform privacy override (so the
    // check never needs the central database).
    await db.insert(playerIdMapTable).values([
      { tenantId: shirtTenant, participantId: privateGuid, playerId: privatePlayer },
      { tenantId: shirtTenant, participantId: flakyGuid, playerId: flakyPlayer },
    ]);
    await db
      .insert(playerPrivacyOverridesTable)
      .values({ participantId: privateGuid, isPrivate: true });
  });

  afterAll(async () => {
    const drafts = await db
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, shirtTenant));
    if (drafts.length > 0) {
      await db.delete(socialDraftRevisionsTable).where(
        inArray(
          socialDraftRevisionsTable.draftId,
          drafts.map((d) => d.id),
        ),
      );
    }
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, shirtTenant));
    await db.delete(milestoneEventsTable).where(eq(milestoneEventsTable.tenantId, shirtTenant));
    await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.tenantId, shirtTenant));
    await db
      .delete(shirtNumberSettingsTable)
      .where(eq(shirtNumberSettingsTable.tenantId, shirtTenant));
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, shirtTenant));
    await db
      .delete(playerPrivacyOverridesTable)
      .where(eq(playerPrivacyOverridesTable.participantId, privateGuid));
    await db
      .delete(playersTable)
      .where(inArray(playersTable.id, [numbered, unnumbered, privatePlayer, flakyPlayer]));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, shirtTenant));
  });

  it("(R1) with the feature off, no draft gains a shirtNumber", async () => {
    await setEnabled(false);
    const r = await upsertDraftByKey(draft("off", "milestone", numbered, 2025));
    expect(r.draft.cardInput).not.toHaveProperty("shirtNumber");
  });

  it("(AE4) the debut card carries no shirtNumber; the milestone carries #9", async () => {
    await setEnabled(true);
    const debut = await upsertDraftByKey(
      draft("ae4-debut", "debut", numbered, 2025, { capNumber: 142 }),
    );
    expect(debut.draft.cardInput).toEqual({
      kind: "debut",
      playerName: "Shirt Player",
      capNumber: 142,
    });
    const milestone = await upsertDraftByKey(draft("ae4-milestone", "milestone", numbered, 2025));
    expect(milestone.draft.cardInput).toMatchObject({ kind: "milestone", shirtNumber: "9" });
  });

  it("(R15) a century for a player with no number this season has no shirtNumber", async () => {
    await setEnabled(true);
    const r = await upsertDraftByKey(draft("bare", "century", unnumbered, 2025, { runs: 104 }));
    expect(r.draft.cardInput).not.toHaveProperty("shirtNumber");
  });

  it("a second upsert of an unchanged event keeps the number and is unchanged", async () => {
    await setEnabled(true);
    const a = await upsertDraftByKey(draft("same", "fiveFor", numbered, 2025));
    const b = await upsertDraftByKey(draft("same", "fiveFor", numbered, 2025));
    expect(a.draft.cardInput).toMatchObject({ shirtNumber: "9" });
    expect(b.action).toBe("unchanged");
    expect(b.draft.cardInput).toMatchObject({ shirtNumber: "9" });
  });

  it("a newly assigned number refreshes an unposted draft and stales a posted one", async () => {
    await setEnabled(true);
    const unposted = await upsertDraftByKey(draft("assign-a", "century", unnumbered, 2025));
    const posted = await upsertDraftByKey(draft("assign-b", "player", unnumbered, 2025));
    await db
      .update(socialDraftsTable)
      .set({ status: "posted" })
      .where(eq(socialDraftsTable.id, posted.draft.id));
    await setNumber(unnumbered, 2025, "31");
    try {
      expect(unposted.draft.cardInput).not.toHaveProperty("shirtNumber");
      const r1 = await upsertDraftByKey(draft("assign-a", "century", unnumbered, 2025));
      expect(r1.action).toBe("refreshed");
      expect(r1.draft.cardInput).toMatchObject({ shirtNumber: "31" });
      const r2 = await upsertDraftByKey(draft("assign-b", "player", unnumbered, 2025));
      expect(r2.action).toBe("stale");
      expect(r2.draft.cardInput).not.toHaveProperty("shirtNumber");
    } finally {
      await setNumber(unnumbered, 2025, null);
    }
  });

  it("uses the caller's match season, not the season of now", async () => {
    await setEnabled(true);
    // A June 2026 match (season 2025) processed later shows #9, not 2026's #4.
    const old = await upsertDraftByKey(draft("season-old", "milestone", numbered, 2025));
    const cur = await upsertDraftByKey(draft("season-new", "milestone", numbered, 2026));
    expect(old.draft.cardInput).toMatchObject({ shirtNumber: "9" });
    expect(cur.draft.cardInput).toMatchObject({ shirtNumber: "4" });
  });

  it("a private player's drafts carry no shirtNumber", async () => {
    await setEnabled(true);
    const r = await upsertDraftByKey(draft("private", "milestone", privatePlayer, 2025));
    expect(r.draft.cardInput).not.toHaveProperty("shirtNumber");
  });

  it("a failed lookup keeps a posted card's number: unchanged, no stale flag, no revision", async () => {
    await setEnabled(true);
    try {
      centralPrivacy.mode = "public";
      const first = await upsertDraftByKey(draft("flaky-posted", "player", flakyPlayer, 2025));
      expect(first.draft.cardInput).toMatchObject({ shirtNumber: "17" });
      const unposted = await upsertDraftByKey(draft("flaky-open", "century", flakyPlayer, 2025));
      expect(unposted.draft.cardInput).toMatchObject({ shirtNumber: "17" });
      await db
        .update(socialDraftsTable)
        .set({ status: "posted" })
        .where(eq(socialDraftsTable.id, first.draft.id));

      centralPrivacy.mode = "fail";
      const posted = await upsertDraftByKey(draft("flaky-posted", "player", flakyPlayer, 2025));
      expect(posted.action).toBe("unchanged");
      expect(posted.draft.staleSince).toBeNull();
      expect(posted.draft.cardInput).toMatchObject({ shirtNumber: "17" });
      expect(await listDraftRevisions(shirtTenant, first.draft.id)).toEqual([]);
      const [stored] = await db
        .select({ staleSince: socialDraftsTable.staleSince })
        .from(socialDraftsTable)
        .where(eq(socialDraftsTable.id, first.draft.id));
      expect(stored!.staleSince).toBeNull();

      const open = await upsertDraftByKey(draft("flaky-open", "century", flakyPlayer, 2025));
      expect(open.action).toBe("unchanged");
      expect(open.draft.cardInput).toMatchObject({ shirtNumber: "17" });

      // A brand-new draft during the outage goes out without a number (fail closed).
      const fresh = await upsertDraftByKey(draft("flaky-new", "milestone", flakyPlayer, 2025));
      expect(fresh.action).toBe("inserted");
      expect(fresh.draft.cardInput).not.toHaveProperty("shirtNumber");
    } finally {
      centralPrivacy.mode = "passthrough";
    }
  });

  it("a century from a 2025-season match processed later carries the 2025 number", async () => {
    await setEnabled(true);
    // e.g. a June 2026 match (season 2025) imported in August: #9, not 2026's #4.
    const grade = `Shirt Grade ${S}`;
    const ctx: MatchMilestoneContext = {
      tenantId: shirtTenant,
      importId: 1,
      grade,
      season: 2025,
      round: 3,
      opponent: "Rivals",
      abandoned: false,
      lines: [
        {
          playerId: numbered,
          runs: 104,
          balls: 120,
          notOut: false,
          wickets: 0,
          runsConceded: null,
          overs: null,
        },
      ],
      createdCaps: [],
      gradeGamesBefore: new Map([[numbered, 5]]),
    };
    await detectAndQueueMatchMilestones(ctx);
    const century = await findDraftByKey(
      shirtTenant,
      draftKeys.matchFeat("century", numbered, grade, 2025, 3),
    );
    expect(century?.cardInput).toMatchObject({ kind: "century", runs: 104, shirtNumber: "9" });
  });

  it("switching the feature off drops the number on the next refresh", async () => {
    await setEnabled(true);
    const on = await upsertDraftByKey(draft("toggle", "tradingCard", numbered, 2025));
    expect(on.draft.cardInput).toMatchObject({ shirtNumber: "9" });
    await setEnabled(false);
    const off = await upsertDraftByKey(draft("toggle", "tradingCard", numbered, 2025));
    expect(off.action).toBe("refreshed");
    expect(off.draft.cardInput).not.toHaveProperty("shirtNumber");
  });
});
