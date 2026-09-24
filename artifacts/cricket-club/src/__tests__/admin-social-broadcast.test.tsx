import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, cleanup } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import CaptainPage from "@/pages/captain";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT = {
  id: 7,
  engine: "milestone",
  status: "awaiting_review",
  cardInput: { playerName: "Sam Keeper", tierLabel: "100 games" },
  appPath: "/players/1",
  trackedSlug: null,
  sourceMatchIsJunior: false,
  createdAt: "2026-09-20T10:00:00Z",
};

const JUNIOR_DRAFT = {
  ...DRAFT,
  id: 8,
  engine: "matchSummary",
  cardInput: {
    kind: "matchSummary",
    junior: true,
    club: { name: "Demo U13" },
    opposition: { name: "Rivals U13" },
    matchTitle: "Round 4",
    result: "Won by 20 runs",
  },
  sourceMatchIsJunior: true,
};

describe("Social queue (Broadcast U17)", () => {
  it("renders pending drafts, with the junior badge on the juniors token", async () => {
    installApiMock({
      "/api/social-drafts/pending-count": { count: 2 },
      "/api/social-drafts": [DRAFT, JUNIOR_DRAFT],
      "/api/social-settings": { settings: { clubUrl: "" } },
    });
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    expect(await screen.findByText("Sam Keeper")).toBeTruthy();
    expect(screen.getByText("Demo U13 vs Rivals U13")).toBeTruthy();
    const junior = screen.getByText("Junior");
    expect(junior.getAttribute("style")).toContain("var(--juniors-accent)");
  });

  it("carries no hard-coded club brown", () => {
    const src = readFileSync(join(__dirname, "..", "pages", "admin-social-queue.tsx"), "utf8");
    expect(src).not.toMatch(/#42342B/i);
  });
});

describe("Captain page", () => {
  it("signed in: renders the shell header and the award voting card", async () => {
    installApiMock({
      "/api/captain-auth/me": {
        id: 3,
        username: "cap",
        displayName: "Casey Captain",
        grades: ["A Grade"],
      },
      "/api/captain/voting": [
        {
          configId: 1,
          awardId: 1,
          awardTitle: "Fairest & Best",
          season: 2025,
          votingOpen: true,
          grades: [],
        },
      ],
    });
    renderAt(<CaptainPage />, "/captain");
    expect(await screen.findByText("Casey Captain")).toBeTruthy();
    expect(await screen.findByText("Fairest & Best")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
