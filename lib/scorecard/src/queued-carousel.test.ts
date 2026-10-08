import { describe, expect, it } from "vitest";
import { readQueuedCarousel, type CarouselSetType } from "./queued-carousel";

const make = (type?: CarouselSetType) => {
  const input = type === "teamList" ? { kind: "teamList", players: [{ order: 1, surname: "SMITH" }] }
    : type === "results" || type === "matchSummary"
      ? { kind: "matchSummary", club: {}, opposition: {}, result: "Won", innings: [] } : { kind: "matchDay" };
  return { weekendCarousel: { version: 1, setType: type, submissionId: "12345678-1234-1234-1234-123456789abc", size: "square",
    slides: ["title", "content", "sponsors"].map((id, i) => ({
      id, label: id, input: i === 1 ? input : { kind: "matchDay", carouselPage: { page: id } },
      data: {}, junior: false, sponsorsOn: false, warnings: [],
    })),
  } };
};
describe("queued carousel compatibility and validation", () => {
  it.each([undefined, "matchDay", "teamList", "results", "matchSummary"] as const)("reads %s without mutating the frozen payload", type => {
    const p = make(type); const before = JSON.stringify(p);
    expect(readQueuedCarousel(p)).toBe(p.weekendCarousel);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("rejects mixed content kinds, bad slide counts, duplicate IDs and invalid crops", () => {
    const p = make("teamList");
    p.weekendCarousel.slides[1].input = { kind: "matchDay" };
    expect(readQueuedCarousel(p)).toBeNull();
    const over = make();
    over.weekendCarousel.slides = Array.from({ length: 21 }, (_, i) => ({ ...over.weekendCarousel.slides[1], id: String(i) }));
    expect(readQueuedCarousel(over)).toBeNull();
    const duplicate = make();
    duplicate.weekendCarousel.slides[1].id = "title";
    expect(readQueuedCarousel(duplicate)).toBeNull();
    const crop = make();
    crop.weekendCarousel.slides[1].data = { photoTransform: { focalX: 2, focalY: .5, zoom: 1 } };
    expect(readQueuedCarousel(crop)).toBeNull();
  });
});
