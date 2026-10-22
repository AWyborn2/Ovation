/**
 * The gradient editor (B1): stop positions as CSS places them, adding and
 * removing stops within the format's limits, switching type; and the Layer
 * panel editing a converted look's radial, many-stop fill without losing
 * stops, every edit one the validator accepts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  MAX_GRADIENT_STOPS,
  templateDocumentErrors,
  type TemplateGradient,
  type TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";
import { LayerDesignPanel } from "../layer-design-panel";
import {
  addStop,
  DEFAULT_GRADIENT,
  isGradient,
  removeStop,
  setStop,
  stopPositions,
  withType,
} from "../gradient-ops";
import type { EditorLayer } from "../template-doc";

afterEach(cleanup);

const radial: TemplateGradient = {
  type: "radial",
  shape: "circle",
  at: { x: 30, y: 20 },
  stops: [{ color: "var(--ck-stage)" }, { color: "#ffffff22" }, { color: "var(--panel)" }],
};

describe("gradient edits", () => {
  it("places stops as CSS does: ends at 0 and 100, the rest evenly, never backwards", () => {
    expect(stopPositions(radial.stops)).toEqual([0, 50, 100]);
    expect(
      stopPositions([
        { color: "#000", at: 20 },
        { color: "#111" },
        { color: "#222" },
        { color: "#333", at: 80 },
      ]),
    ).toEqual([20, 40, 60, 80]);
    expect(
      stopPositions([
        { color: "#000", at: 60 },
        { color: "#111", at: 10 },
      ]),
    ).toEqual([60, 60]);
  });

  it("adds a stop in the widest gap, in the colour before it, writing every position down", () => {
    const g = addStop({
      type: "linear",
      stops: [
        { color: "#000", at: 0 },
        { color: "#111", at: 20 },
        { color: "#222", at: 100 },
      ],
    });
    expect(g.stops).toEqual([
      { color: "#000", at: 0 },
      { color: "#111", at: 20 },
      { color: "#111", at: 60 },
      { color: "#222", at: 100 },
    ]);
    expect(addStop(radial).stops.map((s) => s.at)).toEqual([0, 25, 50, 100]);
  });

  it("keeps between two and eight stops", () => {
    expect(removeStop(DEFAULT_GRADIENT, 0)).toBe(DEFAULT_GRADIENT);
    expect(removeStop(radial, 1).stops).toEqual([radial.stops[0], radial.stops[2]]);
    let g: TemplateGradient = DEFAULT_GRADIENT;
    for (let i = 0; i < 10; i++) g = addStop(g);
    expect(g.stops).toHaveLength(MAX_GRADIENT_STOPS);
  });

  it("sets a stop's colour or position, positions kept within 0 to 100", () => {
    expect(setStop(radial, 1, { color: "var(--gold)" }).stops[1]).toEqual({ color: "var(--gold)" });
    expect(setStop(radial, 1, { at: 140 }).stops[1]!.at).toBe(100);
  });

  it("switches type keeping the stops", () => {
    const linear = withType(radial, "linear");
    expect(linear).toEqual({ type: "linear", angle: 180, stops: radial.stops });
    expect(withType(linear, "radial")).toEqual({
      type: "radial",
      shape: "ellipse",
      at: { x: 50, y: 50 },
      stops: radial.stops,
    });
    expect(isGradient(radial)).toBe(true);
    expect(isGradient("var(--gold)")).toBe(false);
  });
});

describe("the Layer panel's gradient editor", () => {
  const panel = (style: TemplateStyleV2, kind: EditorLayer["kind"] = "shape") => {
    const onPatch = vi.fn();
    const layer = {
      id: "stage",
      kind,
      content: kind === "text" ? "8" : undefined,
      geometry: { square: { x: 0, y: 0, w: 100, h: 100 } },
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
    const last = () => onPatch.mock.lastCall![0].style as TemplateStyleV2;
    const valid = (style: TemplateStyleV2) =>
      templateDocumentErrors(
        { formatVersion: 2, pages: { card: { layers: [{ ...layer, style }] } } },
        "player",
      );
    return { onPatch, last, valid };
  };

  it("shows a converted look's radial fill with all its stops and its derived-palette colour", () => {
    panel({ fill: radial });
    const editor = screen.getByRole("group", { name: "Fill gradient" });
    expect(within(editor).getByRole("combobox", { name: "Fill gradient type" })).toHaveProperty(
      "value",
      "radial",
    );
    expect(within(editor).getByRole("combobox", { name: "Fill gradient shape" })).toHaveProperty(
      "value",
      "circle",
    );
    const stops = within(editor).getByRole("list", { name: "Fill gradient stops" });
    expect(within(stops).getAllByRole("listitem")).toHaveLength(3);
    const first = within(editor).getByRole("combobox", { name: "Fill stop 1 colour" });
    expect(first).toHaveProperty("value", "--ck-stage");
    expect(within(first).getByRole("option", { name: "--ck-stage" })).toBeTruthy();
  });

  // Each edit starts from the layer as given: the spy doesn't re-render the panel.
  it("adds, edits and removes stops, every result valid", () => {
    const { onPatch, last, valid } = panel({ fill: radial });
    fireEvent.click(screen.getByRole("button", { name: "Add fill stop" }));
    expect((last().fill as TemplateGradient).stops).toHaveLength(4);
    expect(valid(last())).toEqual([]);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Stop 2 at (%)" }), {
      target: { value: "35" },
    });
    expect((last().fill as TemplateGradient).stops[1]).toEqual({ color: "#ffffff22", at: 35 });
    fireEvent.click(screen.getByRole("button", { name: "Remove fill stop 3" }));
    expect((last().fill as TemplateGradient).stops.map((s) => s.color)).toEqual([
      "var(--ck-stage)",
      "#ffffff22",
    ]);
    fireEvent.change(screen.getByRole("combobox", { name: "Fill gradient type" }), {
      target: { value: "linear" },
    });
    expect(last().fill).toEqual({ type: "linear", angle: 180, stops: radial.stops });
    expect(onPatch).toHaveBeenCalledTimes(4);
  });

  it("can't remove a two-stop gradient's stops", () => {
    panel({ fill: DEFAULT_GRADIENT });
    expect(screen.getByRole("button", { name: "Remove fill stop 1" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("starts a gradient in the club's colours, a colour token cards have", () => {
    const { last, valid } = panel({ fill: "#123456" });
    fireEvent.change(screen.getByRole("combobox", { name: "Fill" }), {
      target: { value: "gradient" },
    });
    expect(last().fill).toEqual(DEFAULT_GRADIENT);
    expect(valid(last())).toEqual([]);
  });

  it("names the club's colour --gold, and offers no token cards lack", () => {
    const { last, valid } = panel({ fill: "#123456" });
    const colour = screen.getByRole("combobox", { name: "Fill colour" });
    expect(within(colour).getByRole("option", { name: "Club colour" })).toHaveProperty(
      "value",
      "--gold",
    );
    expect(within(colour).queryByRole("option", { name: "--accent" })).toBeNull();
    fireEvent.change(colour, { target: { value: "--gold" } });
    expect(last().fill).toBe("var(--gold)");
    expect(valid(last())).toEqual([]);
  });

  it("edits a text fill's foil with the same editor", () => {
    const { last } = panel(
      { textFill: { type: "linear", angle: 90, stops: radial.stops } },
      "text",
    );
    fireEvent.click(screen.getByRole("button", { name: "Text fill diagonal down" }));
    expect(last().textFill).toEqual({ type: "linear", angle: 135, stops: radial.stops });
  });
});
