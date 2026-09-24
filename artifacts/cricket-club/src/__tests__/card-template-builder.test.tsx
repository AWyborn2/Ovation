/**
 * The "Custom tile templates" list is for uploaded backgrounds. Built-in design
 * packs share the card_templates table but have no background image, so when
 * they were listed here every one showed as a broken thumbnail.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { TemplatesCard } from "@/components/card-template-builder";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (over: Record<string, unknown>) => ({
  cardKinds: [],
  slots: [],
  isActive: true,
  isDefault: false,
  defaultForKinds: [],
  backgroundKind: "image",
  motionPreset: "none",
  bgWidth: 1080,
  bgHeight: 1080,
  layers: [],
  displayOrder: 0,
  ...over,
});

describe("TemplatesCard", () => {
  it("lists uploaded backgrounds only, never the built-in packs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              row({
                id: 1,
                name: "Broadcast Dark — Square",
                source: "pack",
                backgroundImageUrl: null,
              }),
              row({ id: 2, name: "Old layer design", source: "layers", backgroundImageUrl: null }),
              row({
                id: 3,
                name: "Our Canva result",
                source: "background",
                backgroundImageUrl: "/api/storage/objects/bg.png",
              }),
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    renderAt(<TemplatesCard />, "/admin/social/cards");
    expect(await screen.findByText("Our Canva result")).toBeTruthy();
    expect(screen.queryByText("Broadcast Dark — Square")).toBeNull();
    expect(screen.queryByText("Old layer design")).toBeNull();
    // Every thumbnail left points at a real image.
    for (const img of document.querySelectorAll("img")) {
      expect(img.getAttribute("src")).toBeTruthy();
    }
  });
});
