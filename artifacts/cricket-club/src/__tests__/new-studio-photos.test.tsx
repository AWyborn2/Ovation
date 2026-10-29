/**
 * New Studio → Photos (studio-create-consolidation S11): Uploads and
 * Collections tabs beside the senior and junior libraries, over the existing
 * data. Uploads only manage there (no card to add to); a collection opens in
 * the senior library, where its photos are managed.
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

const routes = (juniors = true) => ({
  "/api/auth/me": { id: 1, username: "ash", displayName: "Ash Admin" },
  "/api/tenant-plan": {
    plan: "club",
    entitlements: { socialStudio: true, juniors },
    newStudio: true,
  },
  "/api/club-uploads": [
    { id: 7, name: "Club crest", kind: "png", thumbUrl: "https://x.test/crest.png", svg: null },
  ],
  "/api/club-photo-collections": [{ id: 3, name: "Matchday crowd", photoCount: 4 }],
});

describe("Photos tabs", () => {
  it("lists every tab, juniors only for a club with juniors", async () => {
    installApiMock(routes());
    renderWithHistory(<AdminSocialGroup />, "/admin/social/photos?tab=uploads");
    const tabs = await screen.findByRole("tablist", { name: "Photos" }, { timeout: 5000 });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Senior photos", "Junior photos", "Uploads", "Collections"]);
    cleanup();
    installApiMock(routes(false));
    renderWithHistory(<AdminSocialGroup />, "/admin/social/photos?tab=junior");
    const noJuniors = await screen.findByRole("tablist", { name: "Photos" }, { timeout: 5000 });
    expect(within(noJuniors).queryByRole("tab", { name: "Junior photos" })).toBeNull();
  });

  it("shows the club's uploads to rename or delete, with nothing to add them to", async () => {
    installApiMock(routes());
    renderWithHistory(<AdminSocialGroup />, "/admin/social/photos?tab=uploads");
    const list = await screen.findByRole("list", { name: "Uploads" }, { timeout: 5000 });
    expect(within(list).getByRole("button", { name: "Rename Club crest" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Delete Club crest" })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /to the card/ })).toBeNull();
  });

  it("opens a collection in the senior library", async () => {
    installApiMock(routes());
    const { url } = renderWithHistory(<AdminSocialGroup />, "/admin/social/photos?tab=collections");
    fireEvent.click(
      await screen.findByRole("button", { name: "Matchday crowd, 4 photos" }, { timeout: 5000 }),
    );
    await waitFor(() => expect(url()).toBe("/admin/social/photos?collection=3"));
  });
});
