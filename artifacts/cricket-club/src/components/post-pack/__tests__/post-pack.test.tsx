/**
 * Social Studio U10 — the post pack button: a phone that can share files gets
 * a Share tap (images to the share sheet, caption to the clipboard); anything
 * else downloads the zip.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { PostPackButton } from "../post-pack-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PACK = {
  images: [
    { size: "square", url: "/api/storage/objects/library/sq" },
    { size: "story", url: "/api/storage/objects/library/st" },
  ],
  caption: "Sam Keeper 104* #GoClub",
  zipUrl: "/api/storage/objects/library/pack.zip",
};

const DRAFT = {
  id: 7,
  engine: "milestone",
  status: "ready",
  cardInput: { kind: "century", playerName: "Sam Keeper" },
  appPath: "/players/1",
  sourceMatchIsJunior: false,
  createdAt: "2026-09-20T10:00:00Z",
} as never;

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url.includes("/post-pack")) {
      return new Response(JSON.stringify(PACK), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PostPackButton", () => {
  it("with file sharing, the Share tap shares the PNGs and copies the caption", async () => {
    stubFetch();
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      canShare: () => true,
      share,
      clipboard: { writeText },
    });
    renderAt(<PostPackButton draft={DRAFT} />);
    fireEvent.click(screen.getByRole("button", { name: "Post pack" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const files = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files;
    expect(files.map((f) => f.name)).toEqual(["century-square.png", "century-story.png"]);
    expect(writeText).toHaveBeenCalledWith(PACK.caption);
  });

  it("without file sharing, it offers the zip download", async () => {
    stubFetch();
    vi.stubGlobal("navigator", { ...navigator, canShare: undefined });
    renderAt(<PostPackButton draft={DRAFT} />);
    fireEvent.click(screen.getByRole("button", { name: "Post pack" }));
    const link = await screen.findByRole("link", { name: /Download zip/ });
    expect(link.getAttribute("href")).toBe(PACK.zipUrl);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});
