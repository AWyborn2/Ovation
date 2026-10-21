import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  juniorFixturesTable,
  selectionsTable,
  squadMembersTable,
  availabilityRoundsTable,
  emailSendsTable,
} from "@workspace/db";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { BATCH_KIND, drainOutbox, enqueueScheduledTeamSheets } from "../lib/email-outbox";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";
import { renderHtmlToPdf } from "../lib/card-video-renderer";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import type * as Outbox from "../lib/email-outbox";
import type * as Renderer from "../lib/card-video-renderer";

/**
 * "Email all" and combined team sheets against real Postgres: the board's
 * finalised sides go out as one batch; each contact gets one email with every
 * sheet they're due (across their lists) as pages of one PDF, contacts due the
 * same sheets share one bcc'd email, senior and junior sheets never share one,
 * switched-off lists get nothing, a retry sends only the groups that failed,
 * and scheduled lists due together go out as one batch, once per slot.
 * Real-DB integration test (CI's api-tests job provides DATABASE_URL).
 */

vi.mock("../lib/email-outbox", async (original) => ({
  ...(await original<typeof Outbox>()),
  kickOutbox: vi.fn(),
}));
vi.mock("../lib/card-video-renderer", async (original) => ({
  ...(await original<typeof Renderer>()),
  renderHtmlToPdf: vi.fn(async () => Buffer.from("%PDF-test")),
}));

const stamp = randomUUID();
let tenant: number, other: number, cookie: string, otherCookie: string;
let sideA: number, sideB: number, sideJ: number, draftSide: number;
const sent: EmailMessage[] = [];
let failFor: string | null = null;

const as = (tid: number, c: string | null) => ({
  post: (p: string, body?: object) => {
    const r = request(app)
      .post(p)
      .set("x-tenant-id", String(tid))
      .send(body ?? {});
    return c ? r.set("Cookie", c) : r;
  },
  get: (p: string) => {
    const r = request(app).get(p).set("x-tenant-id", String(tid));
    return c ? r.set("Cookie", c) : r;
  },
});

const addList = (body: object) =>
  as(tenant, cookie)
    .post("/api/admin/email-lists", { kind: "team_sheet", sendMode: "manual", ...body })
    .expect(201);

/** Pages in the PDF that went with each email, from the HTML the renderer was given. */
const pagesRendered = () =>
  vi
    .mocked(renderHtmlToPdf)
    .mock.calls.map(([html]) => (String(html).match(/<section class="page /g) ?? []).length);

const to = (address: string) => sent.filter((m) => m.bcc?.includes(address));
const batches = () =>
  db
    .select()
    .from(emailSendsTable)
    .where(eq(emailSendsTable.tenantId, tenant))
    .then((rows) => rows.filter((r) => r.kind === BATCH_KIND));

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "email-all-test";
  process.env.EMAIL_FROM ??= "club@example.com";
  setEmailTransport(async (m) => {
    if (failFor && m.bcc?.includes(failFor)) throw new Error("mailbox down");
    sent.push(m);
  });
  const tenants = await db
    .insert(tenantsTable)
    .values([
      {
        slug: `email-all-${stamp}`,
        name: "Email All T",
        centralClubId: randomInt(1e6, 1e9),
        readsFromCentral: false,
      },
      {
        slug: `email-all-o-${stamp}`,
        name: "Email All Other",
        centralClubId: randomInt(1e6, 1e9),
        readsFromCentral: false,
      },
    ])
    .returning();
  [tenant, other] = tenants.map((t) => t.id);
  const admins = await db
    .insert(adminsTable)
    .values([
      { tenantId: tenant, username: `ea-${stamp}`, displayName: "Admin", passwordHash: "x" },
      { tenantId: other, username: `ea-o-${stamp}`, displayName: "Other", passwordHash: "x" },
    ])
    .returning();
  const session = (id: number) =>
    `${SESSION_COOKIE}=${encodeSession({ adminId: id, issuedAt: Date.now() })}`;
  cookie = session(admins[0].id);
  otherCookie = session(admins[1].id);

  const members = await db
    .insert(squadMembersTable)
    .values(
      Array.from({ length: 22 }, (_, i) => ({
        tenantId: tenant,
        firstName: i < 11 ? "Senior" : "Kid",
        lastName: `P${i}`,
        section: (i < 11 ? "senior" : "junior") as "senior" | "junior",
      })),
    )
    .returning();
  const [round] = await db
    .insert(availabilityRoundsTable)
    .values({ tenantId: tenant, weekendDate: "2034-10-07" })
    .returning();
  const fixture = async (grade: string) =>
    (
      await db
        .insert(fixturesTable)
        .values({
          tenantId: tenant,
          grade,
          opponentName: "Visitors",
          startAt: new Date("2034-10-07T04:00:00Z"),
          source: "manual",
        })
        .returning()
    )[0].id;
  const [jfx] = await db
    .insert(juniorFixturesTable)
    .values({
      tenantId: tenant,
      playhqMatchId: `email-all-jr-${stamp}`,
      seasonStartYear: 2034,
      ageGroup: "Year 7",
      teamName: "Year 7 Gold",
      opponentName: "Rivals Year 7",
      startAt: new Date("2034-10-07T01:00:00Z"),
      isHome: true,
    })
    .returning();
  const senior = members.slice(0, 11).map((m) => ({ memberId: m.id }));
  const junior = members.slice(11).map((m) => ({ memberId: m.id }));
  const side = async (
    v: { fixtureId?: number; juniorFixtureId?: number },
    slots: { memberId: number | null }[],
    state: "final" | "draft" = "final",
  ) =>
    (
      await db
        .insert(selectionsTable)
        .values({
          tenantId: tenant,
          roundId: round.id,
          ...v,
          slots: [...slots, { memberId: null }],
          state,
          ...(state === "final" ? { finalisedAt: new Date("2034-10-05T00:00:00Z") } : {}),
        })
        .returning()
    )[0].id;
  sideA = await side({ fixtureId: await fixture("A Grade") }, senior);
  sideB = await side({ fixtureId: await fixture("B Grade") }, senior);
  draftSide = await side({ fixtureId: await fixture("C Grade") }, senior, "draft");
  sideJ = await side({ juniorFixtureId: jfx.id }, junior);

  // Sam is on both senior lists and the junior one; Jo only A; Kim only B.
  await addList({
    name: "A Grade",
    gradeKeys: ["A Grade"],
    members: [
      { name: "Sam", email: "sam@example.com" },
      { name: "Jo", email: "jo@example.com" },
    ],
  });
  await addList({
    name: "B Grade",
    gradeKeys: ["B Grade"],
    members: [
      { name: "Sam again", email: "SAM@example.com" },
      { name: "Kim", email: "kim@example.com" },
    ],
  });
  await addList({
    name: "Off",
    sendMode: "off",
    gradeKeys: ["A Grade"],
    members: [{ name: "Off", email: "off@example.com" }],
  });
  await addList({
    name: "Year 7 Gold",
    section: "junior",
    gradeKeys: ["Year 7 Gold"],
    members: [
      { name: "Sam", email: "sam@example.com" },
      { name: "Parent", email: "parent@example.com" },
    ],
  });
});

afterAll(async () => {
  setEmailTransport(null);
  await purgeTestTenants([tenant, other]);
});

beforeEach(() => {
  sent.length = 0;
  failFor = null;
  vi.mocked(renderHtmlToPdf).mockClear();
});

describe("Email all", () => {
  it("is for this club's admins and captains, and needs a finalised side", async () => {
    await as(tenant, null)
      .post("/api/selection/email-all", { selectionIds: [sideA] })
      .expect(401);
    await as(tenant, cookie).post("/api/selection/email-all", { selectionIds: [] }).expect(400);
    await as(tenant, cookie)
      .post("/api/selection/email-all", { selectionIds: [draftSide] })
      .expect(409);
    // Another club's sides are not this club's to email.
    await as(other, otherCookie)
      .post("/api/selection/email-all", { selectionIds: [sideA, sideB] })
      .expect(409);
  });

  it("sends each contact one email with all their sheets in one PDF", async () => {
    const res = await as(tenant, cookie)
      .post("/api/selection/email-all", { selectionIds: [sideA, sideB, draftSide, sideJ] })
      .expect(200);
    expect(res.body).toEqual({ sides: 3 });
    expect(await drainOutbox({ tenantId: tenant })).toEqual({ sent: 1, failed: 0, skipped: 0 });

    // Sam: one senior email (A and B, two pages) and one junior email, never mixed.
    expect(to("sam@example.com")).toHaveLength(2);
    const samSenior = to("sam@example.com").find((m) => m.subject.includes("(2 sides)"))!;
    expect(samSenior.bcc).toEqual(["sam@example.com"]);
    expect(samSenior.attachments).toHaveLength(1);
    expect(samSenior.attachments?.[0]).toMatchObject({ contentType: "application/pdf" });
    expect(to("jo@example.com").map((m) => m.subject)).toEqual([
      expect.stringContaining("A Grade"),
    ]);
    expect(to("kim@example.com").map((m) => m.subject)).toEqual([
      expect.stringContaining("B Grade"),
    ]);
    // Contacts due the same sheets share one email; the junior sheet goes to the junior list.
    expect(to("parent@example.com")[0].bcc).toEqual(["sam@example.com", "parent@example.com"]);
    expect(to("off@example.com")).toEqual([]);
    expect(sent).toHaveLength(4);
    expect(pagesRendered().sort()).toEqual([1, 1, 1, 2]);

    const [row] = await batches();
    expect(row).toMatchObject({ listId: null, status: "sent", recipientCount: 5 });
    expect(JSON.stringify(row)).not.toContain("@example.com");
    const log = await as(tenant, cookie).get("/api/admin/email-sends").expect(200);
    expect(log.body[0]).toMatchObject({
      listId: null,
      listName: "Email all team sheets (3 sides)",
    });
  });

  it("a retry sends only the emails that failed", async () => {
    failFor = "kim@example.com";
    await as(tenant, cookie)
      .post("/api/selection/email-all", { selectionIds: [sideA, sideB] })
      .expect(200);
    expect(await drainOutbox({ tenantId: tenant })).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(sent).toHaveLength(2); // Sam (A+B) and Jo (A)
    sent.length = 0;
    failFor = null;
    expect(await drainOutbox({ tenantId: tenant })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent.map((m) => m.bcc)).toEqual([["kim@example.com"]]);
  });
});

describe("scheduled lists due together", () => {
  it("go out as one batch, so a contact on both gets one email, once per slot", async () => {
    // Thursday 18:00 Perth = Thursday 10:00 UTC.
    const schedule = { dow: 4, time: "18:00" };
    await addList({
      name: "Thu A",
      sendMode: "scheduled",
      schedule,
      gradeKeys: ["A Grade"],
      members: [{ name: "Lee", email: "lee@example.com" }],
    });
    await addList({
      name: "Thu B",
      sendMode: "scheduled",
      schedule,
      gradeKeys: ["B Grade"],
      members: [{ name: "Lee", email: "lee@example.com" }],
    });
    const at = (iso: string) => enqueueScheduledTeamSheets(new Date(iso), { tenantId: tenant });
    expect(await at("2034-10-05T10:20:00Z")).toBe(1);
    expect(await at("2034-10-05T10:50:00Z")).toBe(0);
    await drainOutbox({ tenantId: tenant });
    // Only the scheduled lists: Lee gets one email with both sheets; nobody else is sent to.
    expect(sent.map((m) => m.bcc)).toEqual([["lee@example.com"]]);
    expect(sent[0].subject).toContain("(2 sides)");
    expect(pagesRendered()).toEqual([2]);
  });
});
