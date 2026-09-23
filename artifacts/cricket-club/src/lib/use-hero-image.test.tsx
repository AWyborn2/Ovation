import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ClubBrand } from "@workspace/scorecard";

let brand: ClubBrand = { name: "Test FC" };
vi.mock("@/lib/brand-context", () => ({ useBrand: () => brand }));

const { useHeroImage, useExploreImage } = await import("./use-hero-image");

describe("useHeroImage / useExploreImage (Broadcast AE5)", () => {
  it("returns null when the tenant has uploaded no imagery", () => {
    brand = { name: "No Photos FC", heroImages: null };
    expect(renderHook(() => useHeroImage("home")).result.current).toBeNull();
    expect(renderHook(() => useExploreImage("players")).result.current).toBeNull();
  });

  it("returns the uploaded URL for a filled slot and null for an empty one", () => {
    brand = {
      name: "Photo FC",
      heroImages: {
        home: "/api/storage/objects/h.webp",
        juniors: "",
        explore: { players: "/api/storage/objects/p.webp" },
      },
    };
    expect(renderHook(() => useHeroImage("home")).result.current).toBe(
      "/api/storage/objects/h.webp",
    );
    // An empty string counts as unset.
    expect(renderHook(() => useHeroImage("juniors")).result.current).toBeNull();
    expect(renderHook(() => useExploreImage("players")).result.current).toBe(
      "/api/storage/objects/p.webp",
    );
    expect(renderHook(() => useExploreImage("honours")).result.current).toBeNull();
  });
});
