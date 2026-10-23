import { describe, it, expect, beforeAll, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { LooksTab, PACK_LOOKS } from "../../test/looks-panel-harness";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { packName } from "@/lib/social-studio";
import type { CardTemplate } from "@workspace/api-client-react";
import { LEGACY_PACK_IDS } from "@workspace/scorecard/queued-carousel";

/**
 * U3 — Studio pack switcher (R2, R5, R7). The per-kind selector (R1, R6) went with
 * the template library (ADR-011 T5.18); the design packs bulk action stays, now on
 * each look card in Templates → Looks.
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
 * Broadcast Dark; `record` is claimed by Club Kit; `century` is unclaimed.
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
  const kitSquare = packRow("club-kit-v1", "Club Kit — Square (1080×1080)", "square", ["record"]);
  const kitPortrait = packRow("club-kit-v1", "Club Kit — Portrait (1080×1350)", "portrait");
  const kitStory = packRow("club-kit-v1", "Club Kit — Story (1080×1920)", "story");
  const layerTemplate = byoRow("My Player Layout", "layers", ["player"], ["player"]);
  const backgroundTemplate = byoRow("My Uploaded Background", "background", [], ["debut"]);
  return {
    broadcastSquare,
    broadcastPortrait,
    broadcastStory,
    kitSquare,
    kitPortrait,
    kitStory,
    layerTemplate,
    backgroundTemplate,
    all: [
      // Deliberately not id-ordered: `canonicalPackRowFor` must pick the lowest
      // active id per pack, not the first row it happens to see.
      broadcastStory,
      kitPortrait,
      broadcastSquare,
      kitStory,
      layerTemplate,
      kitSquare,
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
    "/template-library/looks": PACK_LOOKS,
    "/club-templates": { templates: [] },
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
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
      <LooksTab />
    </ConfirmProvider>,
  );
  await screen.findByLabelText("Use Club Kit for every card");
  return writes;
}

describe("Looks tab — legacy packs are hidden (P9)", () => {
  it("offers no legacy pack anywhere, and shows a legacy claim as Club Kit", async () => {
    const f = fixtureTemplates();
    // A list that still carries legacy pack rows (the API hides them; this is the
    // client's own guard), one of them holding the Century claim.
    const legacy = LEGACY_PACK_IDS.map((id, i) =>
      packRow(id, `Legacy ${i} — Square (1080×1080)`, "square", i === 0 ? ["century"] : []),
    );
    const duotone = {
      ...packRow("duotone-v1", "Duotone — Square (1080×1080)", "square"),
      cardKinds: ["matchDay", "matchSummary", "teamList"],
    } as CardTemplate;
    await renderStudio([...f.all, ...legacy, duotone]);

    for (const id of LEGACY_PACK_IDS) {
      const name = packName(id);
      expect(screen.queryAllByRole("radio", { name })).toHaveLength(0);
      expect(screen.queryByLabelText(`Use ${name} for every card`)).toBeNull();
    }
    expect(screen.getByLabelText("Use Club Kit for every card")).toBeInTheDocument();
  });
});

describe("Looks tab — pack rows stop masquerading (R5, R6)", () => {
  it("no gallery card captions a pack row as the default template", async () => {
    const f = fixtureTemplates();
    await renderStudio(f.all);

    expect(screen.queryByText(/Default template: My Player Layout/)).toBeNull();
    // Pack claims never surface as a "Default template" caption at all.
    expect(screen.queryByText(/Default template: Club Kit/)).toBeNull();
    expect(screen.queryByText(/Default template: Broadcast Dark/)).toBeNull();
  });
});

describe("Looks tab — bulk apply is gated (R2, R7)", () => {
  it("cancelling the confirm dialog issues no PATCH", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    fireEvent.click(screen.getByLabelText("Use Club Kit for every card"));
    const cancel = await screen.findByRole("button", { name: /cancel/i });
    fireEvent.click(cancel);

    await waitFor(() => expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull());
    expect(writes).toHaveLength(0);
  });

  it("the confirm dialog names the tenant templates that lose a default, then one PATCH claims every kind", async () => {
    const f = fixtureTemplates();
    const writes = await renderStudio(f.all);

    fireEvent.click(screen.getByLabelText("Use Club Kit for every card"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("My Player Layout");
    expect(dialog.textContent).toContain(String(ALL_KINDS.length));

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toContain(`/card-templates/${f.kitSquare.id}`);
    expect(writes[0].body?.defaultForKinds).toEqual(expect.arrayContaining([...ALL_KINDS]));
  });
});
