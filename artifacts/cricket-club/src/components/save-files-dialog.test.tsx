/** The "your images are ready" dialog that finishes a save when iOS needs a fresh tap. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/share-card", () => ({ downloadBlob: vi.fn() }));

import { SaveFilesDialog } from "./save-files-dialog";
import { clearPendingSave, getPendingSave, saveFiles, toFile } from "@/lib/save-files";

const png = (name: string) => toFile(new Blob(["x"], { type: "image/png" }), name);

/** An iPhone whose first share call has lost its tap, and whose next ones work. */
function iphone() {
  const share = vi
    .fn<(data?: ShareData) => Promise<void>>()
    .mockRejectedValueOnce(Object.assign(new Error("needs a tap"), { name: "NotAllowedError" }))
    .mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    maxTouchPoints: 5,
    canShare: () => true,
    share,
  });
  return share;
}

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => clearPendingSave());
});

describe("SaveFilesDialog", () => {
  it("stays closed until a save needs another tap", () => {
    render(<SaveFilesDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shares every slide from a fresh tap, then closes", async () => {
    const share = iphone();
    render(<SaveFilesDialog />);
    const files = [png("001-cover.png"), png("002-a-grade.png")];
    await act(async () => {
      await saveFiles(files, { zipName: "set.zip" });
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save 2 to Photos" }));
    await waitFor(() => expect(getPendingSave()).toBeNull());
    expect(share).toHaveBeenLastCalledWith({ files });
  });

  it("can save one slide on its own and stays open for the rest", async () => {
    const share = iphone();
    render(<SaveFilesDialog />);
    const files = [png("001-cover.png"), png("002-a-grade.png")];
    await act(async () => {
      await saveFiles(files, { zipName: "set.zip" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Save 002-a-grade.png" }));
    await waitFor(() => expect(share).toHaveBeenLastCalledWith({ files: [files[1]] }));
    expect(getPendingSave()).not.toBeNull();
  });
});
