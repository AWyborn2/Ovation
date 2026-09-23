import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { AdminShell } from "@/components/admin-shell";
import { CaptainShell } from "@/components/captain-shell";
import { AdminHonoursGroup } from "@/pages/admin-groups";
import AdminHub from "@/pages/admin";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ADMIN = { id: 1, username: "ash", displayName: "Ash Admin" };
const ALL_ON = {
  customDomain: true,
  mobileApp: true,
  socialStudio: true,
  clubroomTv: true,
  curation: true,
};

describe("Admin shell (Broadcast U14)", () => {
  it("unauthenticated /admin shows the centred sign-in card", async () => {
    installApiMock({ "/api/auth/me": null });
    renderAt(
      <AdminShell>
        <p>secret</p>
      </AdminShell>,
      "/admin",
    );
    expect(await screen.findByTestId("sign-in-card")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Admin sign-in" })).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("authenticated shows the sidebar with tour hooks and the mobile menu trigger", async () => {
    installApiMock({ "/api/auth/me": ADMIN, "/api/tenant-plan": { entitlements: ALL_ON } });
    const { container } = renderAt(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
      "/admin/people/stats",
    );
    expect(await screen.findByText("content")).toBeTruthy();
    expect(container.querySelector('nav[data-tour="admin-nav"]')).toBeTruthy();
    expect(container.querySelector('[data-tour="admin-nav-/admin/honours"]')).toBeTruthy();
    expect(screen.getByTestId("admin-menu-trigger")).toBeTruthy();
    const current = container.querySelector('nav[data-tour="admin-nav"] [aria-current="page"]');
    expect(current?.textContent).toBe("People");
  });

  it("hides a wholly-paid group the plan lacks", async () => {
    installApiMock({
      "/api/auth/me": ADMIN,
      "/api/tenant-plan": { entitlements: { ...ALL_ON, socialStudio: false } },
    });
    const { container } = renderAt(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
      "/admin",
    );
    await screen.findByText("content");
    await waitFor(() =>
      expect(container.querySelector('[data-tour="admin-nav-/admin/social"]')).toBeNull(),
    );
    expect(container.querySelector('[data-tour="admin-nav-/admin/people"]')).toBeTruthy();
  });
});

describe("Admin tab groups", () => {
  it("the URL selects the tab: /admin/honours/awards → Awards", async () => {
    installApiMock({ "/api/tenant-plan": { entitlements: ALL_ON } });
    renderAt(<AdminHonoursGroup />, "/admin/honours/awards");
    const tab = await screen.findByRole("tab", { name: "Awards" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Premierships" }).getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(screen.getByRole("tabpanel", { name: "Awards" })).toBeTruthy();
  });

  it("drops tabs the plan lacks", async () => {
    installApiMock({
      "/api/tenant-plan": { entitlements: { ...ALL_ON, clubroomTv: false } },
    });
    renderAt(<AdminHonoursGroup />, "/admin/honours");
    await screen.findByRole("tab", { name: "Premierships" });
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Display & kiosk" })).toBeNull());
  });
});

describe("Admin hub", () => {
  it("renders a tile per admin section", async () => {
    installApiMock();
    renderAt(<AdminHub />, "/admin");
    expect(await screen.findByRole("heading", { level: 1, name: "Admin" })).toBeTruthy();
    expect((await screen.findAllByTestId("admin-hub-tile")).length).toBeGreaterThan(0);
  });
});

describe("Captain shell", () => {
  it("unauthenticated shows the captain sign-in card", async () => {
    installApiMock({ "/api/captain-auth/me": null });
    renderAt(
      <CaptainShell>
        <p>votes</p>
      </CaptainShell>,
      "/captain",
    );
    expect(await screen.findByRole("heading", { name: "Captain sign-in" })).toBeTruthy();
    expect(screen.queryByText("votes")).toBeNull();
  });
});
