/** "Save as element" strips the club's own content (editable-elements plan, D4, E1). */
import { describe, expect, it } from "vitest";
import type { FreeLayer } from "@/lib/pack-render";
import { elementFromSelection, type ElementSaveContext } from "../element-save";

const ctx: ElementSaveContext = {
  logoUrl: "/api/storage/objects/uploads/crest.png",
  clubNames: ["Seaview Cricket Club", "Seaview"],
  colours: { "--gold": "#F5B400", "--panel": "#123", "--ink": "#0A0C10" },
};
const box = { square: { x: 6, y: 6, w: 30, h: 10 } };
const layer = (over: Partial<FreeLayer> & Record<string, unknown>): FreeLayer =>
  ({ id: "l1", kind: "shape", geometry: box, ...over }) as FreeLayer;

const first = (layers: FreeLayer[]) =>
  elementFromSelection(layers, ctx).document.layers[0] as Record<string, unknown>;

describe("elementFromSelection", () => {
  it("turns the crest into the crest token and other pictures into the photo slot", () => {
    expect(first([layer({ kind: "image", content: ctx.logoUrl! })])).toMatchObject({
      kind: "image",
      content: "{{clubLogo}}",
    });
    const sponsor = first([layer({ kind: "image", content: "https://cdn.test/sponsor.png" })]);
    expect(sponsor.kind).toBe("photo");
    expect(sponsor.content).toBeUndefined();
    expect(first([layer({ kind: "image", content: "{{sponsorLogo}}" })]).content).toBe(
      "{{sponsorLogo}}",
    );
  });

  it("turns text into sample or token text", () => {
    expect(first([layer({ kind: "text", content: "Go the mighty Gulls!" })]).content).toBe("Text");
    expect(first([layer({ kind: "text", content: "Seaview v {{opposition}}" })]).content).toBe(
      "{{clubName}} v {{opposition}}",
    );
    const live = first([layer({ kind: "text", content: "104", bind: "runs" })]);
    expect(live.content).toBe("{{runs}}");
    expect(live.bind).toBeUndefined();
  });

  it("maps the club's colours to brand tokens, everywhere a colour can be", () => {
    const shape = first([
      layer({
        style: {
          background: "#f5b400",
          fill: { type: "linear", stops: [{ color: "#112233" }, { color: "#0A0C10" }] },
          border: { width: 1, color: "#FFFFFF" },
        } as never,
      }),
    ]);
    expect(shape.style).toEqual({
      background: "var(--gold)",
      fill: { type: "linear", stops: [{ color: "var(--panel)" }, { color: "var(--ink)" }] },
      border: { width: 1, color: "#FFFFFF" },
    });
    const vector = first([layer({ kind: "vector", svg: '<svg><path fill="#F5B400"/></svg>' })]);
    expect(vector.svg).toBe('<svg><path fill="var(--gold)"/></svg>');
  });

  it("drops editor state, hidden layers and kinds the library can't hold, and names them", () => {
    const draft = elementFromSelection(
      [
        layer({ id: "a", name: "Band", locked: true, editedAt: { square: 1 }, sizes: ["square"] }),
        layer({ id: "b", hidden: true }),
        layer({ id: "c", kind: "medal", name: "Century medal" }),
        layer({ id: "d", kind: "element", element: { id: "ck.scorebar" } }),
      ],
      ctx,
    );
    expect(draft.skipped).toEqual(["Century medal", "element"]);
    expect(draft.document.layers).toEqual([{ id: "e1", kind: "shape", geometry: box }]);
    expect(draft.errors).toEqual([]);
  });

  it("gives a group's children ids under the group's, and records derived palettes", () => {
    const draft = elementFromSelection(
      [
        layer({
          kind: "group",
          children: [layer({ id: "x", style: { background: "var(--ck-chalk)" } })],
        } as never),
      ],
      ctx,
    );
    const group = draft.document.layers[0] as { children: Array<{ id: string }> };
    expect(group.children[0]!.id).toBe("e1-1");
    expect(draft.document.palettes).toEqual(["club-kit"]);
  });

  it("reports what the format rules say is wrong", () => {
    expect(elementFromSelection([], ctx).errors).toContain("An element needs at least one layer.");
  });
});
