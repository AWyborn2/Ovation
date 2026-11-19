/**
 * Portrait and Story sizes plan, Stage 2: where the editor opens a draft, and
 * the editor link at its saved size.
 */
import { describe, expect, it } from "vitest";
import { draftEditorHref, editorOpeningSize } from "./draft-design-size";

const card = { cardInput: { kind: "milestone" } };
const carousel = (size: string) => ({
  cardInput: {
    kind: "matchDay",
    weekendCarousel: {
      version: 1,
      submissionId: "11111111-1111-4111-8111-111111111111",
      size,
      slides: [{ page: "title" }, null, { page: "sponsors" }].map((carouselPage, i) => ({
        id: `s${i}`,
        label: `Slide ${i}`,
        input: { kind: "matchDay", ...(carouselPage ? { carouselPage } : {}) },
        data: {},
        junior: false,
        sponsorsOn: false,
        warnings: [],
      })),
    },
  },
});

describe("editorOpeningSize", () => {
  it("opens at the link's ?format= first", () => {
    expect(editorOpeningSize("?format=landscape", { ...card, designSize: "story" })).toBe(
      "landscape",
    );
  });

  it("ignores a ?format= that isn't a size", () => {
    expect(editorOpeningSize("?format=banner", { ...card, designSize: "story" })).toBe("story");
  });

  it("then the saved design size", () => {
    expect(editorOpeningSize("", { ...card, designSize: "portrait" })).toBe("portrait");
  });

  it("then a queued carousel's own size", () => {
    const c = carousel("story");
    expect(editorOpeningSize("", { ...c, designSize: null })).toBe("story");
    expect(editorOpeningSize("", { ...c, designSize: "portrait" })).toBe("portrait");
  });

  it("then square, for an older draft with nothing saved (made at Square)", () => {
    expect(editorOpeningSize("", { ...card, designSize: null, olderSizes: ["square"] })).toBe(
      "square",
    );
    expect(
      editorOpeningSize("", { ...card, designSize: null, olderSizes: ["square", "landscape"] }),
    ).toBe("square");
  });

  it("round 9 B8: else Portrait, for a new card with nothing saved (a sweep's)", () => {
    expect(editorOpeningSize("", { ...card, designSize: null, olderSizes: [] })).toBe("portrait");
    expect(editorOpeningSize("", { ...card, designSize: null, olderSizes: ["landscape"] })).toBe(
      "portrait",
    );
    expect(editorOpeningSize("", card)).toBe("portrait");
  });
});

describe("draftEditorHref", () => {
  it("links at the saved size, and plain for an older draft", () => {
    expect(draftEditorHref({ id: 7, designSize: "story" })).toBe(
      "/admin/social/editor/7?format=story",
    );
    expect(draftEditorHref({ id: 7, designSize: null })).toBe("/admin/social/editor/7");
    expect(draftEditorHref({ id: 7 })).toBe("/admin/social/editor/7");
  });
});
