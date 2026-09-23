import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentType } from "react";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";
import AdminAwards from "@/pages/admin-awards";
import AdminCaps from "@/pages/admin-caps";
import AdminLifeMembers from "@/pages/admin-life-members";
import AdminPremierships from "@/pages/admin-premierships";
import AdminTeamOfDecade from "@/pages/admin-team-of-decade";
import AdminHonourBoards from "@/pages/admin-honour-boards";
import AdminMilestoneBoard from "@/pages/admin-milestone-board";
import AdminRecordsDisplay from "@/pages/admin-records-display";
import AdminMatchDisplay from "@/pages/admin-match-display";
import AdminJuniorPremierships from "@/pages/admin-junior-premierships";
import AdminJuniorMatchDisplay from "@/pages/admin-junior-match-display";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * U15 — the Honours admin pages on Broadcast. Each is a leaf inside an admin
 * tab group (the group's PageHeader owns the page h1), so leaves render with
 * mocked-empty data and never add a second h1. Behaviour is unchanged; the
 * awards create flow stands in for the shared form/mutation wiring.
 * `admin-honours-display.test.tsx` covers the display & kiosk page.
 */
const PAGES: [string, ComponentType, string][] = [
  ["admin-awards", AdminAwards, "/admin/honours/awards"],
  ["admin-caps", AdminCaps, "/admin/honours/caps"],
  ["admin-life-members", AdminLifeMembers, "/admin/honours/life-members"],
  ["admin-premierships", AdminPremierships, "/admin/honours"],
  ["admin-team-of-decade", AdminTeamOfDecade, "/admin/honours/team-of-decade"],
  ["admin-honour-boards", AdminHonourBoards, "/admin/settings/honour-boards"],
  ["admin-milestone-board", AdminMilestoneBoard, "/admin/settings/milestone-board"],
  ["admin-records-display", AdminRecordsDisplay, "/admin/settings/records"],
  ["admin-match-display", AdminMatchDisplay, "/admin/settings"],
  ["admin-junior-premierships", AdminJuniorPremierships, "/admin/honours/junior-premierships"],
  ["admin-junior-match-display", AdminJuniorMatchDisplay, "/admin/settings/junior-matches"],
];

describe("Honours admin pages (Broadcast U15)", () => {
  it.each(PAGES)("%s renders with empty data and no h1", async (_name, Page, path) => {
    installApiMock();
    const { container } = renderAt(<Page />, path);
    await waitFor(() => expect(container.textContent?.trim().length).toBeGreaterThan(0));
    expect(container.querySelector("h1")).toBeNull();
  });

  it("leaf page sources carry no h1 (the group header owns it)", () => {
    const dir = join(__dirname, "..", "pages");
    for (const [name] of [...PAGES, ["admin-honours-display"]]) {
      const src = readFileSync(join(dir, `${name}.tsx`), "utf8");
      expect({ name, h1: src.includes("<h1") }).toEqual({ name, h1: false });
    }
  });

  it("awards: listed awards render and the create form submits via the mutation", async () => {
    installApiMock({
      "/api/admin/awards": [
        {
          id: 1,
          key: "club-champion",
          title: "Club Champion",
          description: "",
          displayOrder: 0,
          votingEnabled: false,
          mechanism: "manual",
          published: true,
          pointsGrade: null,
          winners: [],
        },
      ],
    });
    const mocked = globalThis.fetch;
    const posts: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (method === "POST") posts.push(url);
      return mocked(input, init);
    });

    renderAt(<AdminAwards />, "/admin/honours/awards");
    expect(await screen.findByText("Club Champion")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New award" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Peter Wyllie Medal"), {
      target: { value: "Rising Star" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create award" }));
    await waitFor(() => expect(posts.some((u) => u.endsWith("/api/awards"))).toBe(true));
  });
});
