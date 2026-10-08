import { describe, expect, it } from "vitest";
import { templateDocumentErrors } from "./validate";

const box = { x: 10, y: 10, w: 80, h: 20 };
const text = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  kind: "text",
  content: "{{playerName}}",
  style: { fontSize: 6, fontWeight: 800, align: "center", letterSpacing: 0.05, color: "#fff" },
  geometry: { square: box },
  ...over,
});

describe("templateDocumentErrors (security review 2026-10-08)", () => {
  it("accepts what the editor makes", () => {
    const doc = {
      layers: [
        text({ content: "{{competitionName}}" }),
        {
          id: "s1",
          kind: "shape",
          style: { radius: 9999 },
          geometry: { square: box },
          editedAt: { square: 1 },
        },
        {
          id: "p1",
          kind: "photo",
          sizes: ["square"],
          geometry: { square: box },
          photo: { square: { focalX: 50, focalY: 40, zoom: 1.2 } },
        },
        { id: "l1", kind: "image", content: "{{clubLogo}}", geometry: { square: box } },
        {
          id: "e1",
          kind: "element",
          element: { id: "ck.trim", props: { label: "Sat; 2pm" } },
          geometry: { square: box },
        },
        {
          id: "r1",
          kind: "rows",
          geometry: { square: box },
          rows: {
            repeat: "rows",
            rowHeight: 7,
            gap: 1,
            cells: [{ field: "team", x: 0, w: 60, style: { fontSize: 3 } }],
            variants: { club: { team: { color: "var(--gold)" } } },
          },
        },
      ],
    };
    expect(templateDocumentErrors(doc, "ladder")).toEqual([]);
  });

  it.each([
    ["a string where a number belongs", text({ style: { letterSpacing: '1"><img src=x>' } })],
    ["markup in a colour", text({ style: { color: 'red"><script>' } })],
    ["an unknown style setting", text({ style: { behaviour: "x" } })],
    ["an unknown layer setting", text({ onclick: "x" })],
    ["a field the card lacks", text({ content: "{{secret}}" })],
    ["an element kind templates can't hold", text({ kind: "chart" })],
    ["a script image address", text({ kind: "image", content: "javascript:alert(1)" })],
    ["an unknown size", text({ geometry: { huge: box } })],
    ["an infinite box", text({ geometry: { square: { ...box, x: 1e9 } } })],
    ["a bad id", text({ id: 'x" onmouseover="y' })],
  ])("rejects %s", (_label, layer) => {
    expect(templateDocumentErrors({ layers: [layer] }, "century").length).toBeGreaterThan(0);
  });

  it("rejects a list bound to a list the card doesn't have, and repeated ids", () => {
    const rows = {
      id: "r",
      kind: "rows",
      geometry: { square: box },
      rows: { repeat: "matches", rowHeight: 7, cells: [] },
    };
    expect(templateDocumentErrors({ layers: [rows] }, "ladder").length).toBeGreaterThan(0);
    expect(templateDocumentErrors({ layers: [text(), text()] }, "century")).toEqual([
      "Layer 2 repeats the id of another layer.",
    ]);
  });
});
