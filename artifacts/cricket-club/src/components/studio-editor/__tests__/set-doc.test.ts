import { describe, expect, it } from "vitest";
import { templateDocumentErrors, type SetDocument } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import {
  addBlankPage,
  addRepeatPage,
  addSetPage,
  deleteSetPage,
  duplicateSetPage,
  editorPageList,
  missingRepeatSlots,
  moveSetPage,
  openSetTemplate,
  pageRenderDocument,
  storedSetDocument,
} from "../set-doc";
import { openTemplate, withPage } from "../template-doc";

const text = (id: string, content: string) =>
  ({
    id,
    kind: "text",
    content,
    geometry: { square: { x: 10, y: 10, w: 50, h: 10 } },
  }) as unknown as FreeLayer;

const SET: SetDocument = {
  formatVersion: 2,
  set: "matchDay",
  pages: [
    {
      id: "cover",
      role: "fixed",
      slot: "cover",
      kind: "matchDay",
      page: "title",
      layers: [text("t1", "THIS WEEKEND")] as never,
    },
    {
      id: "fixture",
      role: "repeat",
      slot: "fixture",
      kind: "matchDay",
      page: "fixture",
      layers: [text("f1", "{{grade}}")] as never,
    },
    {
      id: "sponsors",
      role: "fixed",
      slot: "sponsors",
      kind: "matchDay",
      page: "sponsors",
      layers: [text("s1", "THANKS")] as never,
    },
  ],
};

describe("a set in the editor", () => {
  it("opens with its pages in order and saves back unchanged", () => {
    const { doc } = openSetTemplate(SET);
    expect(editorPageList(doc, "set:matchDay").map((p) => [p.id, p.repeat])).toEqual([
      ["cover", false],
      ["fixture", true],
      ["sponsors", false],
    ]);
    expect(storedSetDocument(doc)).toEqual(SET);
  });

  it("keeps an emptied page (it is deleted from the strip, not by emptying it)", () => {
    const { doc } = openSetTemplate(SET);
    const emptied = withPage(doc, "sponsors", { layers: [] });
    expect(storedSetDocument(emptied).pages.map((p) => p.id)).toContain("sponsors");
  });

  it("adds, duplicates, moves and deletes pages", () => {
    let { doc } = openSetTemplate(SET);
    const blank = addBlankPage(doc, { kind: "matchDay", page: "title" }, "cover");
    doc = blank.doc;
    expect(editorPageList(doc, "").map((p) => p.id)).toEqual([
      "cover",
      blank.id,
      "fixture",
      "sponsors",
    ]);
    const dup = duplicateSetPage(doc, "fixture");
    doc = dup.doc;
    const stored = storedSetDocument(doc);
    const copy = stored.pages.find((p) => p.id === dup.id)!;
    // A copy of a repeating page is a design page (C2), with its own layer ids.
    expect(copy).toMatchObject({ role: "fixed", slot: "page", kind: "matchDay", page: "fixture" });
    expect(copy.layers[0]!.id).not.toBe("f1");
    doc = moveSetPage(doc, "sponsors", 0);
    expect(storedSetDocument(doc).pages[0]!.id).toBe("sponsors");
    doc = deleteSetPage(doc, blank.id);
    expect(storedSetDocument(doc).pages.map((p) => p.id)).not.toContain(blank.id);
    expect(templateDocumentErrors(storedSetDocument(doc), "set:matchDay")).toEqual([]);
  });

  it("offers the item pages a set lacks, and adds one empty", () => {
    const { doc } = openSetTemplate(SET);
    expect(missingRepeatSlots(doc)).toEqual(["day"]);
    const r = addRepeatPage(doc, "day", "fixture");
    expect(storedSetDocument(r.doc).pages[2]).toMatchObject({
      id: "day",
      role: "repeat",
      slot: "day",
      kind: "matchDay",
      page: "day",
      layers: [],
    });
    expect(missingRepeatSlots(r.doc)).toEqual([]);
  });

  it("turns a second cover into a design page", () => {
    const { doc } = openSetTemplate(SET);
    const r = addSetPage(doc, { role: "fixed", slot: "cover", kind: "matchDay", page: "title" }, [
      text("x", "AGAIN"),
    ]);
    expect(storedSetDocument(r.doc).pages.at(-1)).toMatchObject({ slot: "page", role: "fixed" });
  });

  it("renders a page as its kind's document, under its own and the primary page", () => {
    const { doc } = openSetTemplate(SET);
    const cover = editorPageList(doc, "")[0]!;
    const render = pageRenderDocument(doc, cover) as unknown as { pages: Record<string, unknown> };
    expect(Object.keys(render.pages).sort()).toEqual(["fixture", "title"]);
  });

  it("leaves kind templates on their kind's pages", () => {
    const { doc } = openTemplate(
      { formatVersion: 2, pages: { fixture: { layers: [] } } },
      "matchDay",
    );
    expect(editorPageList(doc, "matchDay").map((p) => p.id)).toEqual([
      "fixture",
      "title",
      "day",
      "sponsors",
    ]);
  });
});
