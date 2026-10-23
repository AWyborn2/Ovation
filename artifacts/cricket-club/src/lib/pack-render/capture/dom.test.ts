import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCardDom } from "./dom";

// jsdom has no layout, so boxes are zero here; the browser run (convert-pack)
// covers geometry. This pins the walk itself: order, attributes, leaves, skips.
function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

beforeEach(() => {
  // jsdom has no pseudo-element styles: report none rather than log "not implemented".
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) =>
    pseudo ? ({ getPropertyValue: () => "none" } as unknown as CSSStyleDeclaration) : real(el),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("captureCardDom", () => {
  it("walks the card in pre-order with parents, data attributes and own text", () => {
    const root = mount(
      `<div class="pack-card-root" style="--gold:#D3175A">` +
        `<style>.x{color:red}</style>` +
        `<div data-slot="photo" data-slot-type="photo" data-drop-if-field="photo"></div>` +
        `<div data-repeat="players" data-repeat-max="12"><div data-fit-row="1">[[row.surname]]</div></div>` +
        `<p data-fit="name">Hello <b>[[playerName]]</b></p>` +
        `</div>`,
    );
    const { elements } = captureCardDom(root, "full");
    expect(elements.map((e) => e.tag)).toEqual(["div", "div", "div", "div", "p", "b"]);
    expect(elements.map((e) => e.parent)).toEqual([null, 0, 0, 2, 0, 4]);
    expect(elements[0]!.className).toBe("pack-card-root");
    expect(elements[1]!.data).toEqual({
      slot: "photo",
      slotType: "photo",
      dropIfField: "photo",
    });
    expect(elements[2]!.data).toEqual({ repeat: "players", repeatMax: "12" });
    expect(elements[3]!.data).toEqual({ fitRow: "1" });
    expect(elements[4]!.data).toEqual({ fit: "name" });
    // Only an element's own text runs: the bold child holds the marker.
    expect(elements[4]!.text?.map((t) => t.text)).toEqual(["Hello"]);
    expect(elements[5]!.text?.map((t) => t.text)).toEqual(["[[playerName]]"]);
  });

  it("keeps inline SVG as one leaf with its markup, and stops at display:none", () => {
    const root = mount(
      `<div><svg viewBox="0 0 10 10"><path d="M0 0L10 10" fill="var(--gold)"/></svg>` +
        `<div style="display:none"><span>gone</span></div></div>`,
    );
    const { elements } = captureCardDom(root, "full");
    expect(elements.map((e) => e.tag)).toEqual(["div", "svg", "div"]);
    expect(elements[1]!.svg).toContain('fill="var(--gold)"');
    expect(elements[2]!.hidden).toBe("display");
  });

  it("records no styles at boxes detail", () => {
    const root = mount(`<div style="color:rgb(1, 2, 3)"><span>Text</span></div>`);
    const { elements } = captureCardDom(root, "boxes");
    for (const e of elements) expect(e.style).toEqual({});
    expect(elements[1]!.text?.[0]?.text).toBe("Text");
  });
});
