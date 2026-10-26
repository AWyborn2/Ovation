import { describe, it, expect, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import type { HonourDisplayBundle } from "@workspace/api-client-react";
import AdminHonoursDisplay from "./admin-honours-display";

/**
 * U2 — Ad creatives editor accepts and previews MP4 uploads (R1, R2, R3, R5).
 *
 * `installApiMock`'s route table has no built-in entry for the upload
 * endpoints, so every test here supplies an explicit override for
 * "uploads/request-url" — otherwise the request falls through to the
 * default `[]` payload and the upload flow can't resolve a usable
 * objectPath (see components/honours-display/editors/ad-editor.tsx).
 */

const BUNDLE: HonourDisplayBundle = {
  boards: [],
  brand: {
    name: "Demo Cricket Club",
    shortName: "Demo CC",
    monogram: "DC",
    backgroundColour: "#1d4ed8",
    primaryColour: "#0f172a",
    juniorsColour: "#42342B",
  },
  settings: {
    defaultTemplate: "p1",
    kioskSequence: [],
    kioskDwellMs: 3500,
    kioskScrollSpeed: 36,
    kioskEndHoldMs: 3000,
    kioskSponsorStrip: false,
    kioskSponsorSlides: false,
    kioskSponsorSlideEvery: 3,
    kioskAds: [],
    kioskLook: {},
    boardConfigs: {},
    composites: [],
  },
  activeSponsors: [],
};

function uploadOverride(contentType: string, objectPath: string) {
  return {
    "uploads/request-url": {
      uploadURL: "https://fake-upload.test/put",
      objectPath,
      metadata: { name: "ad-file", size: 1024, contentType },
    },
  };
}

/** Ads live on the Sponsors & ads tab (Radix tabs switch on mouse-down). */
async function openSponsorsTab() {
  fireEvent.mouseDown(await screen.findByTestId("tab-sponsors"));
}

async function addAdRow() {
  await openSponsorsTab();
  fireEvent.click(await screen.findByTestId("button-add-ad"));
  return screen.getByTestId(/^ad-file-/);
}

describe("AdEditor MP4 upload", () => {
  it("accepts video/mp4 in the file picker", async () => {
    installApiMock({ "/honour-display": BUNDLE });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const fileInput = await addAdRow();
    expect(fileInput.getAttribute("accept")).toContain("video/mp4");
  });

  it("uploads an mp4 and marks the ad as mediaType video", async () => {
    installApiMock({
      "/honour-display": BUNDLE,
      ...uploadOverride("video/mp4", "/objects/uploads/test-ad.mp4"),
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const fileInput = await addAdRow();

    const file = new File(["fake-mp4-bytes"], "ad.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const urlInput = screen.getByTestId(/^ad-url-/) as HTMLInputElement;
      expect(urlInput.value).toBe("/api/storage/objects/uploads/test-ad.mp4");
    });

    const preview = await screen.findByTestId(/^ad-preview-/);
    expect(preview.tagName).toBe("VIDEO");
  });

  it("still uploads a png as mediaType image (regression)", async () => {
    installApiMock({
      "/honour-display": BUNDLE,
      ...uploadOverride("image/png", "/objects/uploads/test-ad.png"),
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const fileInput = await addAdRow();

    const file = new File(["fake-png-bytes"], "ad.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const preview = await screen.findByTestId(/^ad-preview-/);
    expect(preview.tagName).toBe("IMG");
  });

  it("renders a legacy ad (no mediaType) as an image", async () => {
    installApiMock({
      "/honour-display": {
        ...BUNDLE,
        settings: {
          ...BUNDLE.settings,
          kioskAds: [
            { id: "ad:legacy", name: "Legacy ad", imageUrl: "/api/storage/objects/legacy.png" },
          ],
        },
      },
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    await openSponsorsTab();
    const preview = await screen.findByTestId(/^ad-preview-/);
    expect(preview.tagName).toBe("IMG");
  });
});

describe("settings tabs (kiosk redesign B1)", () => {
  it("opens on Rotation and shows each tab's cards", async () => {
    installApiMock({ "/honour-display": BUNDLE });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    expect((await screen.findByTestId("tab-rotation")).getAttribute("data-state")).toBe("active");
    expect(await screen.findByText("TV kiosk")).toBeTruthy();
    expect(screen.queryByText("Global colours & font")).toBeNull();

    fireEvent.mouseDown(screen.getByTestId("tab-look"));
    expect(await screen.findByText("Global colours & font")).toBeTruthy();
    expect(screen.queryByText("TV kiosk")).toBeNull();

    fireEvent.mouseDown(screen.getByTestId("tab-sponsors"));
    expect(await screen.findByTestId("button-add-ad")).toBeTruthy();
  });

  it("keeps unsaved changes when switching tabs, under one save bar", async () => {
    installApiMock({ "/honour-display": BUNDLE });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    fireEvent.mouseDown(await screen.findByTestId("tab-sponsors"));
    fireEvent.click(await screen.findByTestId("button-add-ad"));
    expect(screen.getAllByTestId(/^ad-file-/)).toHaveLength(1);

    fireEvent.mouseDown(screen.getByTestId("tab-look"));
    fireEvent.mouseDown(screen.getByTestId("tab-sponsors"));
    expect(await screen.findAllByTestId(/^ad-file-/)).toHaveLength(1);
  });
});

describe("rotation builder (kiosk redesign B2)", () => {
  const board = (id: string, title: string, layout: "list" | "grid" = "list") => ({
    id,
    category: "awards",
    layout,
    title,
    entries: [],
    display: { columns: 1, transition: "scroll" as const, fit: false },
  });
  const WITH_BOARDS: HonourDisplayBundle = {
    ...BUNDLE,
    boards: [board("premierships", "Premierships"), board("champions", "Club Champions", "grid")],
  };
  const rowTitles = () =>
    screen
      .getAllByTestId(/^seq-row-\d+$/)
      .map((r) => r.querySelector("[data-title]")?.textContent?.trim());

  /** Saves the form and returns the kioskSequence the page sent. */
  async function savedSequence(): Promise<string[]> {
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const fetchMock = vi.mocked(fetch);
    const sent = () =>
      fetchMock.mock.calls.find(([, init]) => init?.method && init.method !== "GET");
    await waitFor(() => expect(sent()).toBeTruthy());
    return (JSON.parse(String(sent()![1]!.body)) as { kioskSequence: string[] }).kioskSequence;
  }

  it("starts from every board when no rotation is set", async () => {
    installApiMock({ "/honour-display": WITH_BOARDS });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    expect(await screen.findByTestId("rotation-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rotation-start-all"));
    expect(rowTitles()).toEqual(["Premierships", "Club Champions", "Approaching Milestones"]);
    expect(screen.getByTestId("seq-row-1").textContent).toContain("Season grid");
  });

  it("adds, duplicates, reorders by keyboard and removes items, then saves the sequence", async () => {
    installApiMock({
      "/honour-display": {
        ...WITH_BOARDS,
        settings: { ...BUNDLE.settings, kioskSequence: ["premierships"] },
      },
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    await screen.findByTestId("seq-row-0");

    fireEvent.click(screen.getByTestId("add-sponsor-to-seq"));
    fireEvent.change(screen.getByTestId("add-to-seq"), { target: { value: "champions" } });
    expect(rowTitles()).toEqual(["Premierships", "Sponsor wall", "Club Champions"]);
    expect(screen.getByTestId("seq-row-1").textContent).toContain("Sponsor wall");

    fireEvent.click(screen.getByTestId("seq-dup-1"));
    expect(rowTitles()).toEqual(["Premierships", "Sponsor wall", "Sponsor wall", "Club Champions"]);

    fireEvent.keyDown(screen.getByTestId("seq-handle-3"), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(screen.getByTestId("seq-handle-2"), { key: "ArrowUp", altKey: true });
    expect(rowTitles()).toEqual(["Premierships", "Club Champions", "Sponsor wall", "Sponsor wall"]);
    expect(screen.getByTestId("rotation-announcer").textContent).toBe(
      "Club Champions moved to position 2 of 4",
    );

    fireEvent.click(screen.getByTestId("seq-remove-3"));
    expect(await savedSequence()).toEqual(["premierships", "champions", "sponsor"]);
  });

  it("reorders by drag and drop", async () => {
    installApiMock({
      "/honour-display": {
        ...WITH_BOARDS,
        settings: { ...BUNDLE.settings, kioskSequence: ["premierships", "champions", "sponsor"] },
      },
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const first = await screen.findByTestId("seq-row-0");
    const last = screen.getByTestId("seq-row-2");
    fireEvent.dragStart(first, { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    // jsdom gives drag events no pointer position, so this drops onto the top
    // half of the last row (before it); dropIndex covers the bottom half.
    fireEvent.dragOver(last);
    fireEvent.drop(last);
    expect(rowTitles()).toEqual(["Club Champions", "Premierships", "Sponsor wall"]);
  });
});

describe("TV settings (kiosk redesign B3)", () => {
  const champions = {
    id: "champions",
    category: "awards",
    layout: "grid" as const,
    title: "Club Champions",
    entries: [],
    grid: { rowHeading: "Season", columnHeadings: ["First", "Second", "Third"], rows: [] },
    display: { columns: 1, transition: "scroll" as const, fit: false },
  };
  const team = { ...champions, id: "team", layout: "teamOfDecade" as const, title: "Team" };
  const bundle = (
    settings: Partial<HonourDisplayBundle["settings"]> = {},
  ): HonourDisplayBundle => ({
    ...BUNDLE,
    boards: [champions, team],
    settings: { ...BUNDLE.settings, kioskSequence: ["champions", "team", "sponsor"], ...settings },
  });
  const sentBody = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const sent = () =>
      vi.mocked(fetch).mock.calls.find(([, init]) => init?.method && init.method !== "GET");
    await waitFor(() => expect(sent()).toBeTruthy());
    return JSON.parse(String(sent()![1]!.body)) as {
      kioskLook: Record<string, unknown>;
      boardConfigs: Record<string, Record<string, unknown>>;
    };
  };
  const select = (id: string) => screen.getByTestId(id) as HTMLSelectElement;

  it("shows a board only the controls its layout and movement use", async () => {
    installApiMock({ "/honour-display": bundle() });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    fireEvent.click(await screen.findByTestId("seq-select-0"));

    // A season grid offers up to its own three grade columns, defaulting to the club's.
    const cols = select("board-tv-champions-columns");
    expect([...cols.options].map((o) => o.textContent)).toEqual(["Default · 3", "1", "2", "3"]);
    // Credits roll by default: roll speed shows, rows per page doesn't.
    expect(select("board-tv-champions-move").options[0]!.textContent).toBe(
      "Default · Credits roll",
    );
    expect(screen.getByTestId("board-tv-champions-speed")).toBeTruthy();
    expect(screen.queryByTestId("board-tv-champions-perpage")).toBeNull();

    fireEvent.change(select("board-tv-champions-move"), { target: { value: "pages" } });
    expect(screen.getByTestId("board-tv-champions-perpage")).toBeTruthy();
    expect(screen.queryByTestId("board-tv-champions-speed")).toBeNull();

    // A team board has no columns to choose.
    fireEvent.click(screen.getByTestId("seq-select-1"));
    expect(screen.queryByTestId("board-tv-team-columns")).toBeNull();

    // The sponsor wall points to its own tab.
    fireEvent.click(screen.getByTestId("seq-select-2"));
    expect(screen.getByTestId("rotation-item-panel").textContent).toContain("Sponsors & ads tab");
  });

  it("saves a board's own settings and resets them to the club defaults", async () => {
    installApiMock({
      "/honour-display": bundle({
        boardConfigs: { champions: { heading: "Champions", move: "fit" } },
      }),
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    fireEvent.click(await screen.findByTestId("seq-select-0"));
    expect(select("board-tv-champions-move").value).toBe("fit");

    fireEvent.click(screen.getByTestId("board-tv-reset-champions"));
    expect(select("board-tv-champions-move").value).toBe("");
    fireEvent.change(select("board-tv-champions-size"), { target: { value: "XL" } });
    fireEvent.change(screen.getByTestId("board-tv-champions-hold"), { target: { value: "7" } });

    const body = await sentBody();
    expect(body.boardConfigs.champions).toEqual({ heading: "Champions", size: "XL", hold: 7 });
  });

  it("edits the club's TV defaults on the Look tab, and boards follow them", async () => {
    installApiMock({ "/honour-display": bundle({ kioskLook: { trans: "wipe" } }) });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    fireEvent.mouseDown(await screen.findByTestId("tab-look"));
    expect(select("look-trans").value).toBe("wipe");
    // Unset timings show what the TV uses now: the legacy 3.5 s dwell, rounded.
    expect((screen.getByTestId("look-pagesecs") as HTMLInputElement).placeholder).toBe(
      "Default · 4",
    );
    fireEvent.change(select("look-move"), { target: { value: "pages" } });

    fireEvent.mouseDown(screen.getByTestId("tab-rotation"));
    fireEvent.click(await screen.findByTestId("seq-select-0"));
    expect(select("board-tv-champions-move").options[0]!.textContent).toBe("Default · Pages");
    expect(select("board-tv-champions-trans").options[0]!.textContent).toBe("Default · Wipe");

    expect((await sentBody()).kioskLook).toEqual({ trans: "wipe", move: "pages" });
  });
});

describe("live preview (kiosk redesign B4)", () => {
  const champions = {
    id: "champions",
    category: "awards",
    layout: "list" as const,
    title: "Club Champions",
    entries: [],
    display: { columns: 1, transition: "scroll" as const, fit: false },
  };
  const WITH_ROTATION: HonourDisplayBundle = {
    ...BUNDLE,
    boards: [champions],
    settings: { ...BUNDLE.settings, kioskSequence: ["champions", "sponsor"] },
  };

  /** Marks the preview frame ready and returns what the page posts to it. */
  function connectFrame() {
    const frame = screen.getByTestId("kiosk-preview-frame") as HTMLIFrameElement;
    const win = frame.contentWindow!;
    const post = vi.spyOn(win, "postMessage");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "ovation:kiosk-preview-ready" },
          origin: window.location.origin,
          source: win,
        }),
      );
    });
    return async () => {
      await waitFor(() => expect(post).toHaveBeenCalled());
      const [msg, origin] = post.mock.calls.at(-1)!;
      expect(origin).toBe(window.location.origin);
      post.mockClear();
      return msg as { bundle: HonourDisplayBundle };
    };
  }

  it("plays the selected item, then the whole rotation, with unsaved changes", async () => {
    installApiMock({ "/honour-display": WITH_ROTATION });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    await screen.findByTestId("seq-row-0");
    const nextMessage = connectFrame();

    // Nothing selected: the whole saved rotation.
    let sent = await nextMessage();
    expect(sent.bundle.settings.kioskSequence).toEqual(["champions", "sponsor"]);
    expect(screen.queryByTestId("kiosk-preview-unsaved")).toBeNull();

    // Select a board and change it without saving: the preview replays just it.
    fireEvent.click(screen.getByTestId("seq-select-0"));
    fireEvent.change(screen.getByTestId("board-tv-champions-move"), {
      target: { value: "pages" },
    });
    sent = await nextMessage();
    expect(sent.bundle.settings.kioskSequence).toEqual(["champions"]);
    expect(sent.bundle.settings.boardConfigs.champions).toEqual({ move: "pages" });
    expect(screen.getByTestId("kiosk-preview-now").textContent).toBe("Club Champions");
    expect(screen.getByTestId("kiosk-preview-unsaved")).toBeTruthy();

    fireEvent.click(screen.getByTestId("kiosk-preview-rotation"));
    sent = await nextMessage();
    expect(sent.bundle.settings.kioskSequence).toEqual(["champions", "sponsor"]);
    expect(screen.getByTestId("kiosk-preview-now").textContent).toBe("Whole rotation");

    // Discard returns the preview to the saved settings.
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    sent = await nextMessage();
    expect(sent.bundle.settings.boardConfigs).toEqual({});
    expect(screen.queryByTestId("kiosk-preview-unsaved")).toBeNull();
  });
});
