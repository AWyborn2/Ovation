/**
 * New Studio → Settings as cards (studio-create-consolidation S10): a card
 * grid over the existing settings, each card opening its existing page or
 * cards unchanged (`?card=`), with today's Settings page kept when off.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AdminSocialGroup } from "@/pages/admin-groups";
import { renderWithHistory } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const plan = (newStudio: boolean, juniors = true) => ({
  "/api/auth/me": { id: 1, username: "ash", displayName: "Ash Admin" },
  "/api/social-settings": { settings: {}, activeSponsors: [], captionTemplates: [] },
  "/api/tenant-plan": {
    plan: "club",
    entitlements: { socialStudio: true, juniors },
    newStudio,
  },
});

const CARDS = [
  "Posting plan",
  "Auto-post",
  "Sponsors",
  "What cards show",
  "Facebook and Instagram",
  "Figma",
  "Captions",
  "Email lists",
  "Juniors",
];

describe("Settings as cards", () => {
  it("shows a card for each settings area, and opens one in place", async () => {
    installApiMock(plan(true));
    const { url } = renderWithHistory(<AdminSocialGroup />, "/admin/social/settings");
    const grid = await screen.findByRole("list", { name: "Settings" }, { timeout: 5000 });
    for (const name of CARDS)
      expect(within(grid).getByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Juniors/ }));
    await waitFor(() => expect(url()).toBe("/admin/social/settings?card=juniors"));
    expect(await screen.findByRole("heading", { name: "Juniors" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Junior matches" }).getAttribute("href")).toBe(
      "/admin/settings/junior-matches",
    );
    fireEvent.click(screen.getByRole("button", { name: "All settings" }));
    await waitFor(() => expect(url()).toBe("/admin/social/settings"));
    expect(await screen.findByRole("list", { name: "Settings" })).toBeInTheDocument();
  });

  it("leaves out the Juniors card for a club without juniors", async () => {
    installApiMock(plan(true, false));
    renderWithHistory(<AdminSocialGroup />, "/admin/social/settings");
    await screen.findByRole("list", { name: "Settings" }, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /^Captions/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Juniors/ })).toBeNull();
  });

  it("keeps today's Settings page when the switch is off", async () => {
    installApiMock(plan(false));
    renderWithHistory(<AdminSocialGroup />, "/admin/social/settings");
    await screen.findByRole("navigation", { name: "Settings sections" });
    expect(screen.queryByRole("list", { name: "Settings" })).toBeNull();
  });
});
