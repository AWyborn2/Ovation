import { describe, it, expect, beforeAll, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import type { CardTemplate } from "@workspace/api-client-react";
import AdminSocialStudio from "./admin-social-studio";

/**
 * U3 — Studio pack switcher (R1, R2, R5, R7).
 *
 * These are state round-trips, not a visual check: what the selector reads,
 * what a selection PATCHes, and what the bulk action tells the admin BEFORE it
 * strips their own per-kind defaults. `defaultForKinds` is one namespace shared
 * by pack rows and tenant-authored templates and the server's `clearDefaultKinds`
 * is source-agnostic, so "one PATCH to one canonical row" and "the dialog names
 * the templates that lose a default" are correctness properties, not polish.
 */

const ALL_KINDS = CARD_KIND_OPTIONS.map((o) => o.value);

// The layer-template card in the fixture mounts the canvas thumbnail, which
// jsdom can't provide. The component already degrades to a "Preview failed"
// tile; stubbing keeps jsdom's not-implemented traces out of the run output.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
});

let nextId = 1;

function packRow(
  packId: string,
  name: string,
  variant: string,
  defaultForKinds: string[] = [],
): CardTemplate {
  return {
    id: nextId++,
    name,
    cardKinds: [...ALL_KINDS],
    source: "pack",
    packId,
    packVariant: variant,
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

function byoRow(
  name: string,
  source: "layers" | "background",
  defaultForKinds: string[] = [],
  cardKinds: string[] = [],
): CardTemplate {
  return {
    id: nextId++,
    name,
    cardKinds,
    source,
    packId: null,
    packVariant: null,
    baseKind: "player",
    layers: [],
    defaultForKinds,
    backgroundImageUrl: source === "background" ? "https://example.test/bg.png" : null,
    bgWidth: 1080,
    bgHeight: 1080,
    slots: [],
    isActive: true,
    isDefault: false,
    displayOrder: 0,
  } as CardTemplate;
}

/**
 * A tenant with both packs materialised (three variants each, as
 * `ensurePackTemplates` writes them), a layer template holding the "player"
 * default, and an uploaded background template. `matchSummary` is claimed by
 * Broadcast Dark; `record` is claimed by Gold Foil; `century` is unclaimed.
 */
function fixtureTemplates() {
  nextId = 100;
  const broadcastSquare = packRow(
    "broadcast-dark-v1",
    "Broadcast Dark — Square (1080×1080)",
    "square",
    ["matchSummary"],
  );
  const broadcastPortrait = packRow(
    "broadcast-dark-v1",
    "Broadcast Dark — Portrait (1080×1350)",
    "portrait",
  );
  const broadcastStory = packRow(
    "broadcast-dark-v1",
    "Broadcast Dark — Story (1080×1920)",
    "story",
  );
  const goldSquare = packRow("gold-foil-v1", "Gold Foil — Square (1080×1080)", "square", [
    "record",
  ]);
  const goldPortrait = packRow(
    "gold-foil-v1",
    "Gold Foil — Portrait (1080×1350)",
    "portrait",
  );
  const goldStory = packRow("gold-foil-v1", "Gold Foil — Story (1080×1920)", "story");
  const layerTemplate = byoRow("My Player Layout", "layers", ["player"], ["player"]);
  const backgroundTemplate = byoRow("My Uploaded Background", "background", [], ["debut"]);
  return {
    broadcastSquare,
    broadcastPortrait,
    broadcastStory,
    goldSquare,
    goldPortrait,
    goldStory,
    layerTemplate,
    backgroundTemplate,
    all: [
      // Deliberately not id-ordered: `canonicalPackRowFor` must pick the lowest
      // active id per pack, not the first row it happens to see.
      broadcastStory,
      goldPortrait,
      broadcastSquare,
      goldStory,
      layerTemplate,
      goldSquare,
      broadcastPortrait,
      backgroundTemplate,
    ],
  };
}

const BUNDLE = {
  settings: {
    sponsorsEnabled: false,
    clubHashtag: "#DEMO",
    engineMatchSummary: false,
    autoseedCarousels: false,
    matchSummaryGradeConfig: {},
  },
  brand: {
    name: "Demo Cricket Club",
    shortName: "Demo",
    primaryColour: "#1d4ed8",
    backgroundColour: "#0f172a",
  },
  activeSponsors: [],
};

type Write = { url: string; method: string; body: Record<string, unknown> | null };

/** Install the canned API and record every non-GET request the page issues. */
function setupApi(templates: CardTemplate[]): Write[] {
  installApiMock({
    "/social-settings": BUNDLE,
    "/card-themes": [],
    "/card-templates": templates,
  });
  const base = globalThis.fetch as unknown as (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Write[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        writes.push({
          url,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
      }
      return base(input, init);
    }),
  );
  return writes;
}

async function renderStudio(templates: CardTemplate[]) {
  const writes = setupApi(templates);
  renderAt(
    <ConfirmProvider>
      <AdminSocialStudio />
    </ConfirmProvider>,
  );
  await screen.findByText("Card types");
  return writes;
}

const selectorFor = (label: string) =>
  screen.getByLabelText(`Design pack for ${label}`) as HTMLSelectElement;

describe("admin social studio — per-kind pack selector (R1, R6)", () => {
  it("changing a kind's selector issues one PATCH to that pack's canonical row", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    fireEvent.change(selectorFor("Century"), { target: { value: "gold-foil-v1" } });

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("PATCH");
    // Canonical row = lowest active id for the pack (the square variant here).
    expect(writes[0].url).toContain(`/card-templates/${f.goldSquare.id}`);
    expect(writes[0].body?.defaultForKinds).toEqual(
      expect.arrayContaining(["record", "century"]),
    );
  });

  it("selecting a different pack for a claimed kind produces exactly one claim", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    // `matchSummary` is currently claimed by Broadcast Dark. A default-pack
    // claim presents as the leading "" option — the same option an unclaimed
    // kind sits on, because both render that pack. The list carries the default
    // pack once, not twice under two values that do the same thing.
    expect(selectorFor("Match Summary").value).toBe("");
    fireEvent.change(selectorFor("Match Summary"), {
      target: { value: "gold-foil-v1" },
    });

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].url).toContain(`/card-templates/${f.goldSquare.id}`);
    const claimed = writes[0].body?.defaultForKinds as string[];
    expect(claimed.filter((k) => k === "matchSummary")).toHaveLength(1);
    // The old owner is NOT patched from the client — the server clears it.
    expect(
      writes.some((w) => w.url.includes(`/card-templates/${f.broadcastSquare.id}`)),
    ).toBe(false);
  });

  it("selecting the leading default option writes an explicit Broadcast Dark claim", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    // `record` is claimed by Gold Foil; move it back to the default pack.
    expect(selectorFor("Record").value).toBe("gold-foil-v1");
    fireEvent.change(selectorFor("Record"), { target: { value: "" } });

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].url).toContain(`/card-templates/${f.broadcastSquare.id}`);
    expect(writes[0].body?.defaultForKinds).toEqual(
      expect.arrayContaining(["matchSummary", "record"]),
    );
  });

  it("a kind with no claim renders on the default option, not blank", async () => {
    const f = fixtureTemplates();
    await renderStudio(f.all);

    const sel = selectorFor("Century");
    expect(sel.value).toBe("");
    const selected = sel.options[sel.selectedIndex];
    expect(selected.textContent).toMatch(/Broadcast Dark/);
    expect(selected.textContent).toMatch(/default/i);
  });

  it("a kind whose default is a layers template shows the override warning", async () => {
    const f = fixtureTemplates();
    await renderStudio(f.all);

    expect(
      screen.getByText("Overridden by template: My Player Layout"),
    ).toBeInTheDocument();
  });
});

describe("admin social studio — pack rows stop masquerading (R5, R6)", () => {
  it("the background templates section shows no pack row and offers it no Delete", async () => {
    const f = fixtureTemplates();
    await renderStudio(f.all);

    expect(screen.getByText("My Uploaded Background")).toBeInTheDocument();
    expect(screen.queryByText("Gold Foil — Square (1080×1080)")).toBeNull();
    expect(screen.queryByText("Broadcast Dark — Story (1080×1920)")).toBeNull();
    // One uploaded background → exactly one Delete affordance in that section.
    expect(screen.getAllByText(/^Delete$/)).toHaveLength(1);
  });

  it("no gallery card captions a pack row as the default template", async () => {
    const f = fixtureTemplates();
    await renderStudio(f.all);

    // The tenant's own default still gets a caption — a "layers" template
    // overrides the pack outright, so it reads as the override rather than a
    // plain default, and it is captioned exactly once (not once per phrasing).
    expect(
      screen.getByText("Overridden by template: My Player Layout"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Default template: My Player Layout/)).toBeNull();
    // Pack claims never surface as a "Default template" caption at all.
    expect(screen.queryByText(/Default template: Gold Foil/)).toBeNull();
    expect(screen.queryByText(/Default template: Broadcast Dark/)).toBeNull();
  });
});

describe("admin social studio — bulk apply is gated (R2, R7)", () => {
  it("cancelling the confirm dialog issues no PATCH", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    fireEvent.click(screen.getByLabelText("Use Metallic Foil for all card types"));
    const cancel = await screen.findByRole("button", { name: /cancel/i });
    fireEvent.click(cancel);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull(),
    );
    expect(writes).toHaveLength(0);
  });

  it("the confirm dialog names the tenant templates that lose a default, then one PATCH claims every kind", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    fireEvent.click(screen.getByLabelText("Use Metallic Foil for all card types"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("My Player Layout");
    expect(dialog.textContent).toContain(String(ALL_KINDS.length));

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toContain(`/card-templates/${f.goldSquare.id}`);
    expect(writes[0].body?.defaultForKinds).toEqual(
      expect.arrayContaining([...ALL_KINDS]),
    );
  });
});
