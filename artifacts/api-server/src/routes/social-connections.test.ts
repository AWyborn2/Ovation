/**
 * Meta connect flow (plan 2026-10-06-001 U3): start → Meta callback → choose
 * Page → connected; disconnect; reconnect releasing held posts; Meta's
 * deauthorize and data-deletion callbacks. Real-DB integration test (needs
 * DATABASE_URL); Meta's Graph API is stubbed at the transport.
 */
import { createHmac, randomBytes } from "node:crypto";
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
  socialConnectionPendingTable,
  socialPublicationsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setGraphTransport, type GraphRequest } from "../lib/publishing/meta-client";
import { signToken } from "../lib/publishing/signed-token";
import { STATE_PURPOSE } from "./social-connections";

const STAMP = Date.now();
const APP_SECRET = "meta-app-secret-for-tests";
const USER_TOKEN = "EAAUserTokenShouldNeverBeStored123";
const PAGE_TOKEN = "EAAPageTokenForTheClubPage456";
const META_USER = `mu-${STAMP}`;

let tenantA: number;
let tenantB: number;
let adminA: number;
let adminB: number;
let cookieA: string;
let cookieB: string;
const saved = { ...process.env };

function stubMeta(
  pages: unknown[] = [
    {
      id: "page-1",
      name: "Club Page",
      access_token: PAGE_TOKEN,
      instagram_business_account: { id: "ig-1", username: "club_ig" },
    },
  ],
) {
  setGraphTransport(async (req: GraphRequest) => {
    const path = new URL(req.url).pathname.replace(/^\/v[\d.]+\//, "");
    if (path === "oauth/access_token") return { status: 200, json: { access_token: USER_TOKEN } };
    if (path === "me") return { status: 200, json: { id: META_USER } };
    if (path === "me/permissions") {
      return {
        status: 200,
        json: { data: [{ permission: "pages_manage_posts", status: "granted" }] },
      };
    }
    if (path === "me/accounts") return { status: 200, json: { data: pages } };
    return { status: 404, json: { error: { code: 100, message: "unexpected" } } };
  });
}

const api = (cookie: string, tenantId: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId)),
  post: (p: string, body: object = {}) =>
    request(app)
      .post(`/api${p}`)
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send(body),
  del: (p: string) =>
    request(app).delete(`/api${p}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId)),
});

/** Run start → callback for tenant A and return the completion token. */
async function connectThroughCallback(): Promise<string> {
  const start = await api(cookieA, tenantA).post("/social-connections/meta/start");
  expect(start.status).toBe(200);
  const state = new URL(start.body.url).searchParams.get("state")!;
  const cb = await request(app).get("/api/meta/oauth/callback").query({ state, code: "the-code" });
  expect(cb.status).toBe(303);
  const token = new URL(cb.headers.location).searchParams.get("meta_connect");
  expect(token).toBeTruthy();
  return token!;
}

function signedRequest(payload: object, secret = APP_SECRET): string {
  const b64 = (b: Buffer) =>
    b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return `${sig}.${body}`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-meta-connect";
  const [a] = await db
    .insert(tenantsTable)
    .values({ slug: `meta-a-${STAMP}`, centralClubId: 9931, name: "Meta A", plan: "pro" })
    .returning();
  const [b] = await db
    .insert(tenantsTable)
    .values({ slug: `meta-b-${STAMP}`, centralClubId: 9932, name: "Meta B", plan: "pro" })
    .returning();
  tenantA = a.id;
  tenantB = b.id;
  const [aa] = await db
    .insert(adminsTable)
    .values({ tenantId: tenantA, username: `meta_a_${STAMP}`, displayName: "A", passwordHash: "x" })
    .returning();
  const [bb] = await db
    .insert(adminsTable)
    .values({ tenantId: tenantB, username: `meta_b_${STAMP}`, displayName: "B", passwordHash: "x" })
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
  await db
    .delete(socialConnectionPendingTable)
    .where(inArray(socialConnectionPendingTable.tenantId, ids));
  await db.delete(adminsTable).where(inArray(adminsTable.id, [adminA, adminB]));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
});

beforeEach(async () => {
  process.env.META_PUBLISHING_ENABLED = "1";
  process.env.META_APP_ID = "123";
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_LOGIN_CONFIG_ID = "cfg-1";
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
  stubMeta();
  await db
    .delete(socialConnectionsTable)
    .where(inArray(socialConnectionsTable.tenantId, [tenantA, tenantB]));
  await db
    .delete(socialConnectionPendingTable)
    .where(inArray(socialConnectionPendingTable.tenantId, [tenantA, tenantB]));
});

afterEach(() => {
  setGraphTransport(null);
  process.env = { ...saved, SESSION_SECRET: process.env.SESSION_SECRET };
});

describe("Meta connect", () => {
  it("is closed while the kill switch is off, and to non-admins", async () => {
    process.env.META_PUBLISHING_ENABLED = "0";
    expect((await api(cookieA, tenantA).post("/social-connections/meta/start")).status).toBe(403);
    const status = await api(cookieA, tenantA).get("/social-connections/meta");
    expect(status.body).toMatchObject({ available: false, status: "not_connected" });
    const anon = await request(app)
      .post("/api/social-connections/meta/start")
      .set("x-tenant-id", String(tenantA))
      .send({});
    expect(anon.status).toBe(401);
  });

  it("returns Meta's dialog URL on the platform callback", async () => {
    const res = await api(cookieA, tenantA).post("/social-connections/meta/start");
    const url = new URL(res.body.url);
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("config_id")).toBe("cfg-1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://platform.test/api/meta/oauth/callback",
    );
  });

  it("connects the chosen Page and never stores the user token", async () => {
    const token = await connectThroughCallback();
    const pending = await api(cookieA, tenantA).get(
      `/social-connections/meta/pending?token=${token}`,
    );
    expect(pending.status).toBe(200);
    expect(pending.body.pages).toEqual([
      { pageId: "page-1", pageName: "Club Page", igUsername: "club_ig" },
    ]);
    expect(JSON.stringify(pending.body)).not.toContain(PAGE_TOKEN);

    const done = await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token,
      pageId: "page-1",
    });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      available: true,
      status: "connected",
      pageName: "Club Page",
      igUsername: "club_ig",
    });

    const [row] = await db
      .select()
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.tenantId, tenantA));
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(USER_TOKEN);
    expect(stored).not.toContain(PAGE_TOKEN);
    expect(row.metaUserId).toBe(META_USER);

    // The completion token is single-use.
    const again = await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token,
      pageId: "page-1",
    });
    expect(again.status).toBe(404);
  });

  it("asks before replacing an existing connection", async () => {
    await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token: await connectThroughCallback(),
      pageId: "page-1",
    });
    expect((await api(cookieA, tenantA).post("/social-connections/meta/start")).status).toBe(409);
    expect(
      (await api(cookieA, tenantA).post("/social-connections/meta/start", { replace: true }))
        .status,
    ).toBe(200);
  });

  it("connects Facebook only when the Page has no Instagram account", async () => {
    stubMeta([{ id: "page-2", name: "FB Only", access_token: PAGE_TOKEN }]);
    const res = await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token: await connectThroughCallback(),
      pageId: "page-2",
    });
    expect(res.body).toMatchObject({ status: "connected", pageName: "FB Only", igUsername: null });
  });

  it("rejects tampered or expired state and a removed admin", async () => {
    const bad = await request(app)
      .get("/api/meta/oauth/callback")
      .query({ state: "x.y", code: "c" });
    expect(bad.status).toBe(400);

    const expired = signToken(
      STATE_PURPOSE,
      { t: tenantA, a: adminA, r: "http://x.test/a", n: "n" },
      -1,
    );
    expect(
      (await request(app).get("/api/meta/oauth/callback").query({ state: expired, code: "c" }))
        .status,
    ).toBe(400);

    const wrongAdmin = signToken(
      STATE_PURPOSE,
      { t: tenantA, a: adminB, r: "http://x.test/a", n: "n" },
      60_000,
    );
    const res = await request(app)
      .get("/api/meta/oauth/callback")
      .query({ state: wrongAdmin, code: "c" });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain("meta_error=not_allowed");
    const pending = await db
      .select()
      .from(socialConnectionPendingTable)
      .where(eq(socialConnectionPendingTable.tenantId, tenantA));
    expect(pending).toHaveLength(0);
  });

  it("never lets another club's admin pick up the Pages", async () => {
    const token = await connectThroughCallback();
    expect(
      (await api(cookieB, tenantB).get(`/social-connections/meta/pending?token=${token}`)).status,
    ).toBe(404);
    expect(
      (
        await api(cookieB, tenantB).post("/social-connections/meta/complete", {
          token,
          pageId: "page-1",
        })
      ).status,
    ).toBe(404);
  });

  it("disconnect cancels scheduled and held posts (and reconnect resumes fresh held ones)", async () => {
    await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token: await connectThroughCallback(),
      pageId: "page-1",
    });
    const [draft] = await db
      .insert(socialDraftsTable)
      .values({ tenantId: tenantA, engine: "adhoc", status: "ready", cardInput: {} })
      .returning();
    const now = Date.now();
    const pubs = await db
      .insert(socialPublicationsTable)
      .values([
        {
          tenantId: tenantA,
          draftId: draft.id,
          platform: "facebook",
          status: "held",
          scheduledFor: new Date(now - 60_000),
          nextAttemptAt: new Date(now - 60_000),
        },
        {
          tenantId: tenantA,
          draftId: draft.id,
          platform: "instagram",
          status: "held",
          scheduledFor: new Date(now - 3 * 24 * 3_600_000),
          nextAttemptAt: new Date(now - 3 * 24 * 3_600_000),
        },
      ])
      .returning();

    // Covers AE4 (release half): reconnecting the same Page resumes the fresh one.
    await db
      .update(socialConnectionsTable)
      .set({ status: "needs_reconnect" })
      .where(eq(socialConnectionsTable.tenantId, tenantA));
    await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token: await connectThroughCallback(),
      pageId: "page-1",
    });
    const after = await db
      .select()
      .from(socialPublicationsTable)
      .where(
        inArray(
          socialPublicationsTable.id,
          pubs.map((p) => p.id),
        ),
      );
    const byPlatform = Object.fromEntries(after.map((p) => [p.platform, p.status]));
    expect(byPlatform).toEqual({ facebook: "scheduled", instagram: "cancelled" });

    const off = await api(cookieA, tenantA).del("/social-connections/meta");
    expect(off.body.status).toBe("disconnected");
    const [fb] = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.id, pubs[0].id));
    expect(fb.status).toBe("cancelled");
    const [row] = await db
      .select()
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.tenantId, tenantA));
    expect(row.pageToken).toBeNull();
  });
});

describe("Meta app callbacks", () => {
  it("data deletion clears the token and returns an opaque code", async () => {
    await api(cookieA, tenantA).post("/social-connections/meta/complete", {
      token: await connectThroughCallback(),
      pageId: "page-1",
    });
    const res = await request(app)
      .post("/api/meta/data-deletion")
      .type("form")
      .send({
        signed_request: signedRequest({
          algorithm: "HMAC-SHA256",
          issued_at: Math.floor(Date.now() / 1000),
          user_id: META_USER,
        }),
      });
    expect(res.status).toBe(200);
    expect(res.body.confirmation_code).toMatch(/^[a-f0-9]{32}$/);
    expect(res.body.url).toBe(
      `https://platform.test/api/meta/data-deletion/${res.body.confirmation_code}`,
    );
    const [row] = await db
      .select()
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.tenantId, tenantA));
    expect(row).toMatchObject({ status: "disconnected", pageToken: null });

    const status = await request(app).get(`/api/meta/data-deletion/${res.body.confirmation_code}`);
    expect(status.body.status).toBe("completed");
  });

  it("refuses a bad signature, a wrong algorithm and a stale request", async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases = [
      signedRequest({ algorithm: "HMAC-SHA256", issued_at: now, user_id: META_USER }, "wrong"),
      signedRequest({ algorithm: "none", issued_at: now, user_id: META_USER }),
      signedRequest({ algorithm: "HMAC-SHA256", issued_at: now - 3 * 86400, user_id: META_USER }),
    ];
    for (const sr of cases) {
      const res = await request(app)
        .post("/api/meta/deauthorize")
        .type("form")
        .send({ signed_request: sr });
      expect(res.status).toBe(400);
    }
  });
});
