/**
 * The Weekend Carousel's template choice (ADR-011 T5.17): the picked template
 * resets with the set's kind, its day page sets the junior day capacity, and
 * the set's document is assembled by the server from the slides' pages.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { CarouselSetType } from "@workspace/scorecard/queued-carousel";
import type { WeekendSlide } from "./model";
import { slidePages, useCarouselAssembly, useCarouselTemplate } from "./template-choice";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const box = { x: 0, y: 20, w: 100, h: 50 };
const DAY_DOC = {
  formatVersion: 2,
  pages: {
    fixture: { layers: [] },
    day: {
      layers: [
        {
          id: "rows",
          kind: "rows",
          geometry: { square: box, portrait: box, story: box, landscape: box },
          rows: { repeat: "dayRows", rowHeight: 10, cells: [{ field: "team", x: 0, w: 100 }] },
        },
      ],
    },
  },
};
const pick = { ref: { copyId: 4, version: 2 }, document: DAY_DOC, name: "Ours" };

const slide = (input: Record<string, unknown>) => ({ input }) as unknown as WeekendSlide;
const SLIDES = [
  slide({ kind: "matchDay", carouselPage: { page: "title" } }),
  slide({ kind: "matchDay" }),
  slide({ kind: "matchDay", junior: true, carouselDay: {} }),
  slide({ kind: "matchDay", carouselPage: { page: "sponsors" } }),
];

describe("useCarouselTemplate", () => {
  it("takes the day capacity from the picked template, and resets with the set's kind", () => {
    const { result, rerender } = renderHook(
      ({ type }: { type: CarouselSetType }) => useCarouselTemplate(type, "square"),
      { initialProps: { type: "matchDay" as CarouselSetType }, wrapper: wrapper() },
    );
    expect(result.current).toMatchObject({ templateKind: "matchDay", picked: null });
    act(() => result.current.setPicked(pick));
    // A 50 %-tall box on a 1080 square holds 540 px; 10 % rows are 108 px: five rows.
    expect(result.current.dayRowsCapacity).toBe(5);
    rerender({ type: "results" });
    expect(result.current).toMatchObject({ templateKind: "matchSummary", picked: null });
  });
});

describe("useCarouselAssembly", () => {
  it("asks the server for the slides' pages with the picked template", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            document: { formatVersion: 2, pages: { fixture: { layers: [] } } },
            templateRef: pick.ref,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    expect(slidePages(SLIDES)).toEqual(["day", "fixture", "sponsors", "title"]);
    const { result } = renderHook(() => useCarouselAssembly("matchDay", SLIDES, pick), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.document).toBeTruthy());
    expect(bodies).toEqual([
      {
        setType: "matchDay",
        pages: ["day", "fixture", "sponsors", "title"],
        templateRef: pick.ref,
      },
    ]);
  });

  it("waits for a template, and says why the server couldn't assemble the set", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "No template the club can use has every page." }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const idle = renderHook(() => useCarouselAssembly("matchDay", SLIDES, null), {
      wrapper: wrapper(),
    });
    expect(idle.result.current).toEqual({ document: undefined, loading: false, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    const { result } = renderHook(() => useCarouselAssembly("matchDay", SLIDES, pick), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.error).toMatch(/every page/));
  });
});
