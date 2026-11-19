/**
 * Round 9 B13: the editor's Download never writes a blank file. A design on
 * the blank base that draws other sizes but not the one on show (card 1022,
 * an OMG T20 Match Summary with no Story layers) is refused with a clear
 * message, before anything renders; every size it draws still downloads.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ShareCardInput } from "@/lib/share-card";

const createCardRenderStill = vi.fn(async () => new Blob(["x"], { type: "image/png" }));
vi.mock("@workspace/api-client-react", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  createCardRenderStill: (...a: unknown[]) => createCardRenderStill(...(a as [])),
}));
const saveFile = vi.fn(async () => "downloaded");
vi.mock("@/lib/save-files", () => ({ saveFile: (...a: unknown[]) => saveFile(...(a as [])) }));

const { DownloadMenu } = await import("./download-menu");
const { downloadRefusal, renderDownload } = await import("./download");

const box = { x: 5, y: 5, w: 90, h: 20 };
const t20 = {
  layers: [
    {
      id: "t20",
      kind: "shape",
      sizes: ["square", "portrait", "landscape"],
      geometry: { square: box, portrait: box, landscape: box },
    },
  ],
};
const input = { kind: "matchSummary" } as unknown as ShareCardInput;
const card = (size: "portrait" | "story", over: object = {}) => ({
  input,
  size,
  theme: null,
  data: null,
  packId: "blank",
  adjustments: t20 as never,
  ...over,
});
const STORY_REFUSAL =
  "This design has no Story size, so there's nothing to download at Story. Pick a size it has in Format.";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("downloadRefusal", () => {
  it("refuses a size the design doesn't draw, and only that", () => {
    expect(downloadRefusal(card("story"))).toBe(STORY_REFUSAL);
    expect(downloadRefusal(card("portrait"))).toBeNull();
  });

  it("never refuses a pack card, or a design with no layers yet", () => {
    expect(downloadRefusal(card("story", { packId: "broadcast-dark-v1" }))).toBeNull();
    expect(downloadRefusal(card("story", { adjustments: null }))).toBeNull();
    expect(downloadRefusal(card("story", { adjustments: { layers: [] } }))).toBeNull();
  });

  it("renderDownload throws it before asking the server for anything", async () => {
    await expect(renderDownload(card("story"), "png", 1)).rejects.toThrow(STORY_REFUSAL);
    expect(createCardRenderStill).not.toHaveBeenCalled();
    await renderDownload(card("portrait"), "png", 1);
    expect(createCardRenderStill).toHaveBeenCalledTimes(1);
  });
});

describe("Download menu", () => {
  it("says why and disables Download at a size the design doesn't draw", () => {
    render(<DownloadMenu card={card("story")} baseName="t20" />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getByRole("alert")).toHaveTextContent(STORY_REFUSAL);
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeDisabled();
  });

  it("downloads a size the design draws", async () => {
    render(<DownloadMenu card={card("portrait")} baseName="t20" />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.queryByRole("alert")).toBeNull();
    const go = screen.getByRole("button", { name: "Download PNG" });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
  });
});
