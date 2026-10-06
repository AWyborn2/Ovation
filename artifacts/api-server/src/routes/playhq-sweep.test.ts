// POST /api/internal/playhq/sweep — the hourly PlayHQ runner's scheduled drafting sweep for
// every active club (behind the sync secret). Real database. Without it nothing ran the
// scheduled sweep, so clubs reading central stats never got result cards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, captionTemplatesTable, socialSettingsTable, tenantsTable } from "@workspace/db";

const SECRET = "test-playhq-sweep-secret";
const STAMP = Date.now();
let tenantId: number;
let suspendedId: number;

beforeAll(async () => {
  process.env.PLAYHQ_SYNC_SECRET = SECRET;
  const [t, s] = await db
    .insert(tenantsTable)
    .values([
      { slug: `playhq-sweep-${STAMP}`, centralClubId: 9908, name: "Sweep Test Club", plan: "pro" },
      {
        slug: `playhq-sweep-off-${STAMP}`,
        centralClubId: 9909,
        name: "Suspended Club",
        plan: "pro",
        suspendedAt: new Date(),
      },
    ])
    .returning();
  tenantId = t.id;
  suspendedId = s.id;
  await db.insert(socialSettingsTable).values({ tenantId });
});

afterAll(async () => {
  for (const id of [tenantId, suspendedId]) {
    await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, id));
    await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
  delete process.env.PLAYHQ_SYNC_SECRET;
});

describe("POST /api/internal/playhq/sweep", () => {
  it("401s without the sync secret, and with the draft-sweep secret", async () => {
    await request(app).post("/api/internal/playhq/sweep").expect(401);
    await request(app).post("/api/internal/playhq/sweep").set("x-sweep-secret", SECRET).expect(401);
  });

  it("runs the scheduled sweep for every active club and records it", async () => {
    const res = await request(app)
      .post("/api/internal/playhq/sweep")
      .set("x-sync-secret", SECRET)
      .expect(200);
    const ids = (res.body.results as Array<{ tenantId: number; ok: boolean }>).map(
      (r) => r.tenantId,
    );
    expect(res.body.results).toContainEqual(expect.objectContaining({ tenantId, ok: true }));
    expect(ids).not.toContain(suspendedId);
    const [settings] = await db
      .select({ lastSweepAt: socialSettingsTable.lastSweepAt })
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    expect(settings.lastSweepAt).not.toBeNull();
  });
});
