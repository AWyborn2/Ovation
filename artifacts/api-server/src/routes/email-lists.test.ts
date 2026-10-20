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
} from "@workspace/db";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { finaliseSelection, reopenSelection } from "../lib/selection-board";
import { drainOutbox } from "../lib/email-outbox";
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
