import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CarouselPreview } from "./carousel-preview";
import type { QueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";

vi.mock("@/components/weekend-carousel/slide-preview", () => ({
  SlidePreview: ({
    slide,
    size,
    packId,
  }: {
    slide: { label: string };
    size: string;
    packId: string;
  }) => (
    <div data-testid="saved-preview" data-pack={packId}>
      {slide.label} · {size}
    </div>
  ),
}));

describe("queued carousel review", () => {
  it.each([...CAROUSEL_PACK_IDS, undefined])(
    "previews saved %s on cover, content and closing pages",
    (packId) => {
      cleanup();
      const carousel = {
        version: 1,
        size: "square",
        packId,
        submissionId: crypto.randomUUID(),
        slides: ["Cover", "Content", "Sponsors"].map((id) => ({
          id,
          label: id,
          input: {},
          data: {},
          junior: false,
          sponsorsOn: false,
          warnings: [],
        })),
      } as QueuedCarousel;
      render(<CarouselPreview carousel={carousel} />);
      for (let i = 0; i < 3; i++) {
        expect(screen.getByTestId("saved-preview")).toHaveAttribute(
          "data-pack",
          packId ?? "club-kit-v1",
        );
        if (i < 2) fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
      }
      cleanup();
    },
  );
  it("reviews every saved slide in order, in the selected format", () => {
    const carousel = {
      version: 1,
      size: "portrait",
      submissionId: crypto.randomUUID(),
      slides: ["Cover", "A Grade", "Sponsors"].map((label, i) => ({
        id: String(i),
        label,
        input: { kind: "matchDay" },
        data: {},
        junior: false,
        sponsorsOn: true,
        warnings: [],
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
