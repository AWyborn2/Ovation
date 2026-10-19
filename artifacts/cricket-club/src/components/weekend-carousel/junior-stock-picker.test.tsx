import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClubPhoto } from "@workspace/api-client-react";
import { JuniorStockPicker } from "./junior-stock-picker";

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/components/social-queue/library-upload", () => ({ uploadLibraryPhotos: upload }));

describe("carousel stock image library", () => {
  it("uploads as approved stock, refreshes saved images, and applies an image or no image", async () => {
    upload.mockImplementationOnce(async (_files, opts) => opts.onState(0, { phase: "done" }));
    const refresh = vi.fn(async () => {});
    const apply = vi.fn();
    const props = { disabled: false, canApply: true, onUploaded: refresh, onApply: apply };
    const { rerender } = render(<JuniorStockPicker {...props} photos={[]} />);
    fireEvent.change(screen.getByLabelText("Upload carousel stock image"), {
      target: { files: [new File(["stock"], "club.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(upload.mock.calls[0][1]).toMatchObject({ juniorStock: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    rerender(<JuniorStockPicker {...props} photos={[{ id: 42, thumbUrl: "/stock.jpg" } as ClubPhoto]} />);
    fireEvent.click(screen.getByRole("button", { name: "Use stock image 1 for all team cards" }));
    expect(apply).toHaveBeenLastCalledWith(42);
    fireEvent.click(screen.getByRole("button", { name: "No image on team cards" }));
    expect(apply).toHaveBeenLastCalledWith(null);
  });
  it("shows an upload failure without claiming it saved", async () => {
    upload.mockImplementationOnce(async (_files, opts) =>
      opts.onState(0, { phase: "error", message: "Image could not be converted." }));
    render(<JuniorStockPicker photos={[]} disabled={false} canApply={false}
      onUploaded={async () => {}} onApply={() => {}} />);
    fireEvent.change(screen.getByLabelText("Upload carousel stock image"), {
      target: { files: [new File(["bad"], "bad.png")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be converted");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
