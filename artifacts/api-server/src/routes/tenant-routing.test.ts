import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  shouldReadCentral,
  getTenantCentralClubId,
} from "../lib/tenant";
import { resolveTenantBySubdomain } from "../middlewares/tenant-context";

/**
 * Per-tenant routing layer (Phase 1). Hardens the decisions every multi-club
 * read depends on: which data source a tenant uses (native vs central), the
 * central club id it filters by, the global kill-switch, and resolving a tenant
 * from its subdomain / custom domain. Real-DB integration test (needs
 * DATABASE_URL; central DB NOT required — these are tenant-table reads only),
 * following the existing isolation-suite pattern.
 */

const STAMP = Date.now();
const CENTRAL_CLUB_ID = 4242;

function fakeReq(opts: { tenantId?: number; host?: string }): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "x-tenant-id" && opts.tenantId != null
        ? String(opts.tenantId)
        : undefined,
    headers: { host: opts.host },
  } as unknown as Request;
}

describe("per-tenant routing: data source + central club + subdomain", () => {
  let centralTenantId: number;
  let nativeTenantId: number;
  const centralSlug = `iso-rt-central-${STAMP}`;
  const customDomain = `iso-rt-${STAMP}.example.com`;

  beforeAll(async () => {
    const [central] = await db
      .insert(tenantsTable)
      .values({
        slug: centralSlug,
        centralClubId: CENTRAL_CLUB_ID,
        readsFromCentral: true,
        customDomain,
        name: "Iso Routing Central",
        plan: "pilot",
      })
      .returning();
    centralTenantId = central.id;

    const [native] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-rt-native-${STAMP}`,
        centralClubId: 4243,
        readsFromCentral: false,
        name: "Iso Routing Native",
        plan: "pilot",
      })
      .returning();
    nativeTenantId = native.id;
  });

  afterEach(() => {
    delete process.env.CENTRAL_READS;
  });

  afterAll(async () => {
    await db.delete(tenantsTable).where(eq(tenantsTable.id, centralTenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, nativeTenantId));
  });

  it("routes a reads_from_central tenant to central, a native tenant to native", async () => {
    expect(await shouldReadCentral(fakeReq({ tenantId: centralTenantId }))).toBe(true);
    expect(await shouldReadCentral(fakeReq({ tenantId: nativeTenantId }))).toBe(false);
  });

  it("CENTRAL_READS=0 is a global kill-switch (forces native everywhere)", async () => {
    process.env.CENTRAL_READS = "0";
    expect(await shouldReadCentral(fakeReq({ tenantId: centralTenantId }))).toBe(false);
  });

  it("resolves the tenant's central club id", async () => {
    expect(await getTenantCentralClubId(centralTenantId)).toBe(CENTRAL_CLUB_ID);
  });

  it("resolves a tenant from its subdomain label (slug)", async () => {
    expect(
      await resolveTenantBySubdomain(fakeReq({ host: `${centralSlug}.ovation.app` })),
    ).toBe(centralTenantId);
  });

  it("resolves a tenant from an exact custom-domain match", async () => {
    expect(
      await resolveTenantBySubdomain(fakeReq({ host: customDomain })),
    ).toBe(centralTenantId);
  });

  it("returns null for a host that matches no tenant", async () => {
    expect(
      await resolveTenantBySubdomain(fakeReq({ host: `no-such-${STAMP}.ovation.app` })),
    ).toBeNull();
  });
});
