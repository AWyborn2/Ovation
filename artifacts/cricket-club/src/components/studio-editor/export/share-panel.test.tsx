import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EditorSlide } from "@/components/studio-editor/set-doc";

const renderDownload = vi.fn(async () => new Blob(["x"], { type: "image/png" }));
const saveFiles = vi.fn(async (_files: File[], _opts: { zipName: string }) => "downloaded");
vi.mock("./download", () => ({
  renderDownload: (...a: unknown[]) => renderDownload(...(a as [])),
}));
vi.mock("@/lib/save-files", () => ({
  saveFiles: (files: File[], opts: { zipName: string }) => saveFiles(files, opts),
  toFile: (blob: Blob, name: string) => new File([blob], name),
}));

const { SharePanel } = await import("./share-panel");

const slide = (key: string, junior = false): EditorSlide =>
  ({
    key,
    label: key,
    page: { id: key, kind: "teamList", page: "team", role: "repeat", slot: "team" },
    input: { kind: "teamList", junior, photoUrl: "/p.jpg" },
    data: {},
    junior,
    sponsorsOn: true,
    design: false,
  }) as unknown as EditorSlide;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Share panel", () => {
  it("downloads every slide as a zip named after the set, numbered in order", async () => {
    render(
      <SharePanel
        name="Match Day: R5"
        set={{
          slides: [slide("a"), slide("b"), slide("c", true)],
          current: "b",
          size: "portrait",
          documentFor: () => ({}),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByText("Size: 1080 × 1350")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download 3 images" }));
    await waitFor(() => expect(saveFiles).toHaveBeenCalled());
    const [files, opts] = saveFiles.mock.calls[0]!;
    expect(files.map((f) => f.name)).toEqual([
      "match-day-r5-01.png",
      "match-day-r5-02.png",
      "match-day-r5-03.png",
    ]);
    expect(opts.zipName).toBe("match-day-r5.zip");
    // The junior slide renders without the photo it has no consent for.
    const third = (
      renderDownload.mock.calls[2] as unknown as [{ input: { photoUrl: unknown } }]
    )[0];
    expect(third.input.photoUrl).toBeNull();
  });

  it("downloads just the slide on show as a JPG", async () => {
    render(
      <SharePanel
        name="Results"
        set={{
          slides: [slide("a"), slide("b")],
          current: "b",
          size: "square",
          documentFor: () => ({}),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "This page" }));
    fireEvent.click(screen.getByRole("button", { name: "JPG" }));
    fireEvent.click(screen.getByRole("button", { name: "Download 1 image" }));
    await waitFor(() => expect(saveFiles).toHaveBeenCalled());
    expect(saveFiles.mock.calls[0]![0].map((f) => f.name)).toEqual(["results-02.jpg"]);
  });
});
