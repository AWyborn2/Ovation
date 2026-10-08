import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CarouselPreview } from "./carousel-preview";
import type { QueuedCarousel } from "@workspace/scorecard/queued-carousel";

vi.mock("@/components/weekend-carousel/slide-preview", () => ({
  SlidePreview: ({ slide, size }: { slide: { label: string }; size: string }) =>
    <div data-testid="saved-preview">{slide.label} · {size}</div>,
}));

describe("queued carousel review", () => {
  it("reviews every saved slide in order, in the selected format", () => {
    const carousel = { version: 1, size: "portrait", submissionId: crypto.randomUUID(),
      slides: ["Cover", "A Grade", "Sponsors"].map((label, i) => ({
        id: String(i), label, input: { kind: "matchDay" }, data: {},
        junior: false, sponsorsOn: true, warnings: [],
      })),
    } as QueuedCarousel;
    render(<CarouselPreview carousel={carousel} />);
    expect(screen.getByTestId("saved-preview")).toHaveTextContent("Cover · portrait");
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByTestId("saved-preview")).toHaveTextContent("A Grade · portrait");
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByTestId("saved-preview")).toHaveTextContent("Sponsors · portrait");
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });
});
