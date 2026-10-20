import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { CardSize, PhotoTransform, ShareCardInput } from "@/lib/share-card";

/**
 * The Share to Socials still preview (task T0.1). A change that both re-renders
 * and invalidates the cache (the default layout loading, the photo gallery
 * resolving, the debounced photo transform settling) used to leave the tile on
 * "Preparing preview…": the render effect saw the old cached URL and bailed,
 * then the invalidate effect revoked and cleared it, and nothing rendered again.
 */

const renderShareCard = vi.fn(async (_input: unknown, opts: { size: CardSize }) => {
  return new Blob([opts.size], { type: "image/png" });
});
vi.mock("@/lib/share-card", () => ({
  renderShareCard: (input: unknown, opts: { size: CardSize }) => renderShareCard(input, opts),
}));

const { useCardPreview } = await import("./use-card-preview");

const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const TRANSFORM: PhotoTransform = { focalX: 0.5, focalY: 0.5, zoom: 1 } as PhotoTransform;
const input = { kind: "teamOfWeek", title: "Team of the week" } as unknown as ShareCardInput;

let nextUrl = 0;
const revoked: string[] = [];

beforeEach(() => {
  nextUrl = 0;
  revoked.length = 0;
  renderShareCard.mockClear();
  URL.createObjectURL = vi.fn(() => `blob:preview-${++nextUrl}`);
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
});

type Props = {
  open: boolean;
  animated: boolean;
  activeSize: CardSize;
  layoutSig: string;
  sponsorSig: string;
};

// Mirrors the orchestrator's wiring: `layoutSig` sits in both dependency lists,
// `sponsorSig` only in the invalidation list.
function useHarness(p: Props) {
  return useCardPreview({
    open: p.open,
    input,
    animated: p.animated,
    activeSize: p.activeSize,
    renderTransform: TRANSFORM,
    buildOpts: (size) => ({ size }) as never,
    renderDeps: [p.open, input, p.activeSize, p.layoutSig],
    invalidateDeps: [input, p.layoutSig, p.sponsorSig],
  });
}

const base: Props = {
  open: true,
  animated: false,
  activeSize: "square",
  layoutSig: "builtin",
  sponsorSig: "",
};

describe("useCardPreview", () => {
  it("renders a preview for every size the modal offers", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), { initialProps: base });
    for (const size of SIZES) {
      rerender({ ...base, activeSize: size });
      await waitFor(() => expect(result.current.previewUrls[size]).toBeTruthy());
    }
    expect(renderShareCard.mock.calls.map(([, o]) => o.size)).toEqual(SIZES);
    expect(result.current.rendering).toBe(false);
  });

  it("re-renders after a change that also invalidates the cached preview", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), { initialProps: base });
    await waitFor(() => expect(result.current.previewUrls.square).toBe("blob:preview-1"));

    // e.g. the club's default layout template resolves after the modal opens.
    rerender({ ...base, layoutSig: "template-7" });

    await waitFor(() => expect(result.current.previewUrls.square).toBe("blob:preview-2"));
    expect(revoked).toContain("blob:preview-1");
    expect(renderShareCard).toHaveBeenCalledTimes(2);
    expect(result.current.rendering).toBe(false);
  });

  it("re-renders after a change that only invalidates the cache", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), { initialProps: base });
    await waitFor(() => expect(result.current.previewUrls.square).toBe("blob:preview-1"));

    rerender({ ...base, sponsorSig: "4 Life Physiotherapy" });

    await waitFor(() => expect(result.current.previewUrls.square).toBe("blob:preview-2"));
    expect(revoked).toContain("blob:preview-1");
  });

  it("keeps cached sizes when nothing that affects the render changed", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), { initialProps: base });
    await waitFor(() => expect(result.current.previewUrls.square).toBeTruthy());
    rerender({ ...base, activeSize: "story" });
    await waitFor(() => expect(result.current.previewUrls.story).toBeTruthy());
    rerender({ ...base, activeSize: "square" });

    expect(result.current.previewUrls.square).toBe("blob:preview-1");
    expect(renderShareCard).toHaveBeenCalledTimes(2);
  });

  it("releases every preview when the modal closes and renders afresh on reopen", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), { initialProps: base });
    await waitFor(() => expect(result.current.previewUrls.square).toBe("blob:preview-1"));

    rerender({ ...base, open: false });
    await waitFor(() => expect(result.current.previewUrls.square).toBeNull());
    expect(revoked).toContain("blob:preview-1");

    rerender(base);
    await waitFor(() => expect(result.current.previewUrls.square).toBe("blob:preview-2"));
  });

  it("does not render a still for an animated card", async () => {
    const { result } = renderHook((p: Props) => useHarness(p), {
      initialProps: { ...base, animated: true },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(renderShareCard).not.toHaveBeenCalled();
    expect(result.current.previewUrls.square).toBeNull();
    expect(result.current.rendering).toBe(false);
  });
});
