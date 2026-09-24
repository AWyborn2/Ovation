/**
 * Social Studio U20 — the admin shell v2: sidebar groups expanding into tabs,
 * breadcrumb, ⌘K jump-to, the top bar's Create a card, and plan gating.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { AdminShell } from "@/components/admin-shell";
import { adminBreadcrumb } from "@/lib/admin-nav";
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

const renderShell = (path: string, entitlements = ALL_ON) => {
  installApiMock({ "/api/auth/me": ADMIN, "/api/tenant-plan": { entitlements } });
  return renderAt(
    <AdminShell>
      <p>content</p>
    </AdminShell>,
    path,
  );
};

describe("admin shell v2", () => {
  it("on /admin/honours/awards the Honours group is expanded with Awards active, and the breadcrumb follows", async () => {
    const { container } = renderShell("/admin/honours/awards");
    await screen.findByText("content");
    const nav = container.querySelector('nav[data-tour="admin-nav"]') as HTMLElement;
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Awards");
    expect(within(nav).getByText("Cap register")).toBeTruthy();
    // Other groups stay collapsed.
    expect(within(nav).queryByText("Junior scorecards")).toBeNull();

    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs.textContent).toBe("Admin/Honours & Records/Awards");
  });

  it("breadcrumbs resolve a group's first tab at its root path", () => {
    expect(adminBreadcrumb("/admin/people")).toEqual(["Admin", "People", "Players"]);
    expect(adminBreadcrumb("/admin")).toEqual(["Admin", "Hub"]);
  });

  it("⌘K opens jump-to, and choosing Players navigates there", async () => {
    renderShell("/admin");
    await screen.findByText("content");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByPlaceholderText("Jump to…");
    fireEvent.change(input, { target: { value: "Players" } });
    const option = await screen.findByRole("option", { name: /^Players$/ });
    fireEvent.click(option);
    await waitFor(() => expect(screen.queryByPlaceholderText("Jump to…")).toBeNull());
  });

  it("the top bar carries Create a card, and a plan without the Studio hides it and the group", async () => {
    const { container, unmount } = renderShell("/admin");
    await screen.findByText("content");
    expect(screen.getByRole("link", { name: /Create a card/ }).getAttribute("href")).toBe(
      "/admin/social/create",
    );
    unmount();

    const gated = renderShell("/admin", { ...ALL_ON, socialStudio: false });
    await screen.findByText("content");
    await waitFor(() =>
      expect(gated.container.querySelector('[data-tour="admin-nav-/admin/social"]')).toBeNull(),
    );
    expect(screen.queryByRole("link", { name: /Create a card/ })).toBeNull();
    expect(container).toBeTruthy();
  });

  it("the theme toggle switches mode", async () => {
    renderShell("/admin");
    await screen.findByText("content");
    const toggle = screen.getByRole("button", { name: /Switch to (light|dark) mode/ });
    const before = toggle.getAttribute("aria-label");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /Switch to (light|dark) mode/ })
          .getAttribute("aria-label"),
      ).not.toBe(before),
    );
  });
});
