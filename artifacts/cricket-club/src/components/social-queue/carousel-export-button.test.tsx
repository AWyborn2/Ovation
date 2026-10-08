import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CarouselExportButton } from "./carousel-export-button";

const { create, download } = vi.hoisted(() => ({ create: vi.fn(), download: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({ createPostPack: create }));
vi.mock("@/lib/share-card", () => ({ downloadBlob: download }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("queue carousel export", () => {
  it("downloads the saved draft ZIP without opening the row or changing status", async () => {
    create.mockResolvedValue({ zipUrl: "/api/storage/carousel.zip" });
    const blob = new Blob(["zip"], { type: "application/zip" });
    const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetcher);
    const open = vi.fn();
    render(<div onClick={open}><CarouselExportButton draftId={42} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Export ZIP" }));
    expect(screen.getByRole("button", { name: "Exporting…" })).toBeDisabled();
    await waitFor(() => expect(download).toHaveBeenCalledWith(blob, "weekend-carousel-42.zip"));
    expect(create).toHaveBeenCalledExactlyOnceWith(42);
    expect(fetcher).toHaveBeenCalledWith("/api/storage/carousel.zip", { credentials: "include" });
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Export ZIP" })).toBeEnabled();
  });

  it("reports rendering failure and allows retry", async () => {
    create.mockRejectedValueOnce(new Error("render failed"))
      .mockResolvedValueOnce({ zipUrl: "/api/storage/retry.zip" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, blob: async () => new Blob(["zip"]),
    }));
    render(<CarouselExportButton draftId={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Export ZIP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Export ZIP" }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([false, true])("does not download a failed or empty response (ok=%s)", async ok => {
    create.mockResolvedValue({ zipUrl: "/api/storage/broken.zip" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, blob: async () => new Blob() }));
    render(<CarouselExportButton draftId={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Export ZIP" }));
    await screen.findByRole("alert");
    expect(download).not.toHaveBeenCalled();
  });
});
