import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  selectionsTable,
  squadMembersTable,
  availabilityRoundsTable,
  emailSendsTable,
  emailListsTable,
  emailListMembersTable,
  emailListTeamsTable,
  captainsTable,
  captainGradePermissionsTable,
  availabilitySettingsTable,
  type SelectionRule,
  socialDraftsTable,
  juniorFixturesTable,
} from "@workspace/db";
import app from "../app";
import {
  encodeSession,
  SESSION_COOKIE,
  encodeCaptainSession,
  CAPTAIN_SESSION_COOKIE,
} from "../lib/auth";
import { finaliseSelection, reopenSelection } from "../lib/selection-board";
import {
  BATCH_KIND,
  drainOutbox,
  enqueueScheduledTeamSheets,
  enqueueSocialDigests,
  setCardPngRenderer,
} from "../lib/email-outbox";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import type * as AvailabilityMessaging from "../lib/availability-messaging";
import type * as Outbox from "../lib/email-outbox";
import type * as Renderer from "../lib/card-video-renderer";

/**
 * Email distribution lists (PR1) end to end against real Postgres: admin-only
 * and tenant-scoped list CRUD; finalising a senior side queues its sheet for
 * the "on publish" lists covering the grade (not manual or off ones, and never
 * twice for one version); the drain sends one bcc'd email per list with the PDF
 * attached and logs the count, never an address; "Email team sheet" sends again.
 * PR2: social lists (card ready with the PNG attached or a queue-link fallback,
 * review and milestone batches, never a junior card), scheduled team-sheet
 * lists and the resendOnChange switch.
 * Real-DB integration test (CI's api-tests job provides DATABASE_URL).
 */

vi.mock("../lib/availability-messaging", async (original) => ({
  ...(await original<typeof AvailabilityMessaging>()),
  messageMember: vi.fn(async () => ({ results: [] })),
  notifyStaff: vi.fn(async () => undefined),
}));
// The test drains explicitly, so the fire-and-forget drain never races it.
vi.mock("../lib/email-outbox", async (original) => ({
  ...(await original<typeof Outbox>()),
  kickOutbox: vi.fn(),
}));
vi.mock("../lib/card-video-renderer", async (original) => ({
  ...(await original<typeof Renderer>()),
  renderHtmlToPdf: vi.fn(async () => Buffer.from("%PDF-test")),
}));

const stamp = randomUUID();
const now = new Date("2034-10-05T00:00:00Z");
let tenant: number, other: number, selectionId: number, cookie: string, otherCookie: string;
let ownCaptainCookie: string, otherGradeCaptainCookie: string;
const actor = { kind: "admin" as const, id: 0, name: "Test Admin" };
const sent: EmailMessage[] = [];

const as = (tid: number, c: string | null) => {
  const wrap = (r: request.Test) => (c ? r.set("Cookie", c) : r).set("x-tenant-id", String(tid));
  return {
    get: (p: string) => wrap(request(app).get(p)),
    post: (p: string, body?: object) => wrap(request(app).post(p)).send(body ?? {}),
    put: (p: string, body: object) => wrap(request(app).put(p)).send(body),
    del: (p: string) => wrap(request(app).delete(p)),
  };
};

const list = (over: object = {}) => ({
  kind: "team_sheet",
  name: "A Grade contacts",
  sendMode: "on_publish",
  gradeKeys: ["A Grade"],
  members: [
    { name: "Sam", email: "sam@example.com" },
    { name: "Jo", email: "jo@example.com" },
    { name: "Dup", email: "SAM@example.com" },
  ],
  ...over,
});

const sendsFor = () =>
  db.select().from(emailSendsTable).where(eq(emailSendsTable.tenantId, tenant));

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "email-lists-test";
  process.env.EMAIL_FROM ??= "club@example.com";
  setEmailTransport(async (m) => {
    sent.push(m);
  });
  const tenants = await db
    .insert(tenantsTable)
    .values([
      {
        slug: `email-lists-${stamp}`,
        name: "Email Lists T",
        centralClubId: randomInt(1e6, 1e9),
        readsFromCentral: false,
      },
      {
        slug: `email-other-${stamp}`,
        name: "Email Other T",
        centralClubId: randomInt(1e6, 1e9),
        readsFromCentral: false,
      },
    ])
    .returning();
  [tenant, other] = tenants.map((t) => t.id);
  const admins = await db
    .insert(adminsTable)
    .values([
      { tenantId: tenant, username: `email-${stamp}`, displayName: actor.name, passwordHash: "x" },
      { tenantId: other, username: `email-o-${stamp}`, displayName: "Other", passwordHash: "x" },
    ])
    .returning();
  actor.id = admins[0].id;
  const session = (id: number) =>
    `${SESSION_COOKIE}=${encodeSession({ adminId: id, issuedAt: Date.now() })}`;
  cookie = session(admins[0].id);
  otherCookie = session(admins[1].id);
  const captains = await db
    .insert(captainsTable)
    .values(
      ["A Grade", "B Grade"].map((grade) => ({
        tenantId: tenant,
        username: `email-cap-${grade}-${stamp}`,
        displayName: grade,
        passwordHash: "x",
      })),
    )
    .returning();
  await db.insert(captainGradePermissionsTable).values(
    captains.map((captain, i) => ({
      captainId: captain.id,
      grade: i === 0 ? "A Grade" : "B Grade",
    })),
  );
  const captainSession = (id: number) =>
    `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: id, issuedAt: Date.now() })}`;
  ownCaptainCookie = captainSession(captains[0].id);
  otherGradeCaptainCookie = captainSession(captains[1].id);
  await db.insert(availabilitySettingsTable).values({ tenantId: tenant });

  const members = await db
    .insert(squadMembersTable)
    .values(
      Array.from({ length: 11 }, (_, i) => ({
        tenantId: tenant,
        firstName: "Test",
        lastName: `Member${i}`,
        section: "senior" as const,
      })),
    )
    .returning();
  const [round] = await db
    .insert(availabilityRoundsTable)
    .values({ tenantId: tenant, weekendDate: "2034-10-07" })
    .returning();
  const [fixture] = await db
    .insert(fixturesTable)
    .values({
      tenantId: tenant,
      grade: "A Grade",
      opponentName: "Visitors",
      startAt: new Date("2034-10-07T04:00:00Z"),
      source: "manual",
    })
    .returning();
  const [side] = await db
    .insert(selectionsTable)
    .values({
      tenantId: tenant,
      roundId: round.id,
      fixtureId: fixture.id,
      slots: [...members.map((m) => ({ memberId: m.id })), { memberId: null }],
      captainMemberId: members[0].id,
      keeperMemberId: members[1].id,
    })
    .returning();
  selectionId = side.id;
});

afterAll(async () => {
  setEmailTransport(null);
  await purgeTestTenants([tenant, other]);
});

beforeEach(() => {
  sent.length = 0;
});

describe("retired email-list history", () => {
  it("still resends and retries intentionally listless team-sheet batches", async () => {
    const [batch] = await db.insert(emailSendsTable).values({
      tenantId: other,
      listId: null,
      kind: BATCH_KIND,
      subjectType: "batch",
      subjectId: selectionId,
      idempotencyKey: `${stamp}:listless-batch`,
      payload: { selectionIds: [], reason: "email_all" },
      status: "failed",
      attempts: 1,
    }).returning();
    try {
      const log = await as(other, otherCookie).get("/api/admin/email-sends").expect(200);
      expect(log.body.find((row: { id: number }) => row.id === batch.id))
        .toMatchObject({ listId: null, listName: "Email all team sheets", status: "failed" });
      const again = await as(other, otherCookie)
        .post(`/api/admin/email-sends/${batch.id}/resend`).expect(200);
      expect(again.body).toMatchObject({ kind: BATCH_KIND, listId: null, status: "queued" });
      // Both rows are claimable. Empty batches are safely skipped after claiming.
      expect(await drainOutbox({ tenantId: other })).toEqual({ sent: 0, failed: 0, skipped: 2 });
      const [retried] = await db.select().from(emailSendsTable).where(eq(emailSendsTable.id, batch.id));
      expect(retried).toMatchObject({ attempts: 2, status: "skipped" });
    } finally {
      await db.delete(emailSendsTable).where(eq(emailSendsTable.tenantId, other));
    }
  });

  it("keeps status/count history on retirement, then detaches it on deletion without keeping contacts", async () => {
    const contacts = list({
      name: "Retiring contacts",
      gradeKeys: ["Retired Grade"],
      members: [{ name: "Private contact", email: "private-retired@example.com" }],
    });
    const created = await as(other, otherCookie)
      .post("/api/admin/email-lists", contacts)
      .expect(201);
    const listId = created.body.id;
    const history = await db.insert(emailSendsTable).values(
      (["sent", "failed", "skipped", "queued", "sending"] as const).map((status) => ({
        tenantId: other,
        listId,
        kind: "team_sheet",
        subjectType: "selection",
        subjectId: selectionId,
        idempotencyKey: `${stamp}:retired:${status}`,
        status,
        recipientCount: status === "sent" ? 1 : 0,
        attempts: status === "queued" ? 0 : 1,
        lastError: status === "failed" ? "Delivery unavailable" : null,
        queuedAt: now,
        claimedAt: status === "sending" ? now : null,
        sentAt: status === "sent" ? now : null,
      })),
    ).returning();
    try {
      await as(other, otherCookie)
        .put(`/api/admin/email-lists/${listId}`, { ...contacts, active: false })
        .expect(200);
      expect(await db.select().from(emailSendsTable)
        .where(eq(emailSendsTable.tenantId, other))).toEqual(history);
      await as(tenant, cookie).del(`/api/admin/email-lists/${listId}`).expect(404);
      await as(other, otherCookie).del(`/api/admin/email-lists/${listId}`).expect(204);
      await as(other, otherCookie).del(`/api/admin/email-lists/${listId}`).expect(404);
      expect(await db.select().from(emailListsTable).where(eq(emailListsTable.id, listId))).toEqual([]);
      expect(await db.select().from(emailListMembersTable).where(eq(emailListMembersTable.listId, listId))).toEqual([]);
      expect(await db.select().from(emailListTeamsTable).where(eq(emailListTeamsTable.listId, listId))).toEqual([]);
      const detached = await db.select().from(emailSendsTable)
        .where(eq(emailSendsTable.tenantId, other));
      expect(detached).toEqual(history.map((row) => ({ ...row, listId: null })));
      expect(JSON.stringify(detached)).not.toContain("@example.com");
      const log = await as(other, otherCookie).get("/api/admin/email-sends").expect(200);
      expect(log.body).toHaveLength(history.length);
      for (const row of log.body) expect(row).toMatchObject({ listId: null, listName: "Deleted list" });
      expect(JSON.stringify(log.body)).not.toContain("@example.com");
      const mine = await as(tenant, cookie).get("/api/admin/email-sends").expect(200);
      expect(mine.body.some((row: { id: number }) => history.some((h) => h.id === row.id))).toBe(false);
      await as(tenant, cookie).post(`/api/admin/email-sends/${history[0].id}/resend`).expect(404);
      await as(other, otherCookie).post(`/api/admin/email-sends/${history[0].id}/resend`).expect(409);
      expect(await drainOutbox({ tenantId: other, now: new Date("2034-10-06T00:00:00Z") }))
        .toEqual({ sent: 0, failed: 0, skipped: 2 });
      expect(sent).toEqual([]);
      const after = await db.select().from(emailSendsTable).where(eq(emailSendsTable.tenantId, other));
      for (const row of history.filter((h) => ["sent", "failed", "skipped"].includes(h.status))) {
        expect(after.find((h) => h.id === row.id)).toEqual({ ...row, listId: null });
      }
    } finally {
      // Other suites expect this tenant to have no send history.
      await db.delete(emailSendsTable).where(eq(emailSendsTable.tenantId, other));
      await db.delete(emailListsTable).where(eq(emailListsTable.id, listId));
    }
  });

  it("preserves history even when a list is deleted directly in the database", async () => {
    const created = await as(other, otherCookie)
      .post("/api/admin/email-lists", list({ gradeKeys: ["Direct delete grade"] }))
      .expect(201);
    const [history] = await db.insert(emailSendsTable).values({
      tenantId: other,
      listId: created.body.id,
      kind: "team_sheet",
      subjectType: "selection",
      subjectId: selectionId,
      idempotencyKey: `${stamp}:direct-delete`,
      status: "sent",
      recipientCount: 2,
      sentAt: now,
    }).returning();
    try {
      await db.delete(emailListsTable).where(eq(emailListsTable.id, created.body.id));
      const [after] = await db.select().from(emailSendsTable).where(eq(emailSendsTable.id, history.id));
      expect(after).toEqual({ ...history, listId: null });
    } finally {
      await db.delete(emailSendsTable).where(eq(emailSendsTable.id, history.id));
      await db.delete(emailListsTable).where(eq(emailListsTable.id, created.body.id));
    }
  });
});

describe("email lists", () => {
  it("is admin-only and validated", async () => {
    await as(tenant, null).get("/api/admin/email-lists").expect(401);
    await as(tenant, otherCookie).post("/api/admin/email-lists", list()).expect(401);
    await as(tenant, cookie)
      .post("/api/admin/email-lists", list({ name: "" }))
      .expect(400);
    await as(tenant, cookie)
      .post("/api/admin/email-lists", list({ members: [{ name: "x", email: "not an email" }] }))
      .expect(400);
  });

  it("saves lists per club, de-duplicating addresses", async () => {
    const created = await as(tenant, cookie).post("/api/admin/email-lists", list()).expect(201);
    expect(created.body).toMatchObject({
      name: "A Grade contacts",
      sendMode: "on_publish",
      gradeKeys: ["A Grade"],
    });
    expect(created.body.members.map((m: { email: string }) => m.email)).toEqual([
      "sam@example.com",
      "jo@example.com",
    ]);
    await as(tenant, cookie)
      .post(
        "/api/admin/email-lists",
        list({
          name: "Manual list",
          sendMode: "manual",
          members: [{ name: "M", email: "m@example.com" }],
        }),
      )
      .expect(201);
    await as(tenant, cookie)
      .post("/api/admin/email-lists", list({ name: "Off list", sendMode: "off" }))
      .expect(201);

    const mine = await as(tenant, cookie).get("/api/admin/email-lists").expect(200);
    expect(mine.body).toHaveLength(3);
    const theirs = await as(other, otherCookie).get("/api/admin/email-lists").expect(200);
    expect(theirs.body).toEqual([]);
    // Another club can't edit or delete this club's list by id.
    await as(other, otherCookie)
      .put(`/api/admin/email-lists/${created.body.id}`, list())
      .expect(404);
    await as(other, otherCookie).del(`/api/admin/email-lists/${created.body.id}`).expect(404);
  });

  it("queues the sheet on finalise for on-publish lists only, once per version", async () => {
    await finaliseSelection(tenant, actor, selectionId, 1, { now });
    const queued = await sendsFor();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      kind: "team_sheet",
      subjectId: selectionId,
      status: "queued",
    });

    const totals = await drainOutbox({ tenantId: tenant });
    expect(totals).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(process.env.EMAIL_FROM);
    expect(sent[0].bcc).toEqual(["sam@example.com", "jo@example.com"]);
    expect(sent[0].subject).toContain("A Grade");
    expect(sent[0].attachments?.[0]).toMatchObject({ contentType: "application/pdf" });

    const [row] = await sendsFor();
    expect(row).toMatchObject({ status: "sent", recipientCount: 2, attempts: 1 });
    // The log holds no address anywhere.
    expect(JSON.stringify(row)).not.toContain("@example.com");

    // Draining again sends nothing more.
    expect(await drainOutbox({ tenantId: tenant })).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("a re-finalised side is sent again, marked UPDATED", async () => {
    await reopenSelection(tenant, actor, selectionId, now);
    const [reopened] = await db
      .select()
      .from(selectionsTable)
      .where(eq(selectionsTable.id, selectionId));
    await finaliseSelection(tenant, actor, selectionId, reopened.version, { now });
    await drainOutbox({ tenantId: tenant });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject.startsWith("UPDATED: ")).toBe(true);
  });

  it("Email team sheet sends to every list not switched off", async () => {
    const res = await as(tenant, cookie).post(`/api/selection/${selectionId}/email`).expect(200);
    expect(res.body).toEqual({ queued: 2 });
    await drainOutbox({ tenantId: tenant });
    expect(sent.map((m) => m.bcc)).toEqual(
      expect.arrayContaining([["sam@example.com", "jo@example.com"], ["m@example.com"]]),
    );
    // Another club can't email this club's side.
    await as(other, otherCookie).post(`/api/selection/${selectionId}/email`).expect(404);
  });

  it("the send log lists sends and can resend one", async () => {
    const log = await as(tenant, cookie).get("/api/admin/email-sends").expect(200);
    expect(log.body.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(log.body)).not.toContain("@example.com");
    const again = await as(tenant, cookie)
      .post(`/api/admin/email-sends/${log.body[0].id}/resend`)
      .expect(200);
    expect(again.body).toMatchObject({ status: "queued" });
    expect((await as(other, otherCookie).get("/api/admin/email-sends").expect(200)).body).toEqual(
      [],
    );
    await as(other, otherCookie)
      .post(`/api/admin/email-sends/${log.body[0].id}/resend`)
      .expect(404);
  });
});

describe("manual team-sheet email permissions", () => {
  it.each<{
    rule: SelectionRule;
    role: "own" | "other" | "admin";
    status: number;
  }>([
    { rule: "captains_own_grade", role: "own", status: 200 },
    { rule: "captains_own_grade", role: "other", status: 403 },
    { rule: "admins_only", role: "own", status: 403 },
    { rule: "admins_only", role: "other", status: 403 },
    { rule: "captains_all_grades", role: "other", status: 200 },
    { rule: "admins_only", role: "admin", status: 200 },
  ])("$rule: $role returns $status", async ({ rule, role, status }) => {
    await db
      .update(availabilitySettingsTable)
      .set({ selectionRule: rule })
      .where(eq(availabilitySettingsTable.tenantId, tenant));
    const before = (await sendsFor()).length;
    const auth =
      role === "admin" ? cookie : role === "own" ? ownCaptainCookie : otherGradeCaptainCookie;
    await as(tenant, auth).post(`/api/selection/${selectionId}/email`).expect(status);
    const after = (await sendsFor()).length;
    expect(after - before).toBe(status === 200 ? 2 : 0);
  });

  it("requires authentication and refuses another club's captain", async () => {
    await as(tenant, null).post(`/api/selection/${selectionId}/email`).expect(401);
    await as(other, ownCaptainCookie).post(`/api/selection/${selectionId}/email`).expect(401);
  });
});

describe("team-sheet extras (PR2)", () => {
  const sendsOf = async (listId: number) =>
    (await sendsFor()).filter((r) => r.listId === listId && r.kind === "team_sheet");
  const refinalise = async () => {
    await reopenSelection(tenant, actor, selectionId, now);
    const [side] = await db
      .select()
      .from(selectionsTable)
      .where(eq(selectionsTable.id, selectionId));
    await finaliseSelection(tenant, actor, selectionId, side.version, { now });
  };

  it("a list with resendOnChange off gets the first version only", async () => {
    const created = await as(tenant, cookie)
      .post("/api/admin/email-lists", list({ name: "No resends", resendOnChange: false }))
      .expect(201);
    expect(created.body.resendOnChange).toBe(false);
    await refinalise();
    expect(await sendsOf(created.body.id)).toHaveLength(1);
    await refinalise();
    expect(await sendsOf(created.body.id)).toHaveLength(1);
    await drainOutbox({ tenantId: tenant });
  });

  it("a scheduled list needs a day and time", async () => {
    await as(tenant, cookie)
      .post("/api/admin/email-lists", list({ sendMode: "scheduled" }))
      .expect(400);
    await as(tenant, cookie)
      .post(
        "/api/admin/email-lists",
        list({ sendMode: "scheduled", schedule: { dow: 4, time: "6pm" } }),
      )
      .expect(400);
  });

  it("a scheduled list gets the coming round's side in the hour after its slot, once", async () => {
    // Thursday 18:00 Perth = Thursday 10:00 UTC; the A Grade fixture is on Saturday 7 Oct.
    const created = await as(tenant, cookie)
      .post(
        "/api/admin/email-lists",
        list({ name: "Thursday", sendMode: "scheduled", schedule: { dow: 4, time: "18:00" } }),
      )
      .expect(201);
    expect(created.body.schedule).toEqual({ dow: 4, time: "18:00" });
    const at = (iso: string) => enqueueScheduledTeamSheets(new Date(iso), { tenantId: tenant });
    expect(await at("2034-10-05T09:30:00Z")).toBe(0);
    // Finalising never sends to a scheduled list.
    await refinalise();
    expect(await sendsOf(created.body.id)).toHaveLength(0);
    expect(await at("2034-10-05T10:20:00Z")).toBe(1);
    expect(await at("2034-10-05T10:40:00Z")).toBe(0);
    // Scheduled sends go out as one batch for the club's due lists.
    const [row] = (await sendsFor()).filter(
      (r) => r.kind === BATCH_KIND && (r.payload.listIds as number[]).includes(created.body.id),
    );
    expect(row).toMatchObject({ listId: null, subjectId: selectionId });
    expect(row.payload.selectionIds).toEqual([selectionId]);
    await drainOutbox({ tenantId: tenant });
    expect(sent.some((m) => m.subject.includes("A Grade"))).toBe(true);
  });
});

describe("social lists (PR2)", () => {
  let socialListId: number;
  const socialSends = async () =>
    (await sendsFor()).filter((r) => r.listId === socialListId).sort((a, b) => a.id - b.id);
  const addDraft = async (
    key: string,
    over: Partial<typeof socialDraftsTable.$inferInsert> = {},
  ): Promise<number> => {
    const [d] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: tenant,
        engine: "milestone",
        status: "awaiting_review",
        cardInput: { kind: "milestone" },
        caption: `${key} caption\nline two`,
        ...over,
      })
      .returning();
    return d.id;
  };

  afterAll(() => setCardPngRenderer(null));

  it("saves toggles and no grades", async () => {
    const res = await as(tenant, cookie)
      .post("/api/admin/email-lists", {
        kind: "social",
        name: "Social media",
        gradeKeys: ["A Grade"],
        members: [{ name: "Studio", email: "studio@example.com" }],
        assetReady: true,
        reviewNeeded: true,
        milestone: false,
      })
      .expect(201);
    expect(res.body).toMatchObject({
      kind: "social",
      gradeKeys: [],
      assetReady: true,
      reviewNeeded: true,
      milestone: false,
    });
    socialListId = res.body.id;
  });

  it("marking a card ready emails it with the PNG and caption, once", async () => {
    setCardPngRenderer(async () => [Buffer.from("png-bytes")]);
    const id = await addDraft("ready");
    await as(tenant, cookie).post(`/api/social-drafts/${id}/approve`).expect(200);
    await as(tenant, cookie).post(`/api/social-drafts/${id}/approve`).expect(200);
    const rows = await socialSends();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "asset_ready",
      subjectId: id,
      idempotencyKey: `sa:${id}:asset_ready:l${socialListId}`,
    });
    await drainOutbox({ tenantId: tenant });
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toEqual(["studio@example.com"]);
    expect(sent[0].text).toContain("ready caption\nline two");
    expect(sent[0].attachments?.[0]).toMatchObject({
      filename: `card-${id}.png`,
      contentType: "image/png",
    });
    const [row] = await socialSends();
    expect(row).toMatchObject({ status: "sent", lastError: null, recipientCount: 1 });
    expect(JSON.stringify(row)).not.toContain("@example.com");
  });

  it("a card that fails to render is sent with a queue link, noted in the log", async () => {
    setCardPngRenderer(async () => {
      throw new Error("harness unreachable");
    });
    const id = await addDraft("norender");
    await as(tenant, cookie).post(`/api/social-drafts/${id}/approve`).expect(200);
    // The link goes to the club's own app (slug.<apex>), never the render origin.
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
    try {
      await drainOutbox({ tenantId: tenant });
    } finally {
      delete process.env.PLATFORM_BASE_DOMAIN;
    }
    expect(sent).toHaveLength(1);
    expect(sent[0].attachments ?? []).toEqual([]);
    expect(sent[0].text).toContain(
      `https://email-lists-${stamp}.ovation.test/admin/social/queue?ids=${id}`,
    );
    const row = (await socialSends()).find((r) => r.subjectId === id);
    expect(row?.status).toBe("sent");
    expect(row?.lastError).toContain("harness unreachable");
  });

  it("junior cards never reach a list", async () => {
    const id = await addDraft("junior", { sourceMatchIsJunior: true });
    await as(tenant, cookie).post(`/api/social-drafts/${id}/approve`).expect(200);
    expect((await socialSends()).filter((r) => r.subjectId === id)).toEqual([]);
  });

  it("one review batch per sweep lists the new senior cards; milestones stay off", async () => {
    const a = await addDraft("review-a");
    const b = await addDraft("review-b");
    const junior = await addDraft("review-j", { cardInput: { kind: "milestone", junior: true } });
    expect(await enqueueSocialDigests(new Date(), { tenantId: tenant })).toBe(1);
    expect(await enqueueSocialDigests(new Date(), { tenantId: tenant })).toBe(0);
    const batch = (await socialSends()).filter((r) => r.kind === "review_needed");
    expect(batch).toHaveLength(1);
    expect(batch[0].payload.draftIds).toEqual([a, b]);
    expect(batch[0].payload.draftIds).not.toContain(junior);
    expect((await socialSends()).filter((r) => r.kind === "milestone")).toEqual([]);
    await drainOutbox({ tenantId: tenant });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("2 cards to review");
    expect(sent[0].text).toContain("review-a caption");
    expect(sent[0].text).not.toContain("review-j");
    // Another club sees none of it.
    expect((await as(other, otherCookie).get("/api/admin/email-lists").expect(200)).body).toEqual(
      [],
    );
  });
});

describe("junior team-sheet lists (PR2, decision of 20 Oct 2026)", () => {
  let juniorSide: number, juniorList: number, seniorSameName: number, juniorOnSenior: number;
  const listSends = async (listId: number) =>
    (await sendsFor()).filter((r) => r.listId === listId && r.kind === "team_sheet");

  beforeAll(async () => {
    const kids = await db
      .insert(squadMembersTable)
      .values(
        Array.from({ length: 11 }, (_, i) => ({
          tenantId: tenant,
          firstName: "Kid",
          lastName: `Junior${i}`,
          section: "junior" as const,
        })),
      )
      .returning();
    const [round] = await db
      .select()
      .from(availabilityRoundsTable)
      .where(eq(availabilityRoundsTable.tenantId, tenant));
    const [fixture] = await db
      .insert(juniorFixturesTable)
      .values({
        tenantId: tenant,
        playhqMatchId: `email-jr-${stamp}`,
        seasonStartYear: 2034,
        ageGroup: "Year 7",
        teamName: "Year 7 Gold",
        opponentName: "Rivals Year 7",
        startAt: new Date("2034-10-07T01:00:00Z"),
        isHome: true,
      })
      .returning();
    const [side] = await db
      .insert(selectionsTable)
      .values({
        tenantId: tenant,
        roundId: round.id,
        juniorFixtureId: fixture.id,
        slots: [...kids.map((m) => ({ memberId: m.id })), { memberId: null }],
        captainMemberId: kids[0].id,
        keeperMemberId: kids[1].id,
      })
      .returning();
    juniorSide = side.id;
  });

  it("a junior list is fixed as junior and covers junior teams", async () => {
    const jr = await as(tenant, cookie)
      .post(
        "/api/admin/email-lists",
        list({
          name: "Year 7 Gold parents",
          section: "junior",
          gradeKeys: ["Year 7 Gold"],
          members: [{ name: "Parent", email: "parent@example.com" }],
        }),
      )
      .expect(201);
    expect(jr.body).toMatchObject({ section: "junior", gradeKeys: ["Year 7 Gold"] });
    juniorList = jr.body.id;
    // An update can't move a list to the other section.
    const moved = await as(tenant, cookie)
      .put(`/api/admin/email-lists/${juniorList}`, {
        ...list({ name: "Year 7 Gold parents", gradeKeys: ["Year 7 Gold"] }),
        section: "senior",
        members: [{ name: "Parent", email: "parent@example.com" }],
      })
      .expect(200);
    expect(moved.body.section).toBe("junior");

    // A senior list whose key reads the same as the junior team, and a junior list on a senior grade.
    seniorSameName = (
      await as(tenant, cookie)
        .post(
          "/api/admin/email-lists",
          list({
            name: "Senior same name",
            gradeKeys: ["Year 7 Gold"],
            members: [{ name: "S", email: "senior-same@example.com" }],
          }),
        )
        .expect(201)
    ).body.id;
    juniorOnSenior = (
      await as(tenant, cookie)
        .post(
          "/api/admin/email-lists",
          list({
            name: "Junior on A Grade",
            section: "junior",
            gradeKeys: ["A Grade"],
            members: [{ name: "J", email: "junior-a@example.com" }],
          }),
        )
        .expect(201)
    ).body.id;
  });

  it("a junior side finalises to its junior list only", async () => {
    await finaliseSelection(tenant, actor, juniorSide, 1, { now });
    expect(await listSends(juniorList)).toHaveLength(1);
    expect(await listSends(seniorSameName)).toHaveLength(0);
    await drainOutbox({ tenantId: tenant });
    const toParent = sent.filter((m) => m.bcc?.includes("parent@example.com"));
    expect(toParent).toHaveLength(1);
    expect(toParent[0].attachments?.[0]).toMatchObject({ contentType: "application/pdf" });
    expect(sent.some((m) => m.bcc?.includes("senior-same@example.com"))).toBe(false);
  });

  it("a junior list never gets a senior sheet", async () => {
    await reopenSelection(tenant, actor, selectionId, now);
    const [side] = await db
      .select()
      .from(selectionsTable)
      .where(eq(selectionsTable.id, selectionId));
    await finaliseSelection(tenant, actor, selectionId, side.version, { now });
    expect(await listSends(juniorOnSenior)).toHaveLength(0);
    await drainOutbox({ tenantId: tenant });
    expect(sent.some((m) => m.bcc?.includes("junior-a@example.com"))).toBe(false);
  });

  it("Email team sheet works for a junior side, to junior lists only", async () => {
    const res = await as(tenant, cookie).post(`/api/selection/${juniorSide}/email`).expect(200);
    expect(res.body).toEqual({ queued: 1 });
    await drainOutbox({ tenantId: tenant });
    expect(sent.map((m) => m.bcc)).toEqual([["parent@example.com"]]);
  });

  it("a send whose list and sheet sections differ is skipped, not sent", async () => {
    // Force a mismatched row (as if a list were edited by hand): the drain refuses it.
    await db.insert(emailSendsTable).values({
      tenantId: tenant,
      listId: seniorSameName,
      kind: "team_sheet",
      subjectType: "selection",
      subjectId: juniorSide,
      idempotencyKey: `mismatch-${stamp}`,
      payload: {},
    });
    await drainOutbox({ tenantId: tenant });
    expect(sent).toEqual([]);
    const [row] = (await sendsFor()).filter((r) => r.idempotencyKey === `mismatch-${stamp}`);
    expect(row.status).toBe("skipped");
  });
});
