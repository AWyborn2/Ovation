// A club's own Figma connection and import (template library release 2, ADR-012, R2-E, TE.6).
//
// Real database; no Figma. Every call Figma would get goes through `setFigmaHttp`, which answers
// `/v1/me`, the OAuth token and refresh endpoints and the file reads from the recorded L8-A
// fixture. The tests read what a club sees and what is stored: the token never comes back in a
// response or a log line, one club never sees or uses another's connection, the signed state and
// its nonce can't be forged or replayed, a failed refresh asks for a reconnect, and disconnecting
// deletes the sealed tokens.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { symbols } from "pino";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  figmaConnectionPendingTable,
  figmaConnectionsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { logger } from "../lib/logger";
import { signToken } from "../lib/publishing/signed-token";
import { open } from "../lib/secret-box";
import { RECONNECT_REASONS, setFigmaHttp, type FigmaHttp } from "../lib/figma-connection/store";
import { setFigmaImportDeps } from "../lib/template-import/figma-import";
import type { FigmaNode, FigmaNodesResponse } from "../lib/template-import/figma-types";

const STAMP = Date.now();
const KEY = "AbCdEfGhIjKlMnOp";
const PAT = `figd_pasted-${STAMP}-secret-value`;
const OAUTH_ACCESS = `figu_access-${STAMP}-secret`;
const OAUTH_REFRESH = `figur_refresh-${STAMP}-secret`;
const REFRESHED_ACCESS = `figu_refreshed-${STAMP}-secret`;
const SECRETS = [PAT, OAUTH_ACCESS, OAUTH_REFRESH, REFRESHED_ACCESS];

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../lib/template-import/__fixtures__/figma-century.json", import.meta.url),
    "utf8",
  ),
) as FigmaNodesResponse;
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 2" fill="none"><path d="M0 0h10v2z" fill="#E11D48"/></svg>';

let tenantId: number;
let otherTenantId: number;
let adminId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;

async function makeAdmin(tenant: number, name: string): Promise<{ id: number; cookie: string }> {
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant,
      username: `${name}_${STAMP}`,
      displayName: name,
      passwordHash: "x",
    })
    .returning();
  adminIds.push(admin!.id);
  return {
    id: admin!.id,
    cookie: `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`,
  };
}

const as = (c: string, tenant: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
  del: (p: string) =>
    request(app).delete(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
});
const club = () => as(cookie, tenantId);
const other = () => as(otherCookie, otherTenantId);

// ── A recorded Figma ─────────────────────────────────────────────────────────

type Seen = { url: string; method: string; headers: Record<string, string>; body?: string };
let seen: Seen[] = [];
/** Override one endpoint's answer: [status, body]. */
let answers: Record<string, [number, unknown]> = {};

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

const figma: FigmaHttp = async (url, init) => {
  seen.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body });
  const path = new URL(url).pathname;
  const over = answers[path];
  if (over) return json(over[0], over[1]);
  if (path === "/v1/me") return json(200, { id: "fig-user-1", handle: "Club Designer" });
  if (path === "/v1/oauth/token") {
    return json(200, {
      access_token: OAUTH_ACCESS,
      refresh_token: OAUTH_REFRESH,
      expires_in: 7776000,
    });
  }
  if (path === "/v1/oauth/refresh")
    return json(200, { access_token: REFRESHED_ACCESS, expires_in: 7776000 });
  if (path === `/v1/files/${KEY}`) {
    const frames: FigmaNode[] = Object.values(FIXTURE.nodes).map((e) => e!.document);
    return json(200, {
      name: FIXTURE.name,
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [{ id: "0:1", name: "Page 1", type: "CANVAS", children: frames }],
      },
    });
  }
  if (path === `/v1/files/${KEY}/nodes`) return json(200, FIXTURE);
  if (path === `/v1/images/${KEY}`) {
    const q = new URL(url).searchParams;
    const ids = (q.get("ids") ?? "").split(",");
    return json(200, {
      images: Object.fromEntries(
        ids.map((id) => [id, `https://renders.example/${q.get("format")}/${id}`]),
      ),
    });
  }
  return json(404, { err: "Not found" });
};

/** Every line the server logs while `fn` runs (pino's shared destination). */
async function logsDuring(fn: () => Promise<unknown>): Promise<string> {
  const stream = (logger as unknown as Record<symbol, { write(s: string): boolean }>)[
    symbols.streamSym
  ]!;
  const lines: string[] = [];
  const spy = vi.spyOn(stream, "write").mockImplementation((s: string) => {
    lines.push(String(s));
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

const expectNoSecret = (text: string) => {
  for (const s of SECRETS) expect(text).not.toContain(s);
};

const row = async (tenant: number) =>
  (
    await db.select().from(figmaConnectionsTable).where(eq(figmaConnectionsTable.tenantId, tenant))
  )[0];

async function connectWithToken(c = club()) {
  const res = await c.post("/figma-connection/token", { token: PAT });
  expect(res.status).toBe(200);
  return res;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-figma-connection";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `figma-conn-${STAMP}`,
      centralClubId: 4_000_000 + (STAMP % 100_000) * 2,
      name: "Figma Club",
      plan: "pro",
    })
    .returning();
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `figma-conn-other-${STAMP}`,
      centralClubId: 4_000_001 + (STAMP % 100_000) * 2,
      name: "Other Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  otherTenantId = o!.id;
  const a = await makeAdmin(tenantId, "FigmaAdmin");
  adminId = a.id;
  cookie = a.cookie;
  otherCookie = (await makeAdmin(otherTenantId, "FigmaOutsider")).cookie;
});

beforeEach(() => {
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  delete process.env.FIGMA_CLIENT_ID;
  delete process.env.FIGMA_CLIENT_SECRET;
  seen = [];
  answers = {};
  setFigmaHttp(figma);
  setFigmaImportDeps({
    download: async (url) => (url.includes("/svg/") ? Buffer.from(SVG) : null),
  } as Parameters<typeof setFigmaImportDeps>[0]);
});

afterEach(async () => {
  setFigmaHttp(null);
  setFigmaImportDeps(null);
  await db
    .delete(figmaConnectionsTable)
    .where(inArray(figmaConnectionsTable.tenantId, [tenantId, otherTenantId]));
  await db
    .delete(figmaConnectionPendingTable)
    .where(inArray(figmaConnectionPendingTable.tenantId, [tenantId, otherTenantId]));
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  delete process.env.FIGMA_CLIENT_ID;
  delete process.env.FIGMA_CLIENT_SECRET;
});

// ── Pasted token ─────────────────────────────────────────────────────────────

describe("Figma connection: a pasted token", () => {
  it("needs an admin", async () => {
    expect((await request(app).get("/api/figma-connection")).status).toBe(401);
    expect(
      (await request(app).post("/api/figma-connection/token").send({ token: PAT })).status,
    ).toBe(401);
  });

  it("starts unconnected, with Sign in with Figma hidden without a client id", async () => {
    const res = await club().get("/figma-connection");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connected: false,
      method: null,
      status: null,
      figmaHandle: null,
      statusReason: null,
      connectedAt: null,
      oauthAvailable: false,
    });
  });

  it("checks the token with Figma, stores it sealed, and never returns or logs it", async () => {
    let res!: request.Response;
    const logs = await logsDuring(async () => {
      res = await connectWithToken();
    });
    expect(res.body).toMatchObject({
      connected: true,
      method: "token",
      status: "connected",
      figmaHandle: "Club Designer",
    });
    expectNoSecret(JSON.stringify(res.body));
    expectNoSecret(JSON.stringify(res.headers));
    expect(logs.length).toBeGreaterThan(0);
    expectNoSecret(logs);
    // Checked with `/v1/me` on the personal-token header.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://api.figma.com/v1/me");
    expect(seen[0]!.headers).toEqual({ "X-Figma-Token": PAT });

    const stored = await row(tenantId);
    expect(stored!.figmaUserId).toBe("fig-user-1");
    expect(JSON.stringify(stored)).not.toContain(PAT);
    expect(open(stored!.accessToken)).toBe(PAT);
    expect(stored!.refreshToken).toBeNull();

    const read = await club().get("/figma-connection");
    expectNoSecret(JSON.stringify(read.body));
    expect(read.body.connected).toBe(true);
  });

  it("stores nothing when Figma refuses the token, and doesn't echo it", async () => {
    answers["/v1/me"] = [403, { err: "Invalid token" }];
    let res!: request.Response;
    const logs = await logsDuring(async () => {
      res = await club().post("/figma-connection/token", { token: PAT });
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Figma refused that token/);
    expectNoSecret(JSON.stringify(res.body));
    expectNoSecret(logs);
    expect(await row(tenantId)).toBeUndefined();
  });

  it("doesn't echo a malformed body", async () => {
    const res = await club().post("/figma-connection/token", { token: "short" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("short");
  });

  it("refuses to store a token when no sealing key is set", async () => {
    delete process.env.SOCIAL_TOKEN_KEY;
    const res = await club().post("/figma-connection/token", { token: PAT });
    expect(res.status).toBe(503);
    expect(await row(tenantId)).toBeUndefined();
    expect(seen).toHaveLength(0);
  });
});

// ── Isolation ────────────────────────────────────────────────────────────────

describe("Figma connection: one club's connection is its own", () => {
  it("another club neither sees nor uses it, and can't disconnect it", async () => {
    await connectWithToken();
    expect((await other().get("/figma-connection")).body.connected).toBe(false);

    seen = [];
    const imp = await other().post("/club-templates/import/figma", {
      fileUrl: KEY,
      kind: "century",
    });
    expect(imp.status).toBe(409);
    expect(imp.body.error).toMatch(/Connect Figma/);
    expect(seen).toHaveLength(0);

    expect((await other().del("/figma-connection")).status).toBe(204);
    expect(await row(tenantId)).toBeTruthy();
    expect((await club().get("/figma-connection")).body.connected).toBe(true);
  });
});

// ── Import ───────────────────────────────────────────────────────────────────

describe("Figma import into a club template", () => {
  it("needs a connection first", async () => {
    const res = await club().post("/club-templates/import/figma", {
      fileUrl: KEY,
      kind: "century",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Connect Figma in Social Studio settings/);
  });

  it("maps the frame with the club's token into a private club template", async () => {
    await connectWithToken();
    seen = [];
    let res!: request.Response;
    const logs = await logsDuring(async () => {
      res = await club().post("/club-templates/import/figma", {
        fileUrl: KEY,
        kind: "century",
        name: "Our century",
      });
    });
    expect(res.status).toBe(201);
    expect(res.body.template).toMatchObject({ name: "Our century", kind: "century" });
    expect(res.body.report.length).toBeGreaterThan(0);
    expect(res.body.frames.map((f: { size: string }) => f.size)).toEqual(["square", "story"]);
    expectNoSecret(JSON.stringify(res.body));
    expectNoSecret(logs);
    // Every Figma read went out on the club's own token.
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.headers).toEqual({ "X-Figma-Token": PAT });

    const [saved] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, res.body.template.id));
    expect(saved).toMatchObject({
      tenantId,
      source: "kind",
      baseKind: "century",
      isKindDefault: false,
      originTemplateId: null,
    });

    // The other club doesn't get it.
    const theirs = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.tenantId, otherTenantId));
    expect(theirs.find((t) => t.id === saved!.id)).toBeUndefined();
  });

  it("marks the connection for reconnecting when Figma refuses the stored token", async () => {
    await connectWithToken();
    answers[`/v1/files/${KEY}`] = [403, { err: "Token expired" }];
    const res = await club().post("/club-templates/import/figma", {
      fileUrl: KEY,
      kind: "century",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(RECONNECT_REASONS.refused);
    const read = await club().get("/figma-connection");
    expect(read.body).toMatchObject({
      connected: false,
      status: "needs_reconnect",
      statusReason: RECONNECT_REASONS.refused,
    });
    // Until reconnected, imports stop before Figma.
    seen = [];
    answers = {};
    expect(
      (await club().post("/club-templates/import/figma", { fileUrl: KEY, kind: "century" })).status,
    ).toBe(409);
    expect(seen).toHaveLength(0);
  });

  it("refuses a kind that doesn't exist", async () => {
    await connectWithToken();
    const res = await club().post("/club-templates/import/figma", { fileUrl: KEY, kind: "nope" });
    expect(res.status).toBe(400);
  });
});

// ── Sign in with Figma ───────────────────────────────────────────────────────

const enableOAuth = () => {
  process.env.FIGMA_CLIENT_ID = "client-id-123";
  process.env.FIGMA_CLIENT_SECRET = "client-secret-456";
};

async function startSignIn(): Promise<{ state: string; url: URL }> {
  const res = await club().post("/figma-connection/oauth/start");
  expect(res.status).toBe(200);
  const url = new URL(res.body.url);
  return { state: url.searchParams.get("state")!, url };
}

const callback = (query: Record<string, string>) =>
  request(app).get(`/api/figma/oauth/callback?${new URLSearchParams(query).toString()}`);

describe("Sign in with Figma", () => {
  it("is unavailable without a client id", async () => {
    const res = await club().post("/figma-connection/oauth/start");
    expect(res.status).toBe(503);
    expect(
      await db
        .select()
        .from(figmaConnectionPendingTable)
        .where(eq(figmaConnectionPendingTable.tenantId, tenantId)),
    ).toHaveLength(0);
  });

  it("starts with signed state, PKCE and the narrowest scopes", async () => {
    enableOAuth();
    expect((await club().get("/figma-connection")).body.oauthAvailable).toBe(true);
    const { url, state } = await startSignIn();
    expect(url.origin + url.pathname).toBe("https://www.figma.com/oauth");
    expect(url.searchParams.get("client_id")).toBe("client-id-123");
    expect(url.searchParams.get("scope")).toBe("current_user:read,file_content:read");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/figma\/oauth\/callback$/);
    expect(state).toBeTruthy();
    expect(url.toString()).not.toContain("client-secret-456");
  });

  it("returns to the club host the admin is on, not the platform host behind the proxy", async () => {
    enableOAuth();
    const clubHost = `figma-conn-${STAMP}.ovationcc.app`;
    const startFrom = (headers: Record<string, string>) => {
      let req = request(app)
        .post("/api/figma-connection/oauth/start")
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantId))
        .set("Host", "ovation-api.internal");
      for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
      return req;
    };
    const returnOf = (res: request.Response) => {
      const state = new URL(res.body.url).searchParams.get("state")!;
      return JSON.parse(Buffer.from(state.split(".")[0]!, "base64url").toString("utf8")).r;
    };

    // Replit's edge: the public host arrives in X-Forwarded-Host.
    const viaEdge = await startFrom({ "X-Forwarded-Host": clubHost });
    expect(viaEdge.status).toBe(200);
    expect(returnOf(viaEdge)).toBe(`https://${clubHost}/admin/social/cards#figma`);

    // The tenant-domain Worker: X-Ovation-Host with the shared key.
    process.env.PROXY_SHARED_SECRET = "figma-test-proxy-secret";
    try {
      const viaWorker = await startFrom({
        "X-Ovation-Host": clubHost,
        "X-Ovation-Proxy-Key": "figma-test-proxy-secret",
      });
      expect(viaWorker.status).toBe(200);
      expect(returnOf(viaWorker)).toBe(`https://${clubHost}/admin/social/cards#figma`);
    } finally {
      delete process.env.PROXY_SHARED_SECRET;
    }

    // A direct request keeps its own scheme and port.
    const direct = await club().post("/figma-connection/oauth/start");
    expect(returnOf(direct)).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/admin\/social\/cards#figma$/);
  });

  it("exchanges the code, stores both tokens sealed, and returns to settings", async () => {
    enableOAuth();
    const { state } = await startSignIn();
    let res!: request.Response;
    const logs = await logsDuring(async () => {
      res = await callback({ code: "the-code", state });
    });
    expect(res.status).toBe(302);
    const back = new URL(res.headers.location!);
    expect(back.pathname).toBe("/admin/social/cards");
    expect(back.hash).toBe("#figma");
    expect(back.searchParams.get("figma")).toBe("connected");
    expectNoSecret(res.headers.location!);
    expectNoSecret(logs);

    const exchange = seen.find((s) => s.url.endsWith("/v1/oauth/token"))!;
    expect(exchange.method).toBe("POST");
    expect(exchange.headers.Authorization).toBe(
      `Basic ${Buffer.from("client-id-123:client-secret-456").toString("base64")}`,
    );
    const form = new URLSearchParams(exchange.body);
    expect(form.get("code")).toBe("the-code");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code_verifier")).toBeTruthy();
    // Who signed in, on the Bearer header.
    expect(seen.find((s) => s.url.endsWith("/v1/me"))!.headers).toEqual({
      Authorization: `Bearer ${OAUTH_ACCESS}`,
    });

    const stored = await row(tenantId);
    expect(stored).toMatchObject({
      method: "oauth",
      status: "connected",
      connectedByAdminId: adminId,
    });
    expect(JSON.stringify(stored)).not.toContain(OAUTH_ACCESS);
    expect(JSON.stringify(stored)).not.toContain(OAUTH_REFRESH);
    expect(open(stored!.accessToken)).toBe(OAUTH_ACCESS);
    expect(open(stored!.refreshToken!)).toBe(OAUTH_REFRESH);
    expect(stored!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 80 * 24 * 3600 * 1000);
    const read = await club().get("/figma-connection");
    expect(read.body).toMatchObject({ connected: true, method: "oauth" });
    expectNoSecret(JSON.stringify(read.body));
  });

  it("uses the nonce once: a replayed callback stores nothing", async () => {
    enableOAuth();
    const { state } = await startSignIn();
    expect((await callback({ code: "c1", state })).status).toBe(302);
    await db.delete(figmaConnectionsTable).where(eq(figmaConnectionsTable.tenantId, tenantId));
    seen = [];
    const replay = await callback({ code: "c2", state });
    expect(new URL(replay.headers.location!).searchParams.get("figma_error")).toBe("expired");
    expect(seen).toHaveLength(0);
    expect(await row(tenantId)).toBeUndefined();
  });

  it("refuses tampered, foreign-signed and expired state", async () => {
    enableOAuth();
    const { state } = await startSignIn();
    const [body, sig] = state.split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    forged.t = otherTenantId;
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect((await callback({ code: "c", state: tampered })).status).toBe(400);
    // Signed for a different purpose (another feature's token) is not a Figma state.
    const wrongPurpose = signToken(
      "meta-oauth-state",
      JSON.parse(Buffer.from(body!, "base64url").toString("utf8")),
      60_000,
    );
    expect((await callback({ code: "c", state: wrongPurpose })).status).toBe(400);
    expect((await callback({ code: "c" })).status).toBe(400);
    expect(seen).toHaveLength(0);

    // A well-signed state whose pending sign-in has expired.
    await db
      .update(figmaConnectionPendingTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(figmaConnectionPendingTable.tenantId, tenantId));
    const late = await callback({ code: "c", state });
    expect(new URL(late.headers.location!).searchParams.get("figma_error")).toBe("expired");
    expect(seen).toHaveLength(0);
    expect(await row(tenantId)).toBeUndefined();
    expect(await row(otherTenantId)).toBeUndefined();
  });

  it("a newer sign-in replaces an older one", async () => {
    enableOAuth();
    const first = await startSignIn();
    const second = await startSignIn();
    const old = await callback({ code: "c", state: first.state });
    expect(new URL(old.headers.location!).searchParams.get("figma_error")).toBe("expired");
    const now = await callback({ code: "c", state: second.state });
    expect(new URL(now.headers.location!).searchParams.get("figma")).toBe("connected");
  });

  it("goes back with an error when the admin cancels or Figma refuses the code", async () => {
    enableOAuth();
    const a = await startSignIn();
    const cancelled = await callback({ error: "access_denied", state: a.state });
    expect(new URL(cancelled.headers.location!).searchParams.get("figma_error")).toBe("cancelled");

    const b = await startSignIn();
    answers["/v1/oauth/token"] = [400, { error: "invalid_grant" }];
    const refused = await callback({ code: "bad", state: b.state });
    expect(new URL(refused.headers.location!).searchParams.get("figma_error")).toBe("login_failed");
    expect(await row(tenantId)).toBeUndefined();
  });
});

// ── Refresh ──────────────────────────────────────────────────────────────────

describe("Sign in with Figma: refresh", () => {
  async function connectOAuth(expiresInMs: number) {
    enableOAuth();
    const { state } = await startSignIn();
    await callback({ code: "c", state });
    await db
      .update(figmaConnectionsTable)
      .set({ expiresAt: new Date(Date.now() + expiresInMs) })
      .where(eq(figmaConnectionsTable.tenantId, tenantId));
    seen = [];
  }

  it("refreshes a token within 5 minutes of expiry before calling Figma", async () => {
    await connectOAuth(60_000);
    let res!: request.Response;
    const logs = await logsDuring(async () => {
      res = await club().post("/club-templates/import/figma", { fileUrl: KEY, kind: "century" });
    });
    expect(res.status).toBe(201);
    expectNoSecret(JSON.stringify(res.body));
    expectNoSecret(logs);
    expect(seen[0]!.url).toBe("https://api.figma.com/v1/oauth/refresh");
    expect(new URLSearchParams(seen[0]!.body).get("refresh_token")).toBe(OAUTH_REFRESH);
    for (const s of seen.slice(1)) {
      expect(s.headers).toEqual({ Authorization: `Bearer ${REFRESHED_ACCESS}` });
    }
    const stored = await row(tenantId);
    expect(open(stored!.accessToken)).toBe(REFRESHED_ACCESS);
    // Figma keeps the refresh token; the stored one carries over.
    expect(open(stored!.refreshToken!)).toBe(OAUTH_REFRESH);
    expect(stored!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 80 * 24 * 3600 * 1000);
  });

  it("doesn't refresh a token with time left", async () => {
    await connectOAuth(60 * 60_000);
    const res = await club().post("/club-templates/import/figma", {
      fileUrl: KEY,
      kind: "century",
    });
    expect(res.status).toBe(201);
    expect(seen.some((s) => s.url.endsWith("/v1/oauth/refresh"))).toBe(false);
    for (const s of seen) expect(s.headers).toEqual({ Authorization: `Bearer ${OAUTH_ACCESS}` });
  });

  it("asks for a reconnect when the refresh fails, and doesn't call Figma", async () => {
    await connectOAuth(60_000);
    answers["/v1/oauth/refresh"] = [400, { error: "invalid_grant" }];
    const res = await club().post("/club-templates/import/figma", {
      fileUrl: KEY,
      kind: "century",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(RECONNECT_REASONS.refreshFailed);
    expect(seen.map((s) => new URL(s.url).pathname)).toEqual(["/v1/oauth/refresh"]);
    expect((await club().get("/figma-connection")).body).toMatchObject({
      connected: false,
      status: "needs_reconnect",
      statusReason: RECONNECT_REASONS.refreshFailed,
    });
  });
});

// ── Disconnect ───────────────────────────────────────────────────────────────

describe("Disconnect", () => {
  it("deletes the sealed tokens and any sign-in in progress, and only this club's", async () => {
    enableOAuth();
    const { state } = await startSignIn();
    await callback({ code: "c", state });
    await startSignIn();
    await connectWithToken(other());

    const res = await club().del("/figma-connection");
    expect(res.status).toBe(204);
    expect(await row(tenantId)).toBeUndefined();
    expect(
      await db
        .select()
        .from(figmaConnectionPendingTable)
        .where(eq(figmaConnectionPendingTable.tenantId, tenantId)),
    ).toHaveLength(0);
    expect((await club().get("/figma-connection")).body.connected).toBe(false);
    expect(await row(otherTenantId)).toBeTruthy();

    const imp = await club().post("/club-templates/import/figma", {
      fileUrl: KEY,
      kind: "century",
    });
    expect(imp.status).toBe(409);
  });
});
