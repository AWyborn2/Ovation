import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { Layout } from "@/components/layout";
import { ThemeProvider } from "@/lib/theme-context";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

function renderLayout(path: string, overrides: Record<string, unknown> = {}) {
  const api = installApiMock(overrides);
  const utils = renderAt(
    <ThemeProvider>
      <Layout>
        <p>page body</p>
      </Layout>
    </ThemeProvider>,
    path,
  );
  return { ...utils, api };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SiteHeader (Broadcast U4)", () => {
  it("marks the Stats group active on /records (AE3)", () => {
    renderLayout("/records");
    expect(screen.getByTestId("nav-group-stats").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("nav-group-history").getAttribute("data-active")).toBeNull();
  });

  it("shows the Juniors section and junior groups on a juniors route (AE4)", () => {
    renderLayout("/juniors/players");
    expect(screen.getByTestId("club-switcher").getAttribute("aria-label")).toMatch(/Juniors/);
    expect(screen.getByTestId("nav-group-stats")).toBeTruthy();
    // Seniors-only groups (Club → Fixtures) are not offered in juniors.
    expect(screen.queryByTestId("nav-group-club")).toBeNull();
  });

  it("keeps the guided-tour and main-nav hooks", () => {
    const { container } = renderLayout("/");
    expect(container.querySelector('[data-tour="main-nav"]')).toBeTruthy();
    expect(container.querySelector('[data-tour="section-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-tour="help-button"]')).toBeTruthy();
  });

  it("the Admin pill reads Admin when signed out and Dashboard when signed in", async () => {
    renderLayout("/");
    expect(screen.getAllByTestId("admin-pill")[0].textContent).toBe("Admin");
    cleanup();
    vi.unstubAllGlobals();
    renderLayout("/", { "/auth/me": { id: 1, username: "owner", displayName: "Owner" } });
    await waitFor(() =>
      expect(screen.getAllByTestId("admin-pill")[0].textContent).toBe("Dashboard"),
    );
  });

  it("mobile: tapping the crest reveals the Seniors/Juniors row", () => {
    renderLayout("/players");
    expect(screen.queryByTestId("mobile-section-row")).toBeNull();
    fireEvent.click(screen.getByTestId("mobile-club-button"));
    const row = screen.getByTestId("mobile-section-row");
    expect(within(row).getByText("Juniors").getAttribute("href")).toBe("/juniors");
  });

  it("mobile: the menu sheet groups Home under Browse and closes on Esc", () => {
    renderLayout("/players");
    fireEvent.click(screen.getByTestId("mobile-menu-button"));
    const sheet = screen.getByTestId("mobile-menu-sheet");
    expect(within(sheet).getByText("Browse")).toBeTruthy();
    expect(within(sheet).getByText("Home")).toBeTruthy();
    expect(within(sheet).getByText("Stats")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("mobile-menu-sheet")).toBeNull();
  });
});

describe("SearchPalette (Broadcast U5)", () => {
  it("Ctrl+K opens the palette with the input focused", async () => {
    renderLayout("/");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByTestId("search-input");
    expect(document.activeElement).toBe(input);
  });

  it("searches senior players on a senior route", async () => {
    const { api } = renderLayout("/", {
      "/players?search=cai": {
        players: [{ id: 42, givenName: "Mitchell", surname: "Caine", deceased: false }],
        total: 1,
        page: 1,
        limit: 5,
      },
    });
    fireEvent.click(screen.getByTestId("search-trigger"));
    fireEvent.change(await screen.findByTestId("search-input"), { target: { value: "cai" } });
    await screen.findByText("Mitchell Caine");
    expect(api.calls.some((u) => u.includes("/players?search=cai"))).toBe(true);
    expect(api.calls.some((u) => u.includes("/juniors/players"))).toBe(false);
  });

  it("searches junior players only on a juniors route (isolation, AE4)", async () => {
    const { api } = renderLayout("/juniors", {
      "/juniors/players?search=smi": [{ participantId: "p1", displayName: "Sam Smith" }],
    });
    fireEvent.click(screen.getByTestId("search-trigger"));
    fireEvent.change(await screen.findByTestId("search-input"), { target: { value: "smi" } });
    await screen.findByText("Sam Smith");
    expect(api.calls.some((u) => /\/api\/players\?search=/.test(u))).toBe(false);
  });

  it("shows Jump-to links with an empty query", async () => {
    renderLayout("/");
    fireEvent.click(screen.getByTestId("search-trigger"));
    await screen.findByTestId("search-input");
    expect(screen.getByText("Jump to")).toBeTruthy();
    expect(screen.queryByText("Players", { selector: "[cmdk-group-heading]" })).toBeNull();
  });
});

describe("SiteFooter (Broadcast U6)", () => {
  it("renders one column per nav group and the tenant name, never Halls Head", () => {
    renderLayout("/");
    const footer = screen.getByTestId("site-footer");
    expect(within(footer).getByText("Stats")).toBeTruthy();
    expect(within(footer).getByText("History")).toBeTruthy();
    expect(footer.textContent).not.toMatch(/Halls Head/);
    expect(within(footer).getByText("Powered by Ovation")).toBeTruthy();
  });
});
