/** Editor v2's page model (ADR-011 L5-B): pages in and out, v1 kept v1, stacks, previews. */
import { describe, expect, it } from "vitest";
import { MAX_STACK_DEPTH, templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import {
  depthOf,
  findLayer,
  makeStack,
  moveChild,
  needsV2,
  openTemplate,
  pageDoc,
  pageInput,
  presetInput,
  storedDocument,
  unstack,
  updateDeep,
  withPage,
  type EditorLayer,
} from "../template-doc";
import { swapVectorColour, vectorColours } from "../layer-design-panel";

const box = (y: number) => ({ x: 10, y, w: 80, h: 10 });
const text = (id: string, y: number, extra: Partial<FreeLayer> = {}): FreeLayer => ({
  id,
  kind: "text",
  content: id,
  geometry: { square: box(y), story: box(y) },
  ...extra,
});
const V1 = { layers: [text("a", 10, { animation: { kind: "rise" } }), text("b", 40)] };

describe("opening and saving", () => {
  it("opens v1 as the kind's primary page, untouched, and saves it back as v1", () => {
    const { doc, sourceFormat } = openTemplate(V1, "matchDay");
    expect(sourceFormat).toBe(1);
    expect(doc.pages.fixture?.layers).toBe(V1.layers);
    expect(storedDocument(doc, "matchDay", 1)).toEqual(V1);
  });

  it("keeps sponsorLock and drops a page that is emptied", () => {
    const { doc } = openTemplate({ ...V1, sponsorLock: true }, "milestone");
    expect(pageDoc(doc, "card").sponsorLock).toBe(true);
    const emptied = withPage(doc, "card", { layers: [], sponsorLock: true });
    expect(emptied.pages.card).toBeUndefined();
    expect(emptied.sponsorLock).toBe(true);
  });

  it("goes to v2 once a second page or a v2-only feature is used", () => {
    const { doc } = openTemplate(V1, "matchDay");
    const titled = withPage(doc, "title", { layers: [text("t", 5)] });
    expect(needsV2(titled, "matchDay")).toBe(true);
    expect(storedDocument(titled, "matchDay", 1)).toEqual({
      formatVersion: 2,
      pages: { fixture: { layers: V1.layers }, title: { layers: [text("t", 5)] } },
    });
    const conditioned = withPage(
      doc,
      "fixture",
      updateDeep(pageDoc(doc, "fixture"), "b", { showWhen: { photo: false } }),
    );
    expect(needsV2(conditioned, "matchDay")).toBe(true);
    expect(needsV2(doc, "matchDay")).toBe(false);
  });

  it("opens and saves v2 as v2", () => {
    const v2 = {
      formatVersion: 2,
      pages: { card: { layers: [text("a", 1)] } },
      palettes: ["club-kit"],
    };
    const { doc, sourceFormat } = openTemplate(v2, "milestone");
    expect(sourceFormat).toBe(2);
    expect(storedDocument(doc, "milestone", 2)).toEqual(v2);
  });
});

describe("stacks", () => {
  const page = { layers: [text("a", 40), text("b", 10), text("c", 70)] };

  it("stacks layers in their order down the card, boxed to their bounds", () => {
    const r = makeStack(page, ["a", "b"], "square")!;
    const top = r.doc.layers as EditorLayer[];
    expect(top.map((l) => l.id)).toEqual([r.id, "c"]);
    const group = top[0]!;
    expect(group.kind).toBe("group");
    expect(group.stack).toMatchObject({ direction: "column" });
    expect(group.children!.map((c) => c.id)).toEqual(["b", "a"]);
    expect(group.geometry.square).toEqual({ x: 10, y: 10, w: 80, h: 40 });
    expect(depthOf(group)).toBe(1);
  });

  it("reorders, edits a child in place, and undoes a stack", () => {
    const r = makeStack(page, ["a", "b"], "square")!;
    const moved = moveChild(r.doc, r.id, "a", -1);
    expect(findLayer(moved, r.id)!.layer.children!.map((c) => c.id)).toEqual(["a", "b"]);
    const edited = updateDeep(moved, "a", { fit: { maxLines: 2 } });
    expect(findLayer(edited, "a")).toMatchObject({
      layer: { fit: { maxLines: 2 } },
      parent: { id: r.id },
    });
    expect((unstack(edited, r.id).layers ?? []).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("builds a document the format validator accepts", () => {
    const { doc } = openTemplate({ layers: page.layers }, "matchDay");
    const r = makeStack(pageDoc(doc, "fixture"), ["a", "b"], "square")!;
    const conditioned = updateDeep(r.doc, "c", {
      showWhen: { photo: false },
      fit: { maxLines: 2, minScale: 0.6 },
    });
    const stored = storedDocument(withPage(doc, "fixture", conditioned), "matchDay", 1);
    expect(stored).toMatchObject({ formatVersion: 2 });
    expect(templateDocumentErrors(stored, "matchDay")).toEqual([]);
  });

  it(`won't nest deeper than ${MAX_STACK_DEPTH}`, () => {
    let doc = { layers: [text("x", 1)] as FreeLayer[] };
    let id = "x";
    for (let i = 0; i < MAX_STACK_DEPTH; i++) {
      const r = makeStack(doc, [id], "square")!;
      expect(r).not.toBeNull();
      doc = r.doc as typeof doc;
      id = r.id;
    }
    expect(makeStack(doc, [id], "square")).toBeNull();
  });
});

describe("preview inputs", () => {
  const input = {
    kind: "matchDay",
    roundLabel: "ROUND 3",
    venue: "Oval",
  } as unknown as ShareCardInput;

  it("selects bookend and day pages by their flags", () => {
    expect(pageInput(input, "matchDay", "fixture")).toBe(input);
    expect(pageInput(input, "matchDay", "title")).toMatchObject({
      carouselPage: { page: "title" },
    });
    expect(pageInput(input, "matchDay", "day")).toMatchObject({ junior: true, carouselDay: {} });
  });

  it("leaves non-content kinds alone at every preset", () => {
    const m = { kind: "milestone", playerName: "Sam" } as unknown as ShareCardInput;
    expect(presetInput(m, "milestone", "card", "minimal")).toBe(m);
  });

  it("drops optional fields at Minimal that Full keeps", () => {
    const full = presetInput(input, "matchDay", "fixture", "full") as unknown as Record<
      string,
      unknown
    >;
    const minimal = presetInput(input, "matchDay", "fixture", "minimal") as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(minimal).length).toBeLessThanOrEqual(Object.keys(full).length);
    expect(minimal.kind).toBe("matchDay");
  });
});

describe("vector colours", () => {
  const svg =
    '<svg><path fill="#ff0000"/><rect stroke="var(--gold)" fill="none"/><stop stop-color="#ff0000"/></svg>';
  it("lists each colour once, and swaps one everywhere", () => {
    expect(vectorColours(svg)).toEqual(["#ff0000", "var(--gold)"]);
    const swapped = swapVectorColour(svg, "#ff0000", "var(--accent)");
    expect(vectorColours(swapped)).toEqual(["var(--accent)", "var(--gold)"]);
  });
});
