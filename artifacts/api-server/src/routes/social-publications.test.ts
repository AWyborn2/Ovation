/**
 * The officer's publishing controls (plan 2026-10-06-001 U5): schedule,
 * reschedule, cancel, retry, the draft transitions that cancel posts, and the
 * per-platform view on draft responses. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialDraftsTable,
  socialConnectionsTable,
  socialPublicationsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { seal } from "../lib/secret-box";
import { clubTimeToUtc } from "../lib/round-schedules";

const STAMP = Date.now();
const saved = { ...process.env };
let tenantA: number;
let tenantB: number;
let adminA: number;
let adminB: number;
let cookieA: string;
let cookieB: string;

const as = (cookie: string, tenantId: number) => ({
  post: (p: string, body: object = {}) =>
    request(app)
      .post(`/api${p}`)
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send(body),
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId)),
});
const A = () => as(cookieA, tenantA);

async function readyDraft(status = "ready") {
  const [d] = await db
    .insert(socialDraftsTable)
    .values({ tenantId: tenantA, engine: "milestone", status, cardInput: { kind: "milestone" } })
    .returning();
  return d;
}

async function connect(igUserId: string | null = "ig-1") {
  await db
    .insert(socialConnectionsTable)
    .values({
      tenantId: tenantA,
      status: "connected",
      pageId: "page-1",
      pageName: "Club",
      igUserId,
      pageToken: seal("EAAPageToken123456789"),
    })
    .onConflictDoUpdate({
      target: [socialConnectionsTable.tenantId, socialConnectionsTable.provider],
      set: { status: "connected", igUserId, pageToken: seal("EAAPageToken123456789") },
    });
}

/** A club-local time string `hours` from now. */
function clubTimeIn(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000 + 8 * 3_600_000); // Perth = UTC+8
  return d.toISOString().slice(0, 16);
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-publications";
  const [a] = await db
    .insert(tenantsTable)
    .values({ slug: `pub-a-${STAMP}`, centralClubId: 9951, name: "Pub A", plan: "pro" })
    .returning();
  const [b] = await db
    .insert(tenantsTable)
    .values({ slug: `pub-b-${STAMP}`, centralClubId: 9952, name: "Pub B", plan: "pro" })
    .returning();
  tenantA = a.id;
  tenantB = b.id;
  const [aa] = await db
    .insert(adminsTable)
    .values({ tenantId: tenantA, username: `pub_a_${STAMP}`, displayName: "A", passwordHash: "x" })
    .returning();
  const [bb] = await db
    .insert(adminsTable)
    .values({ tenantId: tenantB, username: `pub_b_${STAMP}`, displayName: "B", passwordHash: "x" })
    .returning();
  adminA = aa.id;
  adminB = bb.id;
  cookieA = `${SESSION_COOKIE}=${encodeSession({ adminId: adminA, issuedAt: Date.now() })}`;
  cookieB = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  const ids = [tenantA, tenantB];
  await db.delete(socialPublicationsTable).where(inArray(socialPublicationsTable.tenantId, ids));
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, ids));
  await db.delete(socialConnectionsTable).where(inArray(socialConnectionsTable.tenantId, ids));
  await db.delete(adminsTable).where(inArray(adminsTable.id, [adminA, adminB]));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
});

beforeEach(async () => {
  process.env.META_PUBLISHING_ENABLED = "1";
  process.env.SOCIAL_TOKEN_KEY = process.env.SOCIAL_TOKEN_KEY ?? randomBytes(32).toString("base64");
  await connect();
});

afterEach(() => {
  process.env = {
    ...saved,
    SESSION_SECRET: process.env.SESSION_SECRET,
    SOCIAL_TOKEN_KEY: process.env.SOCIAL_TOKEN_KEY,
  };
});

describe("clubTimeToUtc", () => {
  it("reads Perth wall-clock time", () => {
    expect(clubTimeToUtc("2026-10-10T19:00")?.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(clubTimeToUtc("2026-02-30T19:00")).toBeNull();
    expect(clubTimeToUtc("tomorrow")).toBeNull();
  });
});

describe("scheduling", () => {
  it("schedules a ready draft to both platforms as a feed post by default", async () => {
    const d = await readyDraft();
    const at = clubTimeIn(5);
    const res = await A().post(`/social-drafts/${d.id}/publications`, { at });
    expect(res.status).toBe(200);
    expect(res.body.map((p: { platform: string }) => p.platform).sort()).toEqual([
      "facebook",
      "instagram",
    ]);
    expect(res.body[0]).toMatchObject({ postType: "feed", status: "scheduled", origin: "manual" });
    expect(res.body[0].scheduledFor).toBe(clubTimeToUtc(at)!.toISOString());
  });

  it("Covers AE9: feed and story to both platforms makes four posts", async () => {
    const d = await readyDraft();
    const res = await A().post(`/social-drafts/${d.id}/publications`, {
      postTypes: ["feed", "story"],
    });
    expect(res.body).toHaveLength(4);
  });

  it("refuses a draft that isn't ready, a missing connection, and a past time", async () => {
    const waiting = await readyDraft("awaiting_review");
    expect((await A().post(`/social-drafts/${waiting.id}/publications`)).status).toBe(409);

    const d = await readyDraft();
    expect(
      (await A().post(`/social-drafts/${d.id}/publications`, { at: clubTimeIn(-3) })).status,
    ).toBe(400);
    expect((await A().post(`/social-drafts/${d.id}/publications`, { at: "soon" })).status).toBe(
      400,
    );

    await db
      .update(socialConnectionsTable)
      .set({ status: "needs_reconnect" })
      .where(eq(socialConnectionsTable.tenantId, tenantA));
    const res = await A().post(`/social-drafts/${d.id}/publications`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Connect/);
  });

  it("sends only Facebook when Instagram is unticked, and refuses Instagram without an account", async () => {
    const d = await readyDraft();
    const res = await A().post(`/social-drafts/${d.id}/publications`, { platforms: ["facebook"] });
    expect(res.body.map((p: { platform: string }) => p.platform)).toEqual(["facebook"]);

    await connect(null);
    const d2 = await readyDraft();
    expect(
      (await A().post(`/social-drafts/${d2.id}/publications`, { platforms: ["instagram"] })).status,
    ).toBe(409);
  });

  it("won't schedule the same post twice", async () => {
    const d = await readyDraft();
    await A().post(`/social-drafts/${d.id}/publications`, { platforms: ["facebook"] });
    const again = await A().post(`/social-drafts/${d.id}/publications`, {
      platforms: ["facebook"],
    });
    expect(again.status).toBe(409);
  });

  it("reschedules and cancels a scheduled post, but not one that is publishing", async () => {
    const d = await readyDraft();
    const [pub] = (
      await A().post(`/social-drafts/${d.id}/publications`, { platforms: ["facebook"] })
    ).body;
    const moved = await A().post(`/social-publications/${pub.id}/reschedule`, {
      at: clubTimeIn(10),
    });
    expect(moved.status).toBe(200);
    expect(new Date(moved.body.scheduledFor).getTime()).toBeGreaterThan(Date.now() + 9 * 3_600_000);

    await db
      .update(socialPublicationsTable)
      .set({ status: "publishing" })
      .where(eq(socialPublicationsTable.id, pub.id));
    expect((await A().post(`/social-publications/${pub.id}/cancel`)).status).toBe(409);
    await db
      .update(socialPublicationsTable)
      .set({ status: "scheduled" })
      .where(eq(socialPublicationsTable.id, pub.id));
    const cancelled = await A().post(`/social-publications/${pub.id}/cancel`);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("retries a failed Instagram post without touching the published Facebook one", async () => {
    const d = await readyDraft();
    const rows = (await A().post(`/social-drafts/${d.id}/publications`)).body as {
      id: number;
      platform: string;
    }[];
    const fb = rows.find((r) => r.platform === "facebook")!;
    const ig = rows.find((r) => r.platform === "instagram")!;
    await db
      .update(socialPublicationsTable)
      .set({ status: "published" })
      .where(eq(socialPublicationsTable.id, fb.id));
    await db
      .update(socialPublicationsTable)
      .set({ status: "failed", attempts: 4, lastError: "Instagram said no" })
      .where(eq(socialPublicationsTable.id, ig.id));

    // Covers R18: published + failed for good reads as needing attention.
    const list = await A().get("/social-drafts?status=ready");
    const view = list.body.find((x: { id: number }) => x.id === d.id);
    expect(view.needsAttention).toBe(true);
    expect(view.publications).toHaveLength(2);

    const retried = await A().post(`/social-publications/${ig.id}/retry`);
    expect(retried.body).toMatchObject({ status: "scheduled", attempts: 0, lastError: null });
    const [stillFb] = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.id, fb.id));
    expect(stillFb.status).toBe("published");
    expect((await A().post(`/social-publications/${fb.id}/retry`)).status).toBe(409);
  });

  it("Covers R18: Mark posted clears a failed post and posts the draft", async () => {
    const d = await readyDraft();
    const rows = (await A().post(`/social-drafts/${d.id}/publications`)).body as { id: number }[];
    await db
      .update(socialPublicationsTable)
      .set({ status: "failed" })
      .where(eq(socialPublicationsTable.id, rows[0].id));
    const posted = await A().post(`/social-drafts/${d.id}/posted`);
    expect(posted.body.status).toBe("posted");
    const after = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.draftId, d.id));
    expect(after.every((p) => p.status === "cancelled")).toBe(true);
  });

  it("Covers R13: dismissing or sending back cancels scheduled and held posts", async () => {
    const d = await readyDraft();
    const rows = (await A().post(`/social-drafts/${d.id}/publications`)).body as { id: number }[];
    await db
      .update(socialPublicationsTable)
      .set({ status: "held" })
      .where(eq(socialPublicationsTable.id, rows[0].id));
    await A().post(`/social-drafts/${d.id}/send-back`);
    let after = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.draftId, d.id));
    expect(after.map((p) => p.status)).toEqual(["cancelled", "cancelled"]);

    const d2 = await readyDraft();
    await A().post(`/social-drafts/${d2.id}/publications`);
    await A().post(`/social-drafts/${d2.id}/dismiss`);
    after = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.draftId, d2.id));
    expect(after.every((p) => p.status === "cancelled")).toBe(true);
  });

  it("keeps clubs apart", async () => {
    const d = await readyDraft();
    const [pub] = (await A().post(`/social-drafts/${d.id}/publications`)).body;
    const B = as(cookieB, tenantB);
    expect((await B.post(`/social-drafts/${d.id}/publications`)).status).toBe(404);
    expect((await B.post(`/social-publications/${pub.id}/cancel`)).status).toBe(404);
    expect((await B.post(`/social-publications/${pub.id}/retry`)).status).toBe(404);
  });
});
