import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { LEGACY_PACK_IDS, readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "@workspace/scorecard/card-content";
import { CarouselPreview } from "./carousel-preview";
import { PackCard } from "@/components/pack-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";

/**
 * P9 — a saved carousel (version 1 or 2) or card naming a hidden legacy pack
 * renders as Club Kit on the client path (queue review, Studio previews), with
 * no error and no blank card. The stored payload is never rewritten.
 */

afterEach(cleanup);

// jsdom lays nothing out; give fill-parent cards a width so they draw.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 480,
  });
});
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
});

const opts = {
  heading: "Round one",
  from: "2026-10-09",
  to: "2026-10-11",
  roundLabels: ["1"],
  fixtureCount: 1,
};

const v1 = (packId: string) => ({
  weekendCarousel: {
    version: 1,
    packId,
    submissionId: "0b6f7f0e-4a9a-4d61-9a1e-3c0f2d8b6a11",
    size: "square",
    slides: ["title", "fixture-1", "sponsors"].map((id, index) => ({
      id,
      label: id,
      junior: false,
      sponsorsOn: false,
      warnings: [],
      input:
        index === 1
          ? { kind: "matchDay", grade: "A Grade", oppositionName: "Visitors" }
          : { kind: "matchDay", carouselPage: { page: id, title: "Round one", sponsors: [] } },
      data: {},
    })),
  },
});

const v2 = (packId: string) => {
  const slide = (id: string, content: unknown) => ({
    id,
    label: id,
    content,
    visibleFields: [...presetFields("matchDay", "minimal")],
    photoId: null,
    data: {},
    junior: false,
    sponsorsOn: false,
    warnings: [],
  });
  return {
    weekendCarousel: {
      version: 2,
      packId,
      setType: "matchDay",
      submissionId: "5d1c2b3a-6e7f-4a8b-9c0d-1e2f3a4b5c6d",
      size: "square",
      slides: [
        slide("title", matchDayTitleContent(opts)),
        slide(
          "fixture-11",
          matchDayFixtureContent({
            id: 11,
            grade: "A Grade",
            roundLabel: "1",
            opponentName: "Visitors Cricket Club",
            opponentLogoUrl: null,
            venue: "Oval",
            startAt: new Date("2026-10-10T02:00:00Z"),
            isHome: true,
          }),
        ),
        slide("sponsors", matchDaySponsorsContent({ ...opts, sponsors: [] })),
      ],
    },
  };
};

/** The rendered markup once the card has drawn (PackCard fills in after mount). */
const drawn = async (ui: React.ReactElement) => {
  const { container, unmount } = render(ui);
  await waitFor(() => expect(container.innerHTML).toContain("pack-card-root"));
  const html = container.innerHTML;
  unmount();
  return html;
};

const previewHtml = (payload: unknown) => {
  const carousel = readQueuedCarousel(payload);
  expect(carousel).not.toBeNull();
  return drawn(<CarouselPreview carousel={carousel!} />);
};

describe("legacy design packs render as Club Kit (P9)", () => {
  it.each(LEGACY_PACK_IDS)(
    "a saved v1 and v2 carousel naming %s previews as Club Kit",
    async (id) => {
      for (const make of [v1, v2]) {
        const payload = make(id);
        const html = await previewHtml(payload);
        expect(html).toBe(await previewHtml(make("club-kit-v1")));
        expect(payload.weekendCarousel.packId).toBe(id);
      }
    },
  );

  it.each(LEGACY_PACK_IDS)("a card saved with %s renders as Club Kit", async (id) => {
    const input = sampleCardInput("matchSummary");
    const draw = (packId: string) =>
      drawn(
        <PackCard input={input} size="square" sponsorsOn={false} junior={false} packId={packId} />,
      );
    const html = await draw(id);
    expect(html).toContain('data-ck-rule="1"');
    expect(html).toBe(await draw("club-kit-v1"));
  });
});
