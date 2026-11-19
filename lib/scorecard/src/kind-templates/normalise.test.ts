/**
 * Reading stored documents as v2 (T1.2): v1 `{ layers }` is the kind's
 * primary page, `animation` is `motion.in`, and nothing stored is changed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "./format";
import {
  documentPageLayers,
  documentPages,
  normaliseDocument,
  normaliseLayer,
  teamListNamesWithInitials,
} from "./normalise";
import { primaryPage } from "./pages";

/**
 * The starters' original v1 documents, frozen when their bundles became
 * format v2 (C3): `__fixtures__/v1-starters/<look>.json`, by kind.
 */
const V1_STARTERS = path.resolve(__dirname, "__fixtures__", "v1-starters");

/** Every original v1 starter: look, kind and stored document. */
function v1Documents(): Array<{ look: string; kind: string; document: unknown }> {
  const out: Array<{ look: string; kind: string; document: unknown }> = [];
  for (const file of readdirSync(V1_STARTERS).sort()) {
    if (!file.endsWith(".json")) continue;
    const look = file.replace(/\.json$/, "");
    const byKind = JSON.parse(readFileSync(path.join(V1_STARTERS, file), "utf8")) as Record<
      string,
      unknown
    >;
    for (const [kind, document] of Object.entries(byKind)) out.push({ look, kind, document });
  }
  return out;
}

const box = { square: { x: 0, y: 0, w: 50, h: 10 } };

/** The layers a v1 document's primary page holds once read, minus the v1→v2 renames. */
function expectSameLayers(read: TemplateLayerV2[], stored: Array<Record<string, unknown>>) {
  expect(read).toHaveLength(stored.length);
  read.forEach((layer, i) => {
    const { animation, ...rest } = stored[i] as { animation?: { kind: string; delayMs?: number } };
    const { motion, ...readRest } = layer as TemplateLayerV2 & { motion?: unknown };
    expect(readRest).toEqual(rest);
    if (animation && animation.kind !== "none") {
      expect(motion).toEqual({
        in: {
          preset: animation.kind,
          ...(animation.delayMs !== undefined ? { delayMs: animation.delayMs } : {}),
        },
      });
    } else {
      expect(motion).toBeUndefined();
    }
  });
}

describe("v1 documents read as v2", () => {
  it("puts every original v1 starter's layers on its kind's primary page", () => {
    const v1 = v1Documents();
    expect(v1.length).toBeGreaterThan(0);
    for (const { kind, document } of v1) {
      const stored = document as { layers: Array<Record<string, unknown>> };
      const before = JSON.stringify(stored);
      const doc = normaliseDocument(stored, kind);
      expect(doc.formatVersion).toBe(2);
      expect(doc.sourceFormat).toBe(1);
      expect(documentPages(doc)).toEqual([primaryPage(kind)]);
      // A Team List's surname-only player rows read with the initial (retest 6, I).
      const expected =
        kind === "teamList"
          ? (stored.layers.map((l) =>
              teamListNamesWithInitials(l as unknown as TemplateLayerV2),
            ) as unknown as Array<Record<string, unknown>>)
          : stored.layers;
      expectSameLayers(documentPageLayers(doc, primaryPage(kind)), expected);
      // Never rewritten: the stored object is exactly as it was.
      expect(JSON.stringify(stored)).toBe(before);
    }
  });

  it("reads a pilot-shaped document: animations, the sponsor lock, draft edits ignored", () => {
    const stored = {
      layers: [
        { id: "a", kind: "text", content: "{{clubName}}", geometry: box },
        { id: "b", kind: "shape", geometry: box, animation: { kind: "rise", delayMs: 240 } },
        { id: "c", kind: "text", content: "Hi", geometry: box, animation: { kind: "none" } },
        { id: "d", kind: "sticker", geometry: box, animation: { kind: "pop" } },
      ],
      sponsorLock: true,
      fields: { headline: "Edited" },
      hidden: ["field:clubTagline"],
      images: { photo: "https://cdn.example.org/p.jpg" },
    };
    const frozen = structuredClone(stored);
    const doc = normaliseDocument(stored, "matchDay");
    expect(doc.sponsorLock).toBe(true);
    expect(Object.keys(doc.pages)).toEqual(["fixture"]);
    const layers = documentPageLayers(doc, "fixture");
    expect(layers[0]).toBe(stored.layers[0]); // nothing to read differently: the same object
    expect(layers[1]).toEqual({
      id: "b",
      kind: "shape",
      geometry: box,
      motion: { in: { preset: "rise", delayMs: 240 } },
    });
    expect(layers[2]).toEqual({ id: "c", kind: "text", content: "Hi", geometry: box });
    expect(layers[3]).toMatchObject({ motion: { in: { preset: "pop" } } });
    expect("animation" in layers[3]).toBe(false);
    expect(stored).toEqual(frozen);
  });

  it("uses the kind's primary page", () => {
    const stored = { layers: [{ id: "a", kind: "shape", geometry: box }] };
    expect(Object.keys(normaliseDocument(stored, "matchDay").pages)).toEqual(["fixture"]);
    expect(Object.keys(normaliseDocument(stored, "matchSummary").pages)).toEqual(["result"]);
    expect(Object.keys(normaliseDocument(stored, "results").pages)).toEqual(["result"]);
    expect(Object.keys(normaliseDocument(stored, "teamList").pages)).toEqual(["team"]);
    expect(Object.keys(normaliseDocument(stored, "ladder").pages)).toEqual(["card"]);
  });

  it("reads a missing or malformed document as an empty one", () => {
    for (const bad of [null, undefined, 3, "x", [], { layers: "nope" }, {}]) {
      const doc = normaliseDocument(bad, "player");
      expect(doc.sourceFormat).toBe(1);
      expect(documentPageLayers(doc, "card")).toEqual([]);
    }
  });

  it("treats a document claiming v2 without pages as v1", () => {
    const doc = normaliseDocument({ formatVersion: 2, layers: [] }, "player");
    expect(doc.sourceFormat).toBe(1);
  });
});

describe("v2 documents", () => {
  const v2: TemplateDocumentV2 = {
    formatVersion: 2,
    pages: {
      fixture: { layers: [{ id: "f", kind: "text", content: "{{grade}}", geometry: box }] },
      title: {
        layers: [
          {
            id: "g",
            kind: "group",
            geometry: box,
            stack: { direction: "column", gap: 1 },
            children: [
              {
                id: "g1",
                kind: "text",
                content: "{{weekendTitle}}",
                geometry: box,
                animation: { kind: "fade", delayMs: 100 },
              },
            ],
          },
        ],
      },
    },
    palettes: ["club-kit"],
    timeline: { durationMs: 6000 },
  };

  it("keeps its pages, palettes and timeline, and reads nested animations", () => {
    const frozen = structuredClone(v2);
    const doc = normaliseDocument(v2, "matchDay");
    expect(doc.sourceFormat).toBe(2);
    expect(documentPages(doc)).toEqual(["title", "fixture"]);
    expect(doc.palettes).toEqual(["club-kit"]);
    expect(doc.timeline).toEqual({ durationMs: 6000 });
    const group = documentPageLayers(doc, "title")[0];
    expect(group.kind).toBe("group");
    if (group.kind !== "group") return;
    expect(group.children[0]).toMatchObject({ motion: { in: { preset: "fade", delayMs: 100 } } });
    expect("animation" in group.children[0]).toBe(false);
    expect(v2).toEqual(frozen);
  });

  it("drops unknown pages and reads a page without a list as empty", () => {
    const doc = normaliseDocument(
      { formatVersion: 2, pages: { bogus: { layers: [] }, card: { layers: "x" } } },
      "player",
    );
    expect(documentPages(doc)).toEqual(["card"]);
    expect(documentPageLayers(doc, "card")).toEqual([]);
    expect(documentPageLayers(doc, "title")).toEqual([]);
  });

  it("lets an explicit motion.in win over a stray animation", () => {
    const layer = {
      id: "x",
      kind: "shape",
      geometry: box,
      motion: { in: { preset: "pop" } },
      animation: { kind: "rise" },
    } as TemplateLayerV2;
    expect(normaliseLayer(layer)).toEqual({
      id: "x",
      kind: "shape",
      geometry: box,
      motion: { in: { preset: "pop" } },
    });
  });
});

describe("page colours", () => {
  it("keeps a page's colour it can draw, and drops one it can't", () => {
    const read = (background: unknown) =>
      normaliseDocument(
        { formatVersion: 2, pages: { card: { layers: [], background } } },
        "newSigning",
      ).pages.card;
    expect(read("#FFFFFF")).toEqual({ layers: [], background: "#FFFFFF" });
    expect(read("var(--panel)")).toEqual({ layers: [], background: "var(--panel)" });
    expect(read("tomato")).toEqual({ layers: [] });
  });
});

// Retest 6, item I: a club's own Team List saved before #636 printed "FOX"
// beside the library's "D. FOX". Its surname-only player rows read with the
// initial; the stored document is never rewritten.
describe("a Team List's player rows read with the initial (retest 6, I)", () => {
  const rows = (cells: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
    ({
      id: "players",
      kind: "rows",
      geometry: box,
      rows: { repeat: "players", rowHeight: 6, cells, ...extra },
    }) as unknown as TemplateLayerV2;
  const fields = (l: TemplateLayerV2) =>
    ((l as unknown as { rows: { cells: Array<{ field: string }> } }).rows.cells ?? []).map(
      (c) => c.field,
    );

  it("a surname cell with no name-with-initial cell reads as broadcastName; role stays", () => {
    const before = rows([{ field: "number" }, { field: "surname" }, { field: "role" }], {
      variants: { captain: { surname: { color: "#FF0000" } } },
    });
    const after = teamListNamesWithInitials(before);
    expect(fields(after)).toEqual(["number", "broadcastName", "role"]);
    expect(
      (after as unknown as { rows: { variants: Record<string, unknown> } }).rows.variants,
    ).toEqual({ captain: { broadcastName: { color: "#FF0000" } } });
    // The stored layer is untouched.
    expect(fields(before)).toEqual(["number", "surname", "role"]);
  });

  it("leaves a row that already prints the initial, and every other repeat", () => {
    const listed = rows([{ field: "number" }, { field: "listName" }, { field: "surname" }]);
    expect(teamListNamesWithInitials(listed)).toBe(listed);
    const other = {
      ...rows([{ field: "surname" }]),
      rows: { repeat: "batting", cells: [{ field: "surname" }] },
    } as unknown as TemplateLayerV2;
    expect(teamListNamesWithInitials(other)).toBe(other);
    const text = { id: "t", kind: "text", content: "{{clubName}}", geometry: box };
    expect(teamListNamesWithInitials(text as TemplateLayerV2)).toBe(text);
  });

  it("reads inside groups, on v1 and v2 Team List documents only", () => {
    const old = rows([{ field: "surname" }]);
    const group = { id: "g", kind: "group", geometry: box, children: [old] };
    const v2 = { formatVersion: 2, pages: { team: { layers: [group] } } };
    const read = normaliseDocument(v2, "teamList");
    const child = (read.pages.team!.layers[0] as unknown as { children: TemplateLayerV2[] })
      .children[0]!;
    expect(fields(child)).toEqual(["broadcastName"]);
    const v1 = normaliseDocument({ layers: [old] }, "teamList");
    expect(fields(v1.pages.team!.layers[0]!)).toEqual(["broadcastName"]);
    // Another kind's rows are its own business.
    const other = normaliseDocument({ layers: [old] }, "teamOfWeek");
    expect(fields(other.pages[primaryPage("teamOfWeek")]!.layers[0]!)).toEqual(["surname"]);
    expect(JSON.stringify(v2)).not.toContain("broadcastName");
  });
});
