import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { renderCardStill, closeBrowser } from "./card-video-renderer";

/**
 * U4 — server-side static PNG export for standard (pack) cards.
 *
 * Two concerns, both CI-only for the heavy half:
 *  1. The `/card-renders/still` endpoint is admin-gated and entitlement-gated
 *     (`socialStudio`). The gate checks below never reach the renderer — an
 *     unauthenticated request 401s, a locked plan 402s, and an authenticated
 *     admin with an empty body 400s on validation — so they need no Chromium
 *     (the 402 path needs a real DB, so it runs in CI like the sibling suites).
 *  2. The actual render (`renderCardStill`) drives headless Chromium against the
 *     cricket-club harness served at localhost:80. That needs both Chromium and
 *     the web app running, so it is opt-in via RUN_CARD_RENDER_SMOKE and asserts
 *     a runtime shape (native dimensions per size + a non-empty PNG buffer)
 *     rather than pixels.
 */

const STAMP = Date.now();

async function seedTenant(plan: "free" | "club", centralClubId: number) {
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      slug: `still-${plan}-${STAMP}`,
      centralClubId,
      name: `Still ${plan}`,
      plan,
    })
    .returning();
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant.id,
      username: `still_admin_${plan}_${STAMP}`,
      displayName: `Still ${plan}`,
      passwordHash: "x",
    })
    .returning();
  const cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  return { id: tenant.id, adminId: admin.id, cookie };
}

describe("POST /card-renders/still — auth (no DB needed)", () => {
  it("401s an unauthenticated request before touching the renderer", async () => {
    const res = await request(app)
      .post("/api/card-renders/still")
      .set("x-tenant-id", "1")
      .send({ input: {}, options: {} });
    expect(res.status).toBe(401);
  });
});

describe("POST /card-renders/still — entitlement gate (DB-backed, CI)", () => {
  let free: Awaited<ReturnType<typeof seedTenant>>;
  let club: Awaited<ReturnType<typeof seedTenant>>;
  const billingBefore = process.env.BILLING_ENABLED;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-card-still";
    free = await seedTenant("free", 9401);
    club = await seedTenant("club", 9402);
  });

  afterAll(async () => {
    if (billingBefore === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = billingBefore;
    for (const t of [free, club]) {
      await db.delete(adminsTable).where(eq(adminsTable.id, t.adminId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, t.id));
    }
  });

  const postStill = (t: { id: number; cookie: string }) =>
    request(app)
      .post("/api/card-renders/still")
      .set("Cookie", t.cookie)
      .set("x-tenant-id", String(t.id))
      // Empty body: a passed gate 400s on validation BEFORE the renderer runs,
      // a blocked gate 402s — so neither path launches Chromium.
      .send({});

  it("402s a plan without socialStudio when billing is enabled", async () => {
    process.env.BILLING_ENABLED = "true";
    expect((await postStill(free)).status).toBe(402);
  });

  it("lets a socialStudio plan through the gate (400 on the empty body)", async () => {
    process.env.BILLING_ENABLED = "true";
    const res = await postStill(club);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(402);
    expect(res.status).toBe(400);
  });

  it("passes every plan through when billing is dormant (pilot default)", async () => {
    delete process.env.BILLING_ENABLED;
    const res = await postStill(free);
    expect(res.status).not.toBe(402);
    expect(res.status).toBe(400);
  });
});

// Real headless-Chromium render. Opt-in: needs Chromium AND the cricket-club
// harness reachable at RENDER_HARNESS_ORIGIN (defaults to localhost:80).
const runSmoke = !!process.env.RUN_CARD_RENDER_SMOKE;
describe.skipIf(!runSmoke)("renderCardStill — native dimensions per size (smoke)", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  const CASES: Array<{ size: "square" | "portrait" | "story"; w: number; h: number }> = [
    { size: "square", w: 1080, h: 1080 },
    { size: "portrait", w: 1080, h: 1350 },
    { size: "story", w: 1080, h: 1920 },
  ];

  // A minimal pack-supported input (milestone) — the smoke only checks the
  // envelope (dimensions + non-empty buffer), never the pixels.
  const input = {
    kind: "milestone",
    tierLabel: "CLUB CENTURION",
    currentValue: "100",
    milestoneLabel: "GAMES",
    playerName: "Test Player",
    headline: "A century of club games",
  };

  for (const c of CASES) {
    it(`renders ${c.size} at ${c.w}x${c.h} as a non-empty PNG`, async () => {
      const result = await renderCardStill(input, {
        size: c.size,
        sponsorsOn: false,
        junior: false,
        theme: null,
      });
      expect(result.contentType).toBe("image/png");
      expect(result.ext).toBe("png");
      expect(result.width).toBe(c.w);
      expect(result.height).toBe(c.h);
      expect(result.buffer.length).toBeGreaterThan(0);
    }, 60_000);
  }
});
