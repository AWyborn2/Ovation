/**
 * Shadows and effects in the Layer panel (B3): box, text and shape shadows,
 * several of each up to the format's four, a converted look's shadows kept
 * whole; and the controls for what B4 added (a border on some sides, a text
 * outline, slant and a blur behind), every edit one the validator accepts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  MAX_SHADOWS,
  templateDocumentErrors,
  type TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";
import { LayerDesignPanel } from "../layer-design-panel";
import { SHADOW_STARTS } from "../shadow-editor";
import type { EditorLayer } from "../template-doc";

afterEach(cleanup);

const panel = (style: TemplateStyleV2, kind: EditorLayer["kind"] = "shape") => {
  const onPatch = vi.fn();
  const layer = {
    id: "l",
    kind,
    content: kind === "text" ? "8" : undefined,
    geometry: { square: { x: 0, y: 0, w: 100, h: 20 } },
    style,
  } as unknown as EditorLayer;
  render(
    <LayerDesignPanel
      layer={layer}
      kind="player"
      page="card"
      onPatch={onPatch}
      onSelect={() => {}}
      onMoveChild={() => {}}
      onUnstack={() => {}}
      onPlay={() => {}}
    />,
  );
  const last = () => onPatch.mock.lastCall![0].style as TemplateStyleV2 | undefined;
  const valid = () =>
    templateDocumentErrors(
      { formatVersion: 2, pages: { card: { layers: [{ ...layer, style: last() }] } } },
      "player",
    );
  return { last, valid };
};

/** Neon Night's glow as the converter writes it: two box shadows, one inside. */
const neon = [
  { x: 0, y: 0, blur: 2.4, color: "#d3175ab3" },
  { x: 0, y: 0, blur: 0.6, spread: 0.1, color: "#ffffff40", inset: true },
];

describe("shadow lists", () => {
  it("shows every shadow a converted look has, spread and inset included", () => {
    panel({ boxShadow: neon });
    const list = screen.getByRole("list", { name: "Box shadow list" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByRole("spinbutton", { name: "Spread" })).toHaveProperty(
      "value",
      "0.1",
    );
    expect(within(rows[1]!).getByRole("checkbox", { name: "Inside" })).toHaveProperty(
      "checked",
      true,
    );
    expect(within(rows[0]!).getByRole("combobox", { name: "Box shadow 1 colour" })).toHaveProperty(
      "value",
      "hex",
    );
  });

  it("adds a shadow or a glow, edits one and removes one, keeping the others", () => {
    const { last, valid } = panel({ boxShadow: neon });
    fireEvent.click(screen.getByRole("button", { name: "Box shadow: add glow" }));
    expect(last()!.boxShadow).toEqual([...neon, SHADOW_STARTS.glow]);
    expect(valid()).toEqual([]);
    const second = within(screen.getByRole("list", { name: "Box shadow list" })).getAllByRole(
      "listitem",
    )[1]!;
    fireEvent.change(within(second).getByRole("spinbutton", { name: "Blur" }), {
      target: { value: "1.2" },
    });
    expect(last()!.boxShadow![1]).toEqual({ ...neon[1], blur: 1.2 });
    fireEvent.click(screen.getByRole("button", { name: "Remove box shadow 1" }));
    expect(last()!.boxShadow).toEqual([neon[1]]);
  });

  it("drops the setting when the last shadow goes, and stops at four", () => {
    const one = panel({ textShadow: [SHADOW_STARTS.glow] }, "text");
    fireEvent.click(screen.getByRole("button", { name: "Remove text shadow 1" }));
    expect(one.last()).toBeUndefined();
    cleanup();
    panel({ dropShadow: Array.from({ length: MAX_SHADOWS }, () => SHADOW_STARTS.shadow) });
    expect(screen.getByRole("button", { name: "Shape shadow: add shadow" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("gives a text layer text shadows, and every layer shape shadows", () => {
    panel({});
    expect(screen.queryByRole("group", { name: "Text shadow" })).toBeNull();
    cleanup();
    const { last, valid } = panel({}, "text");
    fireEvent.click(screen.getByRole("button", { name: "Text shadow: add glow" }));
    expect(last()!.textShadow).toEqual([SHADOW_STARTS.glow]);
    fireEvent.click(screen.getByRole("button", { name: "Shape shadow: add shadow" }));
    expect(last()!.dropShadow).toEqual([SHADOW_STARTS.shadow]);
    expect(valid()).toEqual([]);
  });
});

describe("effects", () => {
  it("draws a border on some sides, back to all four when every side is on", () => {
    const { last, valid } = panel({ border: { width: 0.2, color: "#fff", style: "dashed" } });
    const sides = screen.getByRole("group", { name: "Border sides" });
    fireEvent.click(within(sides).getByRole("checkbox", { name: "Left" }));
    expect(last()!.border).toEqual({
      width: 0.2,
      color: "#fff",
      style: "dashed",
      sides: ["top", "right", "bottom"],
    });
    expect(valid()).toEqual([]);
    cleanup();
    const top = panel({ border: { width: 0.2, color: "#fff", sides: ["top", "right", "bottom"] } });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Border sides" })).getByRole("checkbox", {
        name: "Left",
      }),
    );
    expect(top.last()!.border).toEqual({ width: 0.2, color: "#fff" });
  });

  it("keeps a border's last side on", () => {
    panel({ border: { width: 0.2, color: "#fff", sides: ["top"] } });
    const sides = screen.getByRole("group", { name: "Border sides" });
    expect(within(sides).getByRole("checkbox", { name: "Top" })).toHaveProperty("disabled", true);
    expect(within(sides).getByRole("checkbox", { name: "Left" })).toHaveProperty("checked", false);
  });

  it("outlines text, and makes it outline only", () => {
    const { last, valid } = panel({ textStroke: { width: 0.2, color: "#ffffff38" } }, "text");
    fireEvent.click(screen.getByRole("checkbox", { name: "Outline only" }));
    expect(last()).toEqual({
      textStroke: { width: 0.2, color: "#ffffff38" },
      color: "transparent",
    });
    expect(valid()).toEqual([]);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Outline" }), {
      target: { value: "0" },
    });
    expect(last()).toBeUndefined();
  });

  it("slants a layer and blurs what's behind it, a 0 clearing each", () => {
    const { last, valid } = panel({ fill: "#ffffff14", skew: { x: -14 } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Slant down (°)" }), {
      target: { value: "4" },
    });
    expect(last()!.skew).toEqual({ x: -14, y: 4 });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Blur behind (px)" }), {
      target: { value: "18" },
    });
    expect(last()!.backdropBlur).toBe(18);
    expect(valid()).toEqual([]);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Slant across (°)" }), {
      target: { value: "0" },
    });
    expect(last()!.skew).toBeUndefined();
  });
});
