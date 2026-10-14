import { describe, it, expect, afterEach } from "vitest";
import {
  PlatformSignupBody,
  UpdateAdminTenantBody,
  UpdateTenantBrandBody,
} from "@workspace/api-zod";
import {
  juniorOrgIdFor,
  selectJuniorSyncTenants,
  juniorSyncEnabledFor,
  type JuniorSyncTenantInput,
} from "./junior-sync";

/**
 * The junior sync gate (junior PlayHQ sync plan U1, KTD1/KTD2, R1/R2/R24, AE1).
 * Pure: the entitlement half reads BILLING_ENABLED, nothing touches a database.
 */
function tenant(over: Partial<JuniorSyncTenantInput> = {}): JuniorSyncTenantInput {
  return {
    id: 7,
    plan: "free",
    playhqOrgId: "senior-org",
    playhqSyncEnabled: true,
    juniorSyncEnabled: true,
    playhqJuniorOrgId: null,
    ...over,
  };
}

describe("junior sync gate", () => {
  afterEach(() => {
    delete process.env.BILLING_ENABLED;
  });

  it("covers AE1: PlayHQ sync on and junior sync off is not enabled; switching junior sync on enables it", () => {
    const off = tenant({ juniorSyncEnabled: false });
    expect(juniorSyncEnabledFor(off)).toBe(false);
    expect(selectJuniorSyncTenants([off])).toEqual([]);

    const on = tenant({ juniorSyncEnabled: true });
    expect(juniorSyncEnabledFor(on)).toBe(true);
    expect(selectJuniorSyncTenants([on])).toEqual([{ tenantId: 7, orgId: "senior-org" }]);
  });

  it("is never enabled while PlayHQ sync is off", () => {
    const t = tenant({ playhqSyncEnabled: false });
    expect(juniorSyncEnabledFor(t)).toBe(false);
    expect(selectJuniorSyncTenants([t])).toEqual([]);
  });

  it("passes the entitlement for every plan while billing is dormant", () => {
    for (const plan of ["free", "club", "pro", "pilot", null]) {
      expect(juniorSyncEnabledFor(tenant({ plan }))).toBe(true);
    }
  });

  it("with billing enabled, a plan without juniors is not enabled even with both switches on", () => {
    process.env.BILLING_ENABLED = "true";
    expect(juniorSyncEnabledFor(tenant({ plan: "free" }))).toBe(false);
    expect(juniorSyncEnabledFor(tenant({ plan: "club" }))).toBe(true);
    expect(juniorSyncEnabledFor(tenant({ plan: "pro" }))).toBe(true);
    expect(selectJuniorSyncTenants([tenant({ id: 1, plan: "free" })])).toEqual([]);
  });

  it("uses the senior organisation when no junior organisation is set, and the junior one when set", () => {
    expect(juniorOrgIdFor(tenant())).toBe("senior-org");
    expect(juniorOrgIdFor(tenant({ playhqJuniorOrgId: "junior-org" }))).toBe("junior-org");
    expect(selectJuniorSyncTenants([tenant({ playhqJuniorOrgId: "junior-org" })])).toEqual([
      { tenantId: 7, orgId: "junior-org" },
    ]);
  });

  it("is not enabled when the tenant has no organisation at all", () => {
    const t = tenant({ playhqOrgId: null, playhqJuniorOrgId: null });
    expect(juniorOrgIdFor(t)).toBeNull();
    expect(juniorSyncEnabledFor(t)).toBe(false);
  });

  it("treats a blank junior organisation as unset", () => {
    expect(juniorOrgIdFor(tenant({ playhqJuniorOrgId: "  " }))).toBe("senior-org");
  });

  it("selects only the enabled tenants, in input order", () => {
    const rows = [
      tenant({ id: 1, playhqJuniorOrgId: "j1" }),
      tenant({ id: 2, juniorSyncEnabled: false }),
      tenant({ id: 3, playhqSyncEnabled: false }),
      tenant({ id: 4, playhqOrgId: "s4" }),
    ];
    expect(selectJuniorSyncTenants(rows)).toEqual([
      { tenantId: 1, orgId: "j1" },
      { tenantId: 4, orgId: "s4" },
    ]);
  });
});

describe("junior sync fields are platform-admin only", () => {
  const junior = { juniorSyncEnabled: true, playhqJuniorOrgId: "junior-org" };

  it("the platform-admin tenant update accepts both fields", () => {
    const parsed = UpdateAdminTenantBody.parse(junior);
    expect(parsed).toEqual(junior);
  });

  it("the club-admin brand update carries neither field", () => {
    const parsed = UpdateTenantBrandBody.parse({ name: "Club", ...junior });
    expect(parsed).not.toHaveProperty("juniorSyncEnabled");
    expect(parsed).not.toHaveProperty("playhqJuniorOrgId");
  });

  it("self-serve signup carries neither field", () => {
    const parsed = PlatformSignupBody.parse({
      centralClubId: 1,
      slug: "club",
      adminEmail: "a@example.com",
      password: "correct horse battery",
      ...junior,
    });
    expect(parsed).not.toHaveProperty("juniorSyncEnabled");
    expect(parsed).not.toHaveProperty("playhqJuniorOrgId");
  });
});
