/**
 * Junior look thumbnails (New Studio's Create, Juniors): drawn as junior cards with
 * junior sample names and no photo at all, never the club's senior photo, a senior
 * sample's names or a child's photo (juniors isolation, consent fail-closed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { juniorSampleCardInput, sampleCardInput } from "@/lib/sample-card-inputs";
import type { PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";

type Drawn = { junior: boolean; data: PackCardData; input: Record<string, unknown> };
const drawn: Drawn[] = [];

vi.mock("@/components/pack-card", () => ({
  PackCard: (props: Drawn) => {
    drawn.push(props);
    return <p>card</p>;
  },
}));

const { TemplateThumb, juniorThumbView } = await import("./previews");
const { TemplateStep } = await import("@/components/studio-home/create-picker");

const SENIOR_PHOTO = "https://example.test/senior-team.jpg";
const DATA: PackCardData = {
  photoUrl: SENIOR_PHOTO,
  layerPhotos: { "layer:photo": { url: "https://example.test/player.jpg" } },
} as unknown as PackCardData;
const DOC = { formatVersion: 2, pages: { team: { layers: [] } } };

beforeEach(() => {
  // Thumbnails mount once scrolled into view: here, at once.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe() {
        this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  cleanup();
  drawn.length = 0;
  vi.unstubAllGlobals();
});

describe("junior thumbnails", () => {
  it("get no photo, and no consent marker, even when the input or club data has one", () => {
    const input = {
      ...juniorSampleCardInput("teamList"),
      junior: true,
      juniorPhotoAllowed: true,
      photoUrl: "https://example.test/child.jpg",
    } as unknown as ShareCardInput;
    render(<TemplateThumb document={DOC} kind="teamList" input={input} data={DATA} junior />);
    expect(drawn).toHaveLength(1);
    const [thumb] = drawn;
    expect(thumb!.junior).toBe(true);
    expect(thumb!.data.photoUrl).toBeNull();
    expect(thumb!.data.layerPhotos).toBeNull();
    expect(thumb!.input.juniorPhotoAllowed).toBeUndefined();
  });

  it("leave senior thumbnails as they were", () => {
    const input = sampleCardInput("teamList");
    render(<TemplateThumb document={DOC} kind="teamList" input={input} data={DATA} />);
    expect(drawn[0]!.junior).toBe(false);
    expect(drawn[0]!.data.photoUrl).toBe(SENIOR_PHOTO);
  });

  it("strip photos from the club data without touching the rest", () => {
    const view = juniorThumbView(sampleCardInput("milestone"), {
      ...DATA,
      hashtag: "#club",
    } as PackCardData);
    expect(view.data).toMatchObject({ photoUrl: null, layerPhotos: null, hashtag: "#club" });
  });

  it("use junior sample names and no photo", () => {
    const junior = juniorSampleCardInput("teamList", "Test CC") as Extract<
      ShareCardInput,
      { kind: "teamList" }
    >;
    const senior = sampleCardInput("teamList") as typeof junior;
    const names = junior.players.map((p) => p.surname);
    expect(names.every((n) => /^JUNIOR /.test(n))).toBe(true);
    for (const p of senior.players) expect(names).not.toContain(p.surname);
    expect(JSON.stringify(junior)).not.toMatch(/https?:/);
    for (const kind of ["matchSummary", "milestone", "matchDay"] as const) {
      const text = JSON.stringify(juniorSampleCardInput(kind));
      expect(text).not.toMatch(/Sample Player|https?:/);
    }
  });

  it("Create's look step draws every junior look as a junior card with no photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (req: RequestInfo | URL) => {
        const url = typeof req === "string" ? req : req.toString();
        const payload = /template-library(\?|$)/.test(url)
          ? {
              templates: [
                { id: 4, name: "Bold", version: 1, document: DOC, look: null, kind: "teamList" },
              ],
            }
          : /club-templates/.test(url)
            ? { templates: [] }
            : // The club's latest senior card: a junior look must never draw it.
              { source: "draft", input: { kind: "teamList", players: [{ surname: "SENIOR" }] } };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TemplateStep
          kind="teamList"
          size="square"
          preview={{ dataFor: () => DATA, clubName: "Test CC" }}
          start={() => {}}
          busy={false}
          junior
        />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "Use Bold" });
    await waitFor(() => expect(drawn.length).toBeGreaterThan(0));
    for (const thumb of drawn) {
      expect(thumb.junior).toBe(true);
      expect(thumb.data.photoUrl).toBeNull();
      expect(JSON.stringify(thumb.input)).not.toContain("SENIOR");
    }
  });
});
