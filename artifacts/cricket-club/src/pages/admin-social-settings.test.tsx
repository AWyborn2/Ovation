/**
 * Social Media Studio → Settings: the post settings that used to sit on the
 * Studio page, each in its own section with an anchor, plus the old
 * upload-based backgrounds (read-only, delete only, hidden when there are none).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CardTemplate } from "@workspace/api-client-react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import { ConfirmProvider } from "@/components/confirm-dialog";
import AdminSocialSettings from "./admin-social-settings";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BUNDLE = {
  settings: {
    sponsorsEnabled: false,
    clubHashtag: "#DEMO",
    engineMatchSummary: false,
    autoseedCarousels: false,
    matchSummaryGradeConfig: {},
  },
  brand: { name: "Demo Cricket Club", primaryColour: "#1d4ed8", backgroundColour: "#0f172a" },
  activeSponsors: [],
};

function row(id: number, name: string, source: string, packId: string | null = null) {
  return {
    id,
    name,
    cardKinds: ["debut"],
    source,
    packId,
    baseKind: null,
    layers: [],
    defaultForKinds: [],
    backgroundImageUrl: source === "background" ? "https://example.test/bg.png" : null,
    bgWidth: 1080,
    bgHeight: 1080,
    slots: [],
    isActive: true,
    isDefault: false,
    displayOrder: 0,
  } as unknown as CardTemplate;
}

type Write = { url: string; method: string };

function open(templates: CardTemplate[]): Write[] {
  installApiMock({
    "/social-settings": BUNDLE,
    "/card-themes": [],
    "/card-templates": templates,
  });
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Write[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (method !== "GET") {
        writes.push({ url, method });
        return new Response(null, { status: 204 });
      }
      return base(input, init);
    }),
  );
  renderAt(
    <ConfirmProvider>
      <AdminSocialSettings />
    </ConfirmProvider>,
  );
  return writes;
}

describe("Social Studio settings tab", () => {
  it("holds card names, card content and match summary settings, each with an anchor", async () => {
    open([]);
    expect(await screen.findByRole("heading", { name: "Team and competition names" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What your cards show" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Match summary carousels" })).toBeTruthy();
    for (const id of ["card-names", "card-content", "match-summary"]) {
      expect(document.getElementById(id)).not.toBeNull();
      expect(
        screen
          .getByRole("navigation", { name: "Settings sections" })
          .querySelector(`a[href="#${id}"]`),
      ).not.toBeNull();
    }
  });

  it("hides legacy backgrounds when the club has none", async () => {
    open([row(1, "Club Kit — Square (1080×1080)", "pack", "club-kit-v1")]);
    await screen.findByRole("heading", { name: "Team and competition names" });
    expect(screen.queryByRole("heading", { name: "Legacy backgrounds" })).toBeNull();
    expect(document.getElementById("legacy-backgrounds")).toBeNull();
  });

  it("lists uploaded backgrounds only, and deletes one after confirming", async () => {
    const writes = open([
      row(1, "Club Kit — Square (1080×1080)", "pack", "club-kit-v1"),
      row(9, "My Uploaded Background", "background"),
    ]);
    expect(await screen.findByRole("heading", { name: "Legacy backgrounds" })).toBeTruthy();
    expect(screen.getByText("My Uploaded Background")).toBeTruthy();
    expect(screen.queryByText("Club Kit — Square (1080×1080)")).toBeNull();
    // One uploaded background → exactly one Delete affordance.
    const del = screen.getAllByText(/^Delete$/);
    expect(del).toHaveLength(1);
    fireEvent.click(del[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(writes.some((w) => w.method === "DELETE" && w.url.endsWith("/card-templates/9"))).toBe(
        true,
      ),
    );
  });
});
