import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  shouldReadCentral,
  getTenantCentralClubId,
} from "../lib/tenant";
import {
  resolveTenantBySubdomain,
  resolveHostMode,
  classifyNonTenantHost,
} from "../middlewares/tenant-context";

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
  // First label deliberately differs from any tenant slug so the test below can
  // only pass via the custom-domain (byDomain) match, not the slug fallback.
  const replitCustomDomain = `iso-rt-custom-${STAMP}.replit.app`;

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
        customDomain: replitCustomDomain,
        name: "Iso Routing Native",
        plan: "pilot",
      })
      .returning();
    nativeTenantId = native.id;
  });

  afterEach(() => {
    delete process.env.CENTRAL_READS;
    delete process.env.PLATFORM_HOSTS;
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

  it("classifies a tenant host as tenant mode (wins over platform)", async () => {
    process.env.PLATFORM_HOSTS = "ovation.app,www.ovation.app";
    expect(
      await resolveHostMode(fakeReq({ host: `${centralSlug}.ovation.app` })),
    ).toEqual({ mode: "tenant", tenantId: centralTenantId });
  });

  it("classifies an apex/marketing host as platform mode", async () => {
    process.env.PLATFORM_HOSTS = "ovation.app,www.ovation.app";
    expect(await resolveHostMode(fakeReq({ host: "ovation.app" }))).toEqual({
      mode: "platform",
    });
    expect(await resolveHostMode(fakeReq({ host: "www.ovation.app" }))).toEqual({
      mode: "platform",
    });
  });

  it("classifies an unknown host (localhost/preview) as fallback, not platform", async () => {
    process.env.PLATFORM_HOSTS = "ovation.app,www.ovation.app";
    expect(await resolveHostMode(fakeReq({ host: "localhost" }))).toEqual({
      mode: "fallback",
    });
  });

  // Regression: the published ovationcc.replit.app deployment served the Halls
  // Head club app at its root because the host matched no tenant, wasn't in
  // PLATFORM_HOSTS, and so fell through to the demo-tenant fallback. A public
  // production host must never silently impersonate a tenant.
  it("classifies an unmatched published *.replit.app host as platform, even without PLATFORM_HOSTS", async () => {
    expect(await resolveHostMode(fakeReq({ host: "ovationcc.replit.app" }))).toEqual({
      mode: "platform",
    });
  });

  it("a tenant custom domain on *.replit.app still resolves as tenant, not platform", async () => {
    expect(await resolveHostMode(fakeReq({ host: replitCustomDomain }))).toEqual({
      mode: "tenant",
      tenantId: nativeTenantId,
    });
  });

  it("an explicit x-tenant-id on a *.replit.app host pins that tenant (dev switcher)", async () => {
    expect(
      await resolveHostMode(
        fakeReq({ host: "ovationcc.replit.app", tenantId: nativeTenantId }),
      ),
    ).toEqual({ mode: "tenant", tenantId: nativeTenantId });
  });

  it("an unmatched *.replit.dev preview host keeps the demo-tenant fallback", async () => {
    expect(
      await resolveHostMode(fakeReq({ host: `no-such-${STAMP}.replit.dev` })),
    ).toEqual({ mode: "fallback" });
  });

  // Host-capture guard: a tenant whose slug equals a Replit host's first label
  // must NOT capture that host — slugs only match as subdomains of the platform
  // apex. (The native tenant's slug is the first label of this host.)
  it("a tenant slug matching a *.replit.app first label cannot capture the host", async () => {
    expect(
      await resolveHostMode(fakeReq({ host: `iso-rt-native-${STAMP}.replit.app` })),
    ).toEqual({ mode: "platform" });
    expect(
      await resolveTenantBySubdomain(
        fakeReq({ host: `iso-rt-native-${STAMP}.replit.dev` }),
      ),
    ).toBeNull();
  });

  // The middleware's degraded path when the tenant-directory read fails: the
  // DB-free classification must still mark a published *.replit.app host as
  // platform, not fall through to the default tenant's brand.
  it("DB-free degraded classification still marks *.replit.app as platform", () => {
    expect(classifyNonTenantHost(fakeReq({ host: "ovationcc.replit.app" }))).toEqual({
      mode: "platform",
    });
    expect(classifyNonTenantHost(fakeReq({ host: "localhost" }))).toEqual({
      mode: "fallback",
    });
  });
});
