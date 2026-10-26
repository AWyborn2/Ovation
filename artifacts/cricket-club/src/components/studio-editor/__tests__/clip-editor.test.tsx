/**
 * The clip editor (B2): presets and their amounts, flipping, reading a
 * converted look's clip back as its preset, point edits within the format's
 * limits, and dragging points on the pad as one gesture.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  MAX_CLIP_POINTS,
  templateDocumentErrors,
  type TemplateClip,
} from "@workspace/scorecard/kind-templates";
import { ClipEditor } from "../clip-editor";
import {
  addPoint,
  flipX,
  movePoint,
  presetOf,
  presetPolygon,
  RECTANGLE,
  removePoint,
  type ClipPolygon,
} from "../clip-ops";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(cleanup);

/** Broadcast Dark's slash as the converter writes it. */
const slash: ClipPolygon = [
  [14.81, 0],
  [100, 0],
  [85.19, 100],
  [0, 100],
];

describe("clip edits", () => {
  it("draws each preset at its amount", () => {
    expect(presetPolygon("slash", 20)).toEqual([
      [20, 0],
      [100, 0],
      [80, 100],
      [0, 100],
    ]);
    expect(presetPolygon("chevron", 15)).toEqual([
      [0, 0],
      [85, 0],
      [100, 50],
      [85, 100],
      [0, 100],
      [15, 50],
    ]);
    expect(presetPolygon("band", 10)[0]).toEqual([0, 10]);
    expect(presetPolygon("corner", 12)).toHaveLength(5);
    expect(presetPolygon("slash", 80)[0]).toEqual([50, 0]);
  });

  it("reads a polygon back as its preset, flipped or not, and anything else as custom", () => {
    expect(presetOf(slash)).toEqual({ preset: "slash", amount: 14.81, flipped: false });
    expect(presetOf(flipX(presetPolygon("chevron", 10)))).toEqual({
      preset: "chevron",
      amount: 10,
      flipped: true,
    });
    expect(presetOf(RECTANGLE)).toBeNull();
    expect(presetOf(movePoint(slash, 1, [100, 5]))).toBeNull();
  });

  it("adds, removes and moves points within the format's limits", () => {
    expect(addPoint(RECTANGLE, 1)).toEqual([
      [0, 0],
      [100, 0],
      [100, 50],
      [100, 100],
      [0, 100],
    ]);
    expect(addPoint(RECTANGLE, 3)[4]).toEqual([0, 50]);
    let many = RECTANGLE;
    for (let i = 0; i < 40; i++) many = addPoint(many, 0);
    expect(many).toHaveLength(MAX_CLIP_POINTS);
    const triangle = removePoint(RECTANGLE, 0);
    expect(triangle).toHaveLength(3);
    expect(removePoint(triangle, 0)).toBe(triangle);
    expect(movePoint(RECTANGLE, 0, [-500, 12.345])[0]).toEqual([-100, 12.35]);
  });
});

describe("the clip editor", () => {
  const editor = (value: TemplateClip | undefined) => {
    const onChange = vi.fn();
    render(<ClipEditor value={value} onChange={onChange} />);
    const last = () => onChange.mock.lastCall![0] as TemplateClip | undefined;
    const valid = (clip: TemplateClip | undefined) =>
      templateDocumentErrors(
        {
          formatVersion: 2,
          pages: {
            card: {
              layers: [
                {
                  id: "s",
                  kind: "shape",
                  geometry: { square: { x: 0, y: 0, w: 50, h: 20 } },
                  style: { fill: "var(--gold)", clip },
                },
              ],
            },
          },
        },
        "player",
      );
    return { onChange, last, valid };
  };

  it("shows a converted slash as Slash at its amount, with its points", () => {
    editor({ polygon: slash });
    expect(screen.getByRole("combobox", { name: "Clip shape" })).toHaveProperty("value", "slash");
    expect(screen.getByRole("spinbutton", { name: "Amount (%)" })).toHaveProperty("value", "14.81");
    expect(
      within(screen.getByRole("list", { name: "Clip points" })).getAllByRole("listitem"),
    ).toHaveLength(4);
  });

  it("picks a preset, changes its amount and flips it, each result valid", () => {
    const { last, valid } = editor(undefined);
    expect(screen.queryByTestId("clip-pad")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Clip shape" }), {
      target: { value: "chevron" },
    });
    expect(last()).toEqual({ polygon: presetPolygon("chevron", 15) });
    expect(valid(last())).toEqual([]);
    cleanup();
    const flipped = editor({ polygon: flipX(presetPolygon("band", 15)) });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount (%)" }), {
      target: { value: "30" },
    });
    expect(flipped.last()).toEqual({ polygon: flipX(presetPolygon("band", 30)) });
    fireEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(flipped.last()).toEqual({ polygon: presetPolygon("band", 15) });
  });

  it("goes custom from the current shape, and None removes the clip", () => {
    const { last } = editor({ polygon: slash });
    fireEvent.change(screen.getByRole("combobox", { name: "Clip shape" }), {
      target: { value: "custom" },
    });
    expect(last()).toEqual({ polygon: slash });
    fireEvent.change(screen.getByRole("combobox", { name: "Clip shape" }), {
      target: { value: "" },
    });
    expect(last()).toBeUndefined();
  });

  it("types, adds and removes points", () => {
    const { last, valid } = editor({ polygon: RECTANGLE });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Point 2 across (%)" }), {
      target: { value: "80" },
    });
    expect(last()!.polygon[1]).toEqual([80, 0]);
    fireEvent.click(screen.getByRole("button", { name: "Add point after 1" }));
    expect(last()!.polygon).toEqual(addPoint(RECTANGLE, 0));
    fireEvent.click(screen.getByRole("button", { name: "Remove clip point 4" }));
    expect(last()!.polygon).toEqual(removePoint(RECTANGLE, 3));
    expect(valid(last())).toEqual([]);
  });

  it("drags a point on the pad as one gesture", () => {
    const { onChange } = editor({ polygon: RECTANGLE });
    const pad = screen.getByTestId("clip-pad");
    // The pad is 120 × 120 px over -10…110 %, so a pixel is a percent.
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 120 }) as DOMRect;
    fireEvent.pointerDown(screen.getByTestId("clip-point-1"), { pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 90, clientY: 20 });
    expect(onChange).toHaveBeenLastCalledWith(
      { polygon: movePoint(RECTANGLE, 1, [80, 10]) },
      false,
    );
    fireEvent.pointerUp(pad);
    expect(onChange).toHaveBeenLastCalledWith({ polygon: RECTANGLE }, true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
