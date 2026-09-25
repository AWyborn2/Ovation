import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import type { CardTemplate } from "@workspace/api-client-react";
import { SUNSET_CLUB_SKY, SUNSET_SKY } from "@/lib/pack-templates/sunset/fragments";
import AdminSocialStudio from "./admin-social-studio";

/**
 * Design packs tile switch: "Club colours" (default) / "Pack's own look". The
 * switch saves the pack's mode through PATCH /social-settings, and the tile's
 * live preview repaints in the new mode.
 */

const ALL_KINDS = CARD_KIND_OPTIONS.map((o) => o.value);

function packRow(id: number, packId: string, defaultForKinds: string[] = []): CardTemplate {
  return {
    id,
    name: `${packId} square`,
    cardKinds: [...ALL_KINDS],
    source: "pack",
    packId,
    packVariant: "square",
    baseKind: null,
    layers: [],
    defaultForKinds,
    backgroundImageUrl: null,
    bgWidth: 1080,
    bgHeight: 1080,
    slots: [],
    isActive: true,
    isDefault: false,
    displayOrder: 0,
  } as CardTemplate;
}

// PackCard only mounts its html once it has a width; jsdom lays nothing out.
const widthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 200,
  });
});
afterAll(() => {
  if (widthDesc) Object.defineProperty(HTMLElement.prototype, "clientWidth", widthDesc);
});

function setupApi() {
  const settings: Record<string, unknown> = {
    sponsorsEnabled: false,
    clubHashtag: "#DEMO",
    engineMatchSummary: false,
    autoseedCarousels: false,
    matchSummaryGradeConfig: {},
    packColourModes: {},
  };
  const bundle = () => ({
    settings,
    brand: {
      name: "Demo Cricket Club",
      shortName: "Demo",
      primaryColour: "#E63946",
      backgroundColour: "#14213D",
    },
    activeSponsors: [],
  });
  installApiMock({
    "/card-themes": [],
    "/card-templates": [packRow(1, "broadcast-dark-v1", ["matchSummary"]), packRow(2, "sunset-v1")],
  });
  const base = globalThis.fetch as unknown as (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const patches: Record<string, unknown>[] = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/social-settings")) {
        if (method === "GET") return json(bundle());
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          packColourModes?: Record<string, string>;
        };
        patches.push(body);
        settings.packColourModes = {
          ...(settings.packColourModes as object),
          ...body.packColourModes,
        };
        return json(settings);
      }
      return base(input, init);
    }),
  );
  return patches;
}

describe("Design packs colour-mode switch", () => {
  it("saves the pack's mode and repaints its preview", async () => {
    const patches = setupApi();
    renderAt(
      <ConfirmProvider>
        <AdminSocialStudio />
      </ConfirmProvider>,
    );
    const toggle = await screen.findByRole("switch", { name: "Sunset: use club colours" });
    const tile = toggle.closest(".rounded-2xl") as HTMLElement;

    // Default: club colours — the club's own sunset sky.
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(tile.innerHTML).toContain(SUNSET_CLUB_SKY));
    expect(tile).toHaveTextContent("Club colours");

    fireEvent.click(toggle);

    await waitFor(() => expect(patches).toEqual([{ packColourModes: { "sunset-v1": "pack" } }]));
    await waitFor(() => expect(tile.innerHTML).toContain(SUNSET_SKY));
    expect(tile.innerHTML).not.toContain(SUNSET_CLUB_SKY);
    expect(tile).toHaveTextContent("Pack's own look");
    expect(screen.getByRole("switch", { name: "Sunset: use club colours" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // The other pack is untouched.
    expect(
      screen.getByRole("switch", { name: "Broadcast Dark: use club colours" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
