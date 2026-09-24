/**
 * Social Studio U18 — the editor's Download menu: stills go to the server
 * harness with the chosen format and scale; clips run as a job with the
 * card's animations, then download the finished file.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { DownloadMenu } from "@/components/studio-editor/export/download-menu";
import { downloadFilename, outputSize } from "@/components/studio-editor/export/download";
import { renderAt } from "@/test/render";
import type { ShareCardInput } from "@/lib/share-card";

vi.mock("@/lib/share-card", async (orig) => ({
  ...(await orig<typeof import("@/lib/share-card")>()),
  downloadBlob: vi.fn(),
}));
import { downloadBlob } from "@/lib/share-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(downloadBlob).mockClear();
});

type Req = { method: string; url: string; body: unknown };

function stubApi(): Req[] {
  const requests: Req[] = [];
  let polls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      const json = (payload: unknown, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (/card-renders\/still/.test(url))
        return new Response(new Blob(["x"]), { headers: { "content-type": "image/png" } });
      if (/card-video\/jobs\/j1\/download/.test(url))
        return new Response(new Blob(["v"]), { headers: { "content-type": "video/mp4" } });
      if (/card-video\/jobs\/j1/.test(url)) {
        polls += 1;
        return json({ id: "j1", status: polls > 1 ? "done" : "rendering", progress: 0.5 });
      }
      if (/card-video\/jobs/.test(url))
        return json({ id: "j1", status: "queued", progress: 0 }, 201);
      return json([]);
    }),
  );
  return requests;
}

const card = {
  input: { kind: "century", playerName: "Sam Keeper", runs: 104 } as unknown as ShareCardInput,
  size: "portrait" as const,
  theme: null,
  data: null,
  packId: "broadcast-dark",
  adjustments: { fields: { headline: "TON UP" } },
};

function open() {
  const requests = stubApi();
  renderAt(<DownloadMenu card={card} baseName="club-sam" />, "/admin/social/editor/7");
  fireEvent.click(screen.getByRole("button", { name: /^download$/i }));
  return requests;
}

describe("DownloadMenu", () => {
  it("downloads a PNG at 1× by default, with the editor's adjustments", async () => {
    const requests = open();
    expect(screen.getByText(/1080 × 1350 px/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /download png/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const still = requests.find((r) => /card-renders\/still/.test(r.url))!;
    expect(still.body).toMatchObject({
      format: "png",
      scale: 1,
      options: { size: "portrait", packId: "broadcast-dark", adjustments: card.adjustments },
    });
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("club-sam-1080x1350.png");
  });

  it("JPG at 2× asks for that format and scale and shows the pixel size", async () => {
    const requests = open();
    fireEvent.click(screen.getByRole("button", { name: "JPG" }));
    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    expect(screen.getByText(/2160 × 2700 px/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /download jpg/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(requests.find((r) => /card-renders\/still/.test(r.url))!.body).toMatchObject({
      format: "jpg",
      scale: 2,
    });
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("club-sam-1080x1350@2x.jpg");
  });

  it("MP4 runs a clip job of the animated pack card, then downloads it", async () => {
    const requests = open();
    fireEvent.click(screen.getByRole("button", { name: "MP4" }));
    fireEvent.click(screen.getByRole("button", { name: /download mp4/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled(), { timeout: 3000 });
    const job = requests.find((r) => r.method === "POST" && /card-video\/jobs$/.test(r.url))!;
    expect(job.body).toMatchObject({ format: "mp4", scale: 1, options: { pack: true } });
    expect(requests.some((r) => /jobs\/j1\/download/.test(r.url))).toBe(true);
  });

  it("PDF ignores scale", () => {
    expect(outputSize("square", "pdf", 3)).toEqual({ w: 1080, h: 1080 });
    expect(downloadFilename("c", "square", "pdf", 3)).toBe("c-1080x1080.pdf");
  });
});
