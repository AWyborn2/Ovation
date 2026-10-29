/**
 * New Studio (preview), studio-create-consolidation S1: the switch picks the
 * menu, and old URLs whose page moved redirect only while it is on.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { AdminShell } from "@/components/admin-shell";
import { AdminSocialGroup } from "@/pages/admin-groups";
import { renderAt, renderWithHistory } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ADMIN = { id: 1, username: "ash", displayName: "Ash Admin" };
const ENTITLEMENTS = {
  customDomain: true,
  mobileApp: true,
  socialStudio: true,
  socialPublishing: true,
  clubroomTv: true,
  curation: true,
  juniors: true,
};
const plan = (newStudio: boolean) => ({
  "/api/auth/me": ADMIN,
  "/api/tenant-plan": { plan: "club", entitlements: ENTITLEMENTS, newStudio },
});

const findNav = () =>
  waitFor(() => {
    const nav = document.querySelector('nav[data-tour="admin-nav"]');
    expect(nav).toBeTruthy();
    return nav as HTMLElement;
  });

describe("New Studio switch", () => {
  it("shows the new Studio menu when on", async () => {
    installApiMock(plan(true));
    renderAt(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
      "/admin/social",
    );
    const nav = await findNav();
    expect(await within(nav).findByRole("link", { name: "Your designs" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Create a card" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Carousel sets" })).toBeNull();
  });

  it("keeps today's menu when off", async () => {
    installApiMock(plan(false));
    renderAt(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
      "/admin/social",
    );
    const nav = await findNav();
    expect(await within(nav).findByRole("link", { name: "Create a card" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Your designs" })).toBeNull();
  });

  it("redirects the old photo library to Photos when on", async () => {
    installApiMock(plan(true));
    const { url } = renderWithHistory(<AdminSocialGroup />, "/admin/social/junior-library");
    await waitFor(() => expect(url()).toBe("/admin/social/photos?tab=junior"));
  });

  it("opens an old carousel set rather than redirecting it", async () => {
    installApiMock(plan(true));
    const { url } = renderWithHistory(<AdminSocialGroup />, "/admin/social/sets?open=3");
    await screen.findByRole("heading", { name: "Social Media Studio" });
    expect(url()).toBe("/admin/social/sets?open=3");
  });

  it("does not redirect with the switch off", async () => {
    installApiMock(plan(false));
    const { url } = renderWithHistory(<AdminSocialGroup />, "/admin/social/library");
    await screen.findByRole("heading", { name: "Social Media Studio" });
    expect(url()).toBe("/admin/social/library");
  });
});
