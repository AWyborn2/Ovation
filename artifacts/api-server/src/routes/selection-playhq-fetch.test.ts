import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, captainsTable } from "@workspace/db";
import {
  CAPTAIN_SESSION_COOKIE,
  SESSION_COOKIE,
  encodeCaptainSession,
  encodeSession,
} from "../lib/auth";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import {
  FETCH_COOLDOWN_MS,
  loadPlayhqFetchStatus,
  requestPlayhqFetch,
  wakePlayhqSync,
} from "../lib/playhq-fetch-request";

/**
 * The Selection Hub's "Fetch latest from PlayHQ": admins only, one request per club per
 * 10 minutes, refused for a club not linked to the PlayHQ sync; the request waits until an
 * `ondemand` run lands, and waking the workflow is best-effort. Real-DB integration test.
 */

const STAMP = Date.now();
const ORG = `5559f1b9-86d8-eb11-a7ad-${String(STAMP % 1e12).padStart(12, "0")}`;

describe("POST /api/selection/playhq-fetch", () => {
  let linked = 0;
  let unlinked = 0;
  let adminCookie = "";
  let unlinkedCookie = "";
  let captainCookie = "";

  beforeAll(async () => {
    const [a] = await db
      .insert(tenantsTable)
      .values({
        slug: `phq-fetch-${STAMP}`,
        centralClubId: 7_900_000 + (STAMP % 100_000) * 10,
        name: "Fetch CC",
        plan: "pro",
        playhqOrgId: ORG,
        playhqSyncEnabled: true,
      })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({
        slug: `phq-nofetch-${STAMP}`,
        centralClubId: 7_900_001 + (STAMP % 100_000) * 10,
        name: "Unlinked CC",
        plan: "pro",
      })
      .returning();
    linked = a.id;
    unlinked = b.id;
    const admin = async (tenantId: number, name: string) => {
      const [row] = await db
        .insert(adminsTable)
        .values({ tenantId, username: `${name}_${STAMP}`, displayName: name, passwordHash: "x" })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: row.id, issuedAt: Date.now() })}`;
    };
    adminCookie = await admin(linked, "fetch_admin");
    unlinkedCookie = await admin(unlinked, "fetch_other");
    const [cap] = await db
      .insert(captainsTable)
      .values({
        tenantId: linked,
        username: `fetchcap_${STAMP}`,
        displayName: "Skip",
        passwordHash: "x",
      })
      .returning();
    captainCookie = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({
      captainId: cap.id,
      issuedAt: Date.now(),
    })}`;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await purgeTestTenants([linked, unlinked]);
  });

  const post = (tenantId: number, cookie: string) =>
    request(app)
      .post("/api/selection/playhq-fetch")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));

  it("is refused to a captain", async () => {
    await post(linked, captainCookie).expect(403);
  });

  it("is refused for a club not linked to the PlayHQ sync", async () => {
    await post(unlinked, unlinkedCookie).expect(409);
  });

  it("records the request (waiting for the hourly run with no dispatch token), then cools down", async () => {
    vi.stubEnv("PLAYHQ_DISPATCH_TOKEN", "");
    const res = await post(linked, adminCookie).expect(202);
    expect(res.body.wake).toBe("not_configured");
    expect(res.body.fetch).toMatchObject({
      available: true,
      canRequest: true,
      pending: true,
      requestedBy: "fetch_admin",
    });
    expect(res.body.fetch.nextAllowedAt).not.toBeNull();
    const again = await post(linked, adminCookie).expect(429);
    expect(again.body.error).toMatch(/ask again after/);

    // The board carries the same state; a captain sees it but may not request.
    const board = await request(app)
      .get("/api/selection/board?section=senior")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(linked))
      .expect(200);
    expect(board.body.playhqFetch).toMatchObject({ pending: true, canRequest: true });
  });

  it("is answered once the on-demand run lands, and allowed again after the cooldown", async () => {
    const requestedAt = (await loadPlayhqFetchStatus(linked)).requestedAt!;
    await db
      .update(tenantsTable)
      .set({ playhqFetchCompletedAt: new Date(requestedAt.getTime() + 60_000) })
      .where(eq(tenantsTable.id, linked));
    const later = new Date(requestedAt.getTime() + FETCH_COOLDOWN_MS + 1_000);
    const done = await loadPlayhqFetchStatus(linked, later);
    expect(done.pending).toBe(false);
    expect(done.nextAllowedAt).toBeNull();
    const wake = vi.fn(async () => "dispatched" as const);
    const r = await requestPlayhqFetch(linked, "fetch_admin", { now: later, wake });
    expect(wake).toHaveBeenCalledOnce();
    expect(r.wake).toBe("dispatched");
    expect(r.status.pending).toBe(true);
  });
});

describe("wakePlayhqSync", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing without a token", async () => {
    vi.stubEnv("PLAYHQ_DISPATCH_TOKEN", "");
    const f = vi.fn();
    expect(await wakePlayhqSync(f as unknown as typeof fetch)).toBe("not_configured");
    expect(f).not.toHaveBeenCalled();
  });

  it("starts the sync workflow on the configured branch", async () => {
    vi.stubEnv("PLAYHQ_DISPATCH_TOKEN", "tok");
    vi.stubEnv("PLAYHQ_DISPATCH_REPO", "acme/cricket");
    vi.stubEnv("PLAYHQ_DISPATCH_REF", "release");
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await wakePlayhqSync(f as unknown as typeof fetch)).toBe("dispatched");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.github.com/repos/acme/cricket/actions/workflows/playhq-sync.yml/dispatches",
    );
    expect(JSON.parse(String(init.body))).toEqual({ ref: "release" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("reports a refusal or a network error as failed, without throwing", async () => {
    vi.stubEnv("PLAYHQ_DISPATCH_TOKEN", "tok");
    const warn = vi.fn();
    const refused = vi.fn(async () => new Response("no", { status: 403 }));
    expect(await wakePlayhqSync(refused as unknown as typeof fetch, { warn })).toBe("failed");
    const broken = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await wakePlayhqSync(broken as unknown as typeof fetch, { warn })).toBe("failed");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("tok");
  });
});
