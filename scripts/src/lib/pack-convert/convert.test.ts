import { describe, expect, it } from "vitest";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { withinCatalogue } from "./convert";

const box = { square: { x: 0, y: 0, w: 10, h: 10 } };
const text = (id: string, content: string) =>
  ({ id, kind: "text", content, geometry: box }) as TemplateLayerV2;
const image = (id: string, content: string) =>
  ({ id, kind: "image", content, geometry: box }) as TemplateLayerV2;

describe("withinCatalogue", () => {
  it("keeps layers whose tokens the page can bind and drops the rest, saying why", () => {
    const { layers, dropped } = withinCatalogue(
      [
        text("a", "{{playerName}} · CENTURY"),
        image("b", "{{clubLogo}}"),
        image("c", "{{sponsor1}}"),
        text("d", "STATIC LABEL"),
      ],
      "century",
      "card",
    );
    expect(layers.map((l) => l.id)).toEqual(["a", "b", "d"]);
    expect(dropped).toEqual(["image {{sponsor1}} dropped: not in the page's catalogue"]);
  });

  it("checks a rows layer's repeat and cell fields, inside groups too", () => {
    const rows = (id: string, repeat: string, field: string) =>
      ({
        id,
        kind: "rows",
        geometry: box,
        rows: { repeat, rowHeight: 5, cells: [{ field, x: 0, w: 100 }] },
      }) as TemplateLayerV2;
    const group = {
      id: "g",
      kind: "group",
      geometry: box,
      children: [rows("ok", "dayRows", "grade"), rows("bad", "dayRows", "photo")],
    } as TemplateLayerV2;
    const { layers, dropped } = withinCatalogue([group], "matchDay", "day");
    expect((layers[0] as { children: TemplateLayerV2[] }).children.map((l) => l.id)).toEqual([
      "ok",
    ]);
    expect(dropped).toEqual(["rows dayRows dropped: photo not in the page's catalogue"]);
  });
});
