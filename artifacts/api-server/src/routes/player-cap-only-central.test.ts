import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, playersTable } from "@workspace/db";
import { invalidateTenantConfigCache } from "../lib/tenant";

/**
 * Halls Head cap-only players after the cut-over (hybrid stats plan U14; the
 * first U13 preview's 42 blocking cap-register links).
 *
 * A cap-only native player (`players.is_cap_only`, ids >= 90000) was capped
 * before the digital era and has no stats in either read, so the crosswalk
 * never maps them. The native read shows a stats-free profile; once Halls Head
 * reads central, the player route must keep showing it so the cap register's
 * links still open. Another tenant never sees Halls Head's native players.
 *
 * Real-DB integration test: tenant 1 is flipped to central reads for the suite
 * and restored after (files run one at a time).
 */

const T1 = 1;
const STAMP = Date.now();
let capOnlyId: number;
let plainId: number;
let t2: number;
let t1WasCentral = false;

beforeAll(async () => {
  const [t1] = await db
    .select({ readsFromCentral: tenantsTable.readsFromCentral })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, T1));
  t1WasCentral = t1?.readsFromCentral ?? false;

  const [cap] = await db
    .insert(playersTable)
    .values({ surname: `Caponly${STAMP}`, givenName: "Early", isCapOnly: true })
    .returning();
  capOnlyId = cap!.id;
  const [plain] = await db
    .insert(playersTable)
    .values({ surname: `Uncapped${STAMP}`, givenName: "Native" })
    .returning();
  plainId = plain!.id;

  const [tenant2] = await db
    .insert(tenantsTable)
    .values({
      slug: `cap-only-t2-${STAMP}`,
      centralClubId: 9821,
      readsFromCentral: true,
      name: "Cap Only Tenant 2",
      plan: "pilot",
    })
    .returning();
  t2 = tenant2!.id;

  await db.update(tenantsTable).set({ readsFromCentral: true }).where(eq(tenantsTable.id, T1));
  invalidateTenantConfigCache();
});

afterAll(async () => {
  await db
    .update(tenantsTable)
    .set({ readsFromCentral: t1WasCentral })
    .where(eq(tenantsTable.id, T1));
  if (t2) await db.delete(tenantsTable).where(eq(tenantsTable.id, t2));
  if (capOnlyId) await db.delete(playersTable).where(eq(playersTable.id, capOnlyId));
  if (plainId) await db.delete(playersTable).where(eq(playersTable.id, plainId));
  invalidateTenantConfigCache();
});

describe("cap-only players once Halls Head reads central", () => {
  it("keeps the stats-free profile", async () => {
    const r = await request(app).get(`/api/players/${capOnlyId}`).set("x-tenant-id", String(T1));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: capOnlyId,
      surname: `Caponly${STAMP}`,
      givenName: "Early",
      isCapOnly: true,
      stats: [],
      premierships: [],
      awards: [],
    });
  });

  it("a native player with no crosswalk row and no cap-only flag is still a 404", async () => {
    const r = await request(app).get(`/api/players/${plainId}`).set("x-tenant-id", String(T1));
    expect(r.status).toBe(404);
  });

  it("another tenant never sees Halls Head's cap-only player", async () => {
    const r = await request(app).get(`/api/players/${capOnlyId}`).set("x-tenant-id", String(t2));
    expect(r.status).toBe(404);
  });
});
