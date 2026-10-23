/**
 * The Studio's card designs (ADR-011 L5-C2, T5.18): every card is drawn with
 * the club's template for its kind, managed in the template library, so the
 * Studio points there instead of listing kinds or packs per type. Saved
 * editor templates are retired; uploaded backgrounds and the post settings
 * moved to the Settings tab.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { CardTemplate } from "@workspace/api-client-react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import { ConfirmProvider } from "@/components/confirm-dialog";
import AdminSocialStudio from "./admin-social-studio";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BUNDLE = {
  settings: { sponsorsEnabled: false, clubHashtag: "#DEMO", matchSummaryGradeConfig: {} },
  brand: { name: "Demo Cricket Club", primaryColour: "#1d4ed8", backgroundColour: "#0f172a" },
  activeSponsors: [],
};

const background = {
  id: 9,
  name: "My Uploaded Background",
  cardKinds: ["debut"],
  source: "background",
  packId: null,
  baseKind: null,
  layers: [],
  defaultForKinds: [],
  backgroundImageUrl: "https://example.test/bg.png",
  bgWidth: 1080,
  bgHeight: 1080,
  slots: [],
  isActive: true,
  isDefault: false,
  displayOrder: 0,
} as unknown as CardTemplate;

type Write = { url: string; method: string };

function open(): Write[] {
  installApiMock({
    "/social-settings": BUNDLE,
    "/card-themes": [],
    "/card-templates": [background],
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
      <AdminSocialStudio />
    </ConfirmProvider>,
  );
  return writes;
}

describe("Studio card designs", () => {
  it("points to the template library instead of a design per kind or a pack per type", async () => {
    open();
    expect(await screen.findByRole("heading", { name: "Card designs" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open the template library" }).getAttribute("href"),
    ).toBe("/admin/social/template-library");
    expect(screen.queryByText("Pack per card type")).toBeNull();
    expect(screen.queryByRole("link", { name: /Edit the .* template/ })).toBeNull();
    // Design packs moved to Templates → Looks.
    expect(screen.queryByRole("heading", { name: "Design packs" })).toBeNull();
    expect(screen.queryByText("Use for every card")).toBeNull();
  });

  it("sends post settings and uploaded backgrounds to the Settings tab", async () => {
    open();
    await screen.findByRole("heading", { name: "Card designs" });
    expect(screen.queryByText(/use Save as template/)).toBeNull();
    expect(screen.queryByText("My Uploaded Background")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Card names" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open settings" }).getAttribute("href")).toBe(
      "/admin/social/settings",
    );
  });
});
