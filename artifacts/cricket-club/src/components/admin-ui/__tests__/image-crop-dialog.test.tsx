/**
 * Social Studio U23 — the shared image crop dialog: low-resolution warning,
 * the image always covers the frame, HEIC converts before cropping, and the
 * cropped file reaches the caller.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import {
  ImageCropDialog,
  HEADSHOT_ASPECTS,
  SPONSOR_ASPECTS,
} from "@/components/admin-ui/image-crop-dialog";
import {
  centredOffset,
  clampOffset,
  cropRect,
  isLowResolution,
  zoomAroundCentre,
} from "@/lib/crop-math";
import { renderAt } from "@/test/render";

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const frame = { width: 320, height: 320 };

describe("crop maths", () => {
  it("never lets the image leave empty space in the frame", () => {
    const image = { width: 1600, height: 900 };
    for (const zoom of [1, 1.7, 4]) {
      for (const probe of [
        { x: 5000, y: 5000 },
        { x: -5000, y: -5000 },
        { x: 0, y: -99999 },
      ]) {
        const o = clampOffset(probe, image, frame, zoom);
        const r = cropRect(o, image, frame, zoom);
        expect(r.x).toBeGreaterThanOrEqual(-1e-9);
        expect(r.y).toBeGreaterThanOrEqual(-1e-9);
        expect(r.x + r.width).toBeLessThanOrEqual(image.width + 1e-9);
        expect(r.y + r.height).toBeLessThanOrEqual(image.height + 1e-9);
      }
    }
  });

  it("zooming out from a panned corner stays covered", () => {
    const image = { width: 1200, height: 1200 };
    let o = clampOffset({ x: -99999, y: -99999 }, image, frame, 4);
    o = zoomAroundCentre(o, image, frame, 4, 1);
    expect(o).toEqual(centredOffset(image, frame, 1));
  });

  it("flags crops smaller than the suggested size", () => {
    expect(isLowResolution({ width: 400, height: 400 }, { width: 800, height: 800 })).toBe(true);
    expect(isLowResolution({ width: 800, height: 800 }, { width: 800, height: 800 })).toBe(false);
  });
});

function open(props: Partial<Parameters<typeof ImageCropDialog>[0]> = {}) {
  const onCropped = vi.fn();
  const utils = renderAt(
    <ImageCropDialog
      open
      onOpenChange={() => {}}
      title="Upload headshot"
      aspects={HEADSHOT_ASPECTS}
      suggestedWidth={800}
      onCropped={onCropped}
      loadImage={async () => ({ width: 1200, height: 1200 })}
      renderCrop={async () => new Blob(["x"], { type: "image/jpeg" })}
      {...props}
    />,
  );
  return { onCropped, ...utils };
}

const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText("Choose an image"), { target: { files: [file] } });

const jpeg = new File(["x"], "face.jpg", { type: "image/jpeg" });

describe("ImageCropDialog", () => {
  it("warns on a 400×400 headshot but not a 1200×1200 one", async () => {
    open({ loadImage: async () => ({ width: 400, height: 400 }) });
    choose(jpeg);
    expect(await screen.findByText(/Low resolution/)).toBeTruthy();
    cleanup();

    open({ loadImage: async () => ({ width: 1200, height: 1200 }) });
    choose(jpeg);
    await screen.findByTestId("crop-frame");
    expect(screen.queryByText(/Low resolution/)).toBeNull();
  });

  it("zooming to 4× and panning never exposes empty space", async () => {
    open({ aspects: SPONSOR_ASPECTS, loadImage: async () => ({ width: 1600, height: 900 }) });
    choose(jpeg);
    const frameEl = await screen.findByTestId("crop-frame");
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "4" } });
    for (let i = 0; i < 200; i++) fireEvent.keyDown(frameEl, { key: "ArrowLeft", shiftKey: true });
    for (let i = 0; i < 200; i++) fireEvent.keyDown(frameEl, { key: "ArrowUp", shiftKey: true });
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "1" } });

    const img = screen.getByTestId("crop-image");
    const fw = parseFloat(frameEl.style.width);
    const fh = parseFloat(frameEl.style.height);
    const left = parseFloat(img.style.left);
    const top = parseFloat(img.style.top);
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(left + parseFloat(img.style.width)).toBeGreaterThanOrEqual(fw - 1e-6);
    expect(top + parseFloat(img.style.height)).toBeGreaterThanOrEqual(fh - 1e-6);
  });

  it("converts a HEIC file before the crop step", async () => {
    const convertHeic = vi.fn(async () => ({
      src: "/api/storage/objects/library/9",
      size: { width: 3024, height: 4032 },
    }));
    const loadImage = vi.fn(async () => ({ width: 1, height: 1 }));
    open({ convertHeic, loadImage });
    choose(new File(["x"], "IMG_0042.HEIC", { type: "" }));
    await screen.findByTestId("crop-frame");
    expect(convertHeic).toHaveBeenCalledOnce();
    expect(loadImage).not.toHaveBeenCalled();
    expect(screen.getByTestId("crop-image").getAttribute("src")).toBe(
      "/api/storage/objects/library/9",
    );
  });

  it("hands the cropped file to the caller", async () => {
    const { onCropped } = open();
    choose(jpeg);
    await screen.findByTestId("crop-frame");
    fireEvent.click(screen.getByRole("button", { name: "Use image" }));
    await waitFor(() => expect(onCropped).toHaveBeenCalledOnce());
    const file = onCropped.mock.calls[0][0] as File;
    expect(file.type).toBe("image/jpeg");
  });

  it("offers sponsor shapes and reshapes the frame", async () => {
    open({ aspects: SPONSOR_ASPECTS });
    choose(jpeg);
    const frameEl = await screen.findByTestId("crop-frame");
    expect(frameEl.style.height).toBe("160px");
    fireEvent.click(screen.getByRole("radio", { name: "1:1" }));
    expect(screen.getByTestId("crop-frame").style.height).toBe("320px");
  });

  it("hands pass-through files (SVG logos) over uncropped", async () => {
    const { onCropped } = open({ passThrough: (f) => f.type === "image/svg+xml" });
    const svg = new File(["<svg/>"], "crest.svg", { type: "image/svg+xml" });
    choose(svg);
    await waitFor(() => expect(onCropped).toHaveBeenCalledWith(svg));
    expect(screen.queryByTestId("crop-frame")).toBeNull();
  });
});
