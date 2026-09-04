import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { KioskAd } from "@workspace/api-client-react";
import { AdSlide } from "./sponsor-ads";

/** U3 — Kiosk renders MP4 ad creatives full-screen (R4, R5). */

function ad(overrides: Partial<KioskAd> = {}): KioskAd {
  return { id: "ad:1", name: "Test ad", imageUrl: "/api/storage/x", ...overrides };
}

describe("AdSlide", () => {
  it("renders a video element for a video ad", () => {
    const { container } = render(
      <AdSlide ad={ad({ imageUrl: "/api/storage/x.mp4", mediaType: "video" })} />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("/api/storage/x.mp4");
    expect(video).toHaveProperty("muted", true);
    expect(video?.hasAttribute("loop")).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(true);
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an img for an image ad (mediaType: image)", () => {
    const { container } = render(<AdSlide ad={ad({ mediaType: "image" })} />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders an img for a legacy ad with no mediaType", () => {
    const { container } = render(<AdSlide ad={ad()} />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("calls onError when the video fails to load", () => {
    const onError = vi.fn();
    const { container } = render(
      <AdSlide ad={ad({ mediaType: "video" })} onError={onError} />,
    );
    const video = container.querySelector("video")!;
    fireEvent.error(video);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
