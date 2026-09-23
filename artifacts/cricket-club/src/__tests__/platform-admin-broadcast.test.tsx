import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { Route } from "wouter";
import { PlatformAdminShell } from "@/components/platform-admin-shell";
import TenantsList from "@/pages/platform-admin/tenants-list";
import TenantDetail from "@/pages/platform-admin/tenant-detail";
import { ThemeProvider } from "@/lib/theme-context";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TENANT = {
  id: 4,
  slug: "demo",
  name: "Demo Cricket Club",
  plan: "club",
  centralClubId: 9,
  centralClubName: "Demo CC",
  customDomain: null,
  readsFromCentral: true,
  createdAt: "2026-01-01T00:00:00Z",
  adminCount: 2,
  brandingComplete: true,
  lastActiveAt: null,
  suspendedAt: null,
};

describe("Platform admin (Broadcast U18)", () => {
  it("signed out: the shell shows the Broadcast sign-in card with an email field", async () => {
    installApiMock({ "/api/platform/auth/me": null });
    renderAt(
      <PlatformAdminShell>
        <p>console</p>
      </PlatformAdminShell>,
      "/platform-admin",
    );
    expect(await screen.findByRole("heading", { name: "Platform sign-in" })).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.queryByText("console")).toBeNull();
  });

  it("signed in: the 68px glass header and platform nav render", async () => {
    installApiMock({ "/api/platform/auth/me": { id: 1, email: "ops@ovation.test" } });
    renderAt(
      <PlatformAdminShell>
        <p>console</p>
      </PlatformAdminShell>,
      "/platform-admin",
    );
    expect(await screen.findByText("console")).toBeTruthy();
    expect(screen.getByTestId("platform-home").textContent).toContain("Ovation");
    const nav = screen.getByRole("navigation", { name: "Platform" });
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("Tenants");
  });

  it("tenants list renders rows", async () => {
    installApiMock({ "/api/platform/admin/tenants": [TENANT] });
    renderAt(<TenantsList />, "/platform-admin");
    expect(await screen.findByRole("link", { name: "Demo Cricket Club" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Tenants" })).toBeTruthy();
  });

  it("tenants list empty state", async () => {
    installApiMock({ "/api/platform/admin/tenants": [] });
    renderAt(<TenantsList />, "/platform-admin");
    await screen.findByRole("heading", { level: 1, name: "Tenants" });
    expect(await screen.findByText("No tenants yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("tenant detail renders the brand card", async () => {
    installApiMock({ "/api/platform/admin/tenants/4": { tenant: TENANT, admins: [] } });
    renderAt(
      <ThemeProvider>
        <Route path="/platform-admin/tenants/:id" component={TenantDetail} />
      </ThemeProvider>,
      "/platform-admin/tenants/4",
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Demo Cricket Club" }),
    ).toBeTruthy();
    expect(screen.getByText("Branding")).toBeTruthy();
  });
});
