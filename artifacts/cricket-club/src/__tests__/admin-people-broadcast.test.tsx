import { describe, it, expect, afterEach, vi } from "vitest";
import type { ComponentType } from "react";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";
import AdminPlayers from "@/pages/admin-players";
import AdminPeople from "@/pages/admin-people";
import AdminCommittee from "@/pages/admin-committee";
import AdminCaptains from "@/pages/admin-captains";
import AdminJuniorCommittee from "@/pages/admin-junior-committee";
import AdminJuniorPlayers from "@/pages/admin-junior-players";
import AdminJuniorStats from "@/pages/admin-junior-stats";
import AdminStats from "@/pages/admin-stats";
import AdminFixtures from "@/pages/admin-fixtures";
import AdminUsers from "@/pages/admin-users";
import AdminImport from "@/pages/admin-import";
import AdminTourContent from "@/pages/admin-tour-content";
import AdminNav from "@/pages/admin-nav";
import AdminReset from "@/pages/admin-reset";
import { ThemeProvider } from "@/lib/theme-context";
import { markWelcomeSeen } from "@/lib/tour";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Leaves inside an admin tab group: the group PageHeader owns the h1. */
const LEAVES: [string, ComponentType, string][] = [
  ["admin-players", AdminPlayers, "/admin/people"],
  ["admin-people", AdminPeople, "/admin/people/non-players"],
  ["admin-committee", AdminCommittee, "/admin/people/committee"],
  ["admin-captains", AdminCaptains, "/admin/people/captains"],
  ["admin-junior-committee", AdminJuniorCommittee, "/admin/people/junior-office-bearers"],
  ["admin-junior-players", AdminJuniorPlayers, "/admin/people/junior-players"],
  ["admin-junior-stats", AdminJuniorStats, "/admin/people/junior-scorecards"],
  ["admin-stats", AdminStats, "/admin/people/stats"],
  ["admin-fixtures", AdminFixtures, "/admin/social/fixtures"],
  ["admin-tour-content", AdminTourContent, "/admin/settings/tour"],
];

describe("People / Stats / Settings admin pages (Broadcast U16)", () => {
  it.each(LEAVES)("%s renders with empty data and no h1", async (_n, Page, path) => {
    installApiMock();
    const { container } = renderAt(<Page />, path);
    await waitFor(() => expect(container.textContent?.trim().length).toBeGreaterThan(0));
    expect(container.querySelector("h1")).toBeNull();
  });

  it.each([
    ["Admin users", AdminUsers, "/admin/users"],
    ["Import stats", AdminImport, "/admin/import"],
  ] as [string, ComponentType, string][])(
    "top-level %s page has a Broadcast PageHeader",
    async (title, Page, path) => {
      installApiMock();
      renderAt(<Page />, path);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    },
  );
});

describe("Admin nav header preview", () => {
  it("shows /records under Stats and an external link under Club", async () => {
    installApiMock({
      "/api/nav-options": { internalTargets: [], icons: [] },
      "surface=senior_menu": [
        {
          id: 1,
          surface: "senior_menu",
          label: "Home",
          description: "",
          iconKey: "",
          target: "/",
          isExternal: false,
          sortOrder: 0,
          visible: true,
        },
        {
          id: 2,
          surface: "senior_menu",
          label: "Records",
          description: "",
          iconKey: "",
          target: "/records",
          isExternal: false,
          sortOrder: 1,
          visible: true,
        },
        {
          id: 3,
          surface: "senior_menu",
          label: "Shop",
          description: "",
          iconKey: "",
          target: "https://shop.example.com",
          isExternal: true,
          sortOrder: 2,
          visible: true,
        },
        {
          id: 4,
          surface: "senior_menu",
          label: "Hidden",
          description: "",
          iconKey: "",
          target: "/grades",
          isExternal: false,
          sortOrder: 3,
          visible: false,
        },
      ],
    });
    renderAt(<AdminNav />, "/admin/settings/nav");
    const preview = await screen.findByTestId("header-preview-seniors");
    const stats = within(preview).getByTestId("header-group-stats");
    const club = within(preview).getByTestId("header-group-club");
    expect(stats.textContent).toContain("Records");
    expect(stats.textContent).not.toContain("Hidden");
    expect(club.textContent).toContain("Shop");
    expect(within(preview).getByTestId("header-group-top").textContent).toContain("Home");
  });
});

describe("Admin reset", () => {
  it("keeps the new + confirm password form for a valid link", async () => {
    markWelcomeSeen();
    // The page reads its token from window.location, not the router.
    window.history.replaceState({}, "", "/admin/reset?token=abc");
    installApiMock({
      "/api/auth/password-reset/abc": { username: "ash", tenantName: "Demo CC" },
    });
    renderAt(
      <ThemeProvider>
        <AdminReset />
      </ThemeProvider>,
      "/admin/reset?token=abc",
    );
    expect(await screen.findByRole("heading", { name: "Set your admin password" })).toBeTruthy();
    expect(await screen.findByLabelText("Confirm password")).toBeTruthy();
  });
});
