/**
 * Card kind templates U9 — the Studio with the switch on: one design row per
 * kind with an Edit link in place of the pack-per-type choice, the
 * retired-pack banner (AE7), and saved editor templates retired while
 * uploaded backgrounds stay. With the switch off nothing changes.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import type { CardTemplate } from "@workspace/api-client-react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { kindLabel, packName } from "@/lib/social-studio";
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

const summary = (kind: string, over: Record<string, unknown> = {}) => ({
  kind,
  version: 2,
  updatedAt: null,
  replacedPackId: null,
  noticeDismissed: false,
  waitingDrafts: 0,
  ...over,
});

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

function open(kindTemplates: unknown): Write[] {
  installApiMock({
    "/social-settings": BUNDLE,
    "/card-themes": [],
    "/card-templates": [background],
    "/kind-templates/": { ...summary("record"), document: { layers: [] } },
    "/kind-templates": kindTemplates,
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

describe("Studio with card kind templates on", () => {
  it("lists every card kind with its design state and an Edit link", async () => {
    open({ enabled: true, templates: [summary("century", { waitingDrafts: 3 })] });
    expect(await screen.findByRole("heading", { name: "Card designs" })).toBeTruthy();
    for (const kind of TEMPLATE_CARD_KINDS) {
      const link = screen.getByRole("link", { name: `Edit the ${kindLabel(kind)} template` });
      expect(link.getAttribute("href")).toBe(`/admin/social/templates/${kind}`);
    }
    expect(screen.getByText(/Your design · version 2 · 3 waiting cards/)).toBeTruthy();
    expect(screen.getAllByText(/Not designed yet · starts from/).length).toBe(
      TEMPLATE_CARD_KINDS.length - 1,
    );
    expect(screen.queryByText("Pack per card type")).toBeNull();
  });

  it("names a retired pack a template replaced, and dismissing hides it (AE7)", async () => {
    const writes = open({
      enabled: true,
      templates: [summary("record", { replacedPackId: "gold-foil-v1" })],
    });
    const banner = await screen.findByText(/has been retired/);
    expect(banner.textContent).toContain(packName("gold-foil-v1"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(writes.some((w) => /kind-templates\/record\/dismiss-notice$/.test(w.url))).toBe(true),
    );
  });

  it("retires saved editor templates but keeps uploaded backgrounds", async () => {
    open({ enabled: true, templates: [] });
    await screen.findByRole("heading", { name: "Card designs" });
    expect(screen.queryByText(/use Save as template/)).toBeNull();
    expect(screen.getByText("My Uploaded Background")).toBeTruthy();
  });
});

describe("Studio with card kind templates off", () => {
  it("keeps today's pack selector and no Card designs section", async () => {
    open({ enabled: false, templates: [] });
    expect(await screen.findByText("Pack per card type")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Card designs" })).toBeNull();
    expect(screen.getByText(/use Save as template/)).toBeTruthy();
  });
});
