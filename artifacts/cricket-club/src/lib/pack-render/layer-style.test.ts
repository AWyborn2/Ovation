/**
 * Format v2 styles, vectors and motion (L1-D, T1.18–T1.23): fills and
 * gradients, text fills, borders and shadows, blend modes, photo filters and
 * overlays, derived palettes, sanitised vectors, entrance and loop motion,
 * and the clip-length rule.
 */
import { describe, expect, it } from "vitest";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolvePackTokens,
  type CardAdjustments,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { clipDuration } from "./animation-clock";
import { renderFreeLayers } from "./adjustments";
import { cssColour, fillCss } from "./layer-style";
import { motionCss } from "./layer-motion";
import { duotoneFilterId, duotonePaletteFor } from "./duotone-vars";

const tokens = resolvePackTokens({
  brand: brandDefaultTokens({ primaryColour: "#1f6f43", backgroundColour: "#0c2a1b" }),
  theme: null,
  junior: false,
});
const brand = { name: "Sample", primaryColour: "#1f6f43", backgroundColour: "#0c2a1b" };
const box = { square: { x: 10, y: 10, w: 80, h: 20 } };
const v2 = (layers: TemplateLayerV2[], extra: Record<string, unknown> = {}): CardAdjustments =>
  ({ formatVersion: 2, pages: { card: { layers } }, ...extra }) as CardAdjustments;
const draw = (doc: CardAdjustments, animate = false) =>
  renderFreeLayers(
    doc,
    "square",
    { animate },
    { playerName: "Sam Keeper" },
    { tokens, brand, kind: "player" },
  );
/** The style attribute of the element marked `data-layer-id="<id>"`. */
const wrapper = (html: string, id: string) =>
  new RegExp(`data-layer-id="${id}"[^>]*style="([^"]*)"`).exec(html)?.[1] ?? "";

describe("colours and fills (T1.18)", () => {
  it("accepts hex, colour tokens and rgb/hsl, and nothing else", () => {
    for (const ok of [
      "#fff",
      "#1F6F43",
      "#1f6f4380",
      "var(--gold)",
      "var(--ck-stage, #000)",
      "rgba(0,0,0,.5)",
      "hsl(120 50% 40%)",
      "transparent",
    ])
      expect(cssColour(ok), ok).toBe(ok);
    for (const bad of [
      "red",
      "#ggg",
      "var(--x);color:red",
      "url(x)",
      'var(--gold)"',
      "expression(1)",
      3,
      null,
    ])
      expect(cssColour(bad), String(bad)).toBeNull();
  });

  it("draws linear and radial gradients with token or hex stops", () => {
    expect(
      fillCss({
        type: "linear",
        angle: 135,
        stops: [
          { color: "var(--gold)", at: 0 },
          { color: "#000", at: 100 },
        ],
      }),
    ).toBe("linear-gradient(135deg, var(--gold) 0%, #000 100%)");
    expect(
      fillCss({
        type: "radial",
        shape: "circle",
        at: { x: 30, y: 0 },
        stops: [{ color: "#fff" }, { color: "var(--ink)" }],
      }),
    ).toBe("radial-gradient(circle at 30% 0%, #fff, var(--ink))");
    expect(fillCss({ type: "linear", stops: [{ color: "#fff" }] })).toBe(
      "linear-gradient(180deg, #fff, #fff)",
    );
    expect(fillCss({ type: "linear", stops: [{ color: "nope" }] })).toBeNull();
    expect(fillCss("var(--panel)")).toBe("var(--panel)");
  });

  it("paints a shape with its fill, and a text layer's box behind its text", () => {
    const html = draw(
      v2([
        {
          id: "bar",
          kind: "shape",
          geometry: box,
          style: {
            fill: { type: "linear", stops: [{ color: "var(--gold)" }, { color: "#000" }] },
            radius: 8,
          },
        },
        {
          id: "name",
          kind: "text",
          content: "{{playerName}}",
          geometry: box,
          style: { fill: "#123456" },
        },
      ]),
    );
    expect(html).toContain(
      "background:linear-gradient(180deg, var(--gold), #000);border-radius:8px",
    );
    expect(wrapper(html, "name")).toContain("background:#123456");
  });

  it("clips a text fill to the glyphs", () => {
    const html = draw(
      v2([
        {
          id: "big",
          kind: "text",
          content: "{{playerName}}",
          geometry: box,
          style: {
            textFill: { type: "linear", stops: [{ color: "#f5d77a" }, { color: "#8a6a1f" }] },
          },
        },
      ]),
    );
    expect(html).toMatch(
      /background:linear-gradient\(180deg, #f5d77a, #8a6a1f\);background-size:100% 100%;-webkit-background-clip:text;background-clip:text;color:transparent/,
    );
  });
});

describe("borders, shadows and blend modes (T1.19)", () => {
  it("adds them to the layer's box, scaling with the card", () => {
    const html = draw(
      v2([
        {
          id: "panel",
          kind: "shape",
          geometry: box,
          style: {
            radius: 12,
            border: { width: 0.4, color: "var(--gold)", style: "dashed" },
            boxShadow: [
              { x: 0, y: 1, blur: 2, spread: 0.5, color: "rgba(0,0,0,.4)" },
              { x: 0, y: 0, blur: 1, color: "#fff", inset: true },
            ],
            blend: "multiply",
          },
        },
        {
          id: "glow",
          kind: "text",
          content: "{{playerName}}",
          geometry: box,
          style: { textShadow: [{ x: 0, y: 0, blur: 1.5, color: "var(--gold)" }], lineHeight: 0.9 },
        },
      ]),
    );
    const panel = wrapper(html, "panel");
    expect(panel).toContain("border:0.4cqw dashed var(--gold);box-sizing:border-box");
    expect(panel).toContain(
      "box-shadow:0cqw 1cqw 2cqw 0.5cqw rgba(0,0,0,.4), inset 0cqw 0cqw 1cqw #fff",
    );
    expect(panel).toContain("border-radius:12px");
    expect(panel).toContain("mix-blend-mode:multiply");
    expect(html).toContain("text-shadow:0cqw 0cqw 1.5cqw var(--gold);line-height:0.9");
  });

  it("leaves out what isn't valid", () => {
    const html = draw(
      v2([
        {
          id: "x",
          kind: "shape",
          geometry: box,
          style: {
            border: { width: 1, color: "red" },
            blend: "plus-lighter" as never,
            boxShadow: [{ x: 0, y: 0, blur: 1, color: "x" }],
          },
        },
      ]),
    );
    expect(wrapper(html, "x")).not.toMatch(/border|box-shadow|mix-blend/);
  });
});

describe("photo filters and overlays (T1.20)", () => {
  const photoInput = { kind: "player", playerName: "Sam" } as ShareCardInput;
  const card = (filter: unknown, overlay?: unknown) =>
    renderPackCard(
      photoInput,
      "square",
      true,
      tokens,
      false,
      { brand, photoUrl: "https://cdn.example.org/p.jpg" },
      BLANK_PACK_ID,
      v2([{ id: "pic", kind: "photo", geometry: box, style: { filter, overlay } as never }]),
    );

  it("greys and blurs, blur capped at 20 px", () => {
    expect(
      wrapper(
        card([
          { preset: "grayscale", amount: 0.8 },
          { preset: "blur", px: 50 },
        ]),
        "pic",
      ),
    ).toContain("filter:grayscale(0.8) blur(20px)");
  });

  it("maps a photo onto the Duotone pack's own gradient from its palette", () => {
    const html = card([{ preset: "duotone", dark: "var(--dt-ink)", light: "var(--dt-p)" }]);
    const id = duotoneFilterId(duotonePaletteFor(tokens, brand));
    expect(wrapper(html, "pic")).toContain(`filter:url(#${id})`);
    expect(html).toContain(`<filter id="${id}"`);
  });

  it("maps a photo onto any two colours, resolving tokens to the club's", () => {
    const html = card([{ preset: "duotone", dark: "#101010", light: "var(--gold)" }]);
    const id = /filter:url\(#(tpl-duo-[0-9a-f-]+)\)/.exec(html)?.[1];
    expect(id).toMatch(/^tpl-duo-101010-[0-9a-f]{6}$/);
    expect(html).toContain(`<filter id="${id}"`);
  });

  it("lays grain and halftone over the photo", () => {
    expect(card(undefined, { kind: "grain", opacity: 0.2 })).toContain('data-overlay="grain"');
    const halftone = card(undefined, { kind: "halftone", scale: 2 });
    expect(halftone).toContain('data-overlay="halftone"');
    expect(halftone).toContain("background-size:2cqw 2cqw");
    expect(halftone).not.toContain('"url(');
  });
});

describe("derived palettes (T1.21)", () => {
  const vars = (html: string) => /class="pack-free-layers" style="([^"]*)"/.exec(html)?.[1] ?? "";
  const shape = (background: string): TemplateLayerV2 => ({
    id: "s",
    kind: "shape",
    geometry: box,
    style: { background },
  });

  it("emits Duotone's palette when a v2 document uses or declares it", () => {
    expect(vars(draw(v2([shape("var(--dt-p)")])))).toContain("--dt-p:");
    expect(vars(draw(v2([shape("#000")], { palettes: ["duotone"] })))).toContain("--dt-ink:");
    expect(vars(draw(v2([shape("#000")])))).not.toContain("--dt-");
  });

  it("emits Club Kit's when declared, as it already did when used", () => {
    expect(vars(draw(v2([shape("#000")], { palettes: ["club-kit"] })))).toContain("--ck-stage:");
    expect(vars(draw(v2([shape("var(--ck-stage)")])))).toContain("--ck-stage:");
  });

  it("never adds Duotone's palette to a v1 document", () => {
    expect(vars(draw({ layers: [shape("var(--dt-p)")] } as CardAdjustments))).not.toContain(
      "--dt-",
    );
  });
});

describe("vector layers (T1.22)", () => {
  const vector = (svg: string, id = "v"): TemplateLayerV2 => ({
    id,
    kind: "vector",
    svg,
    geometry: box,
  });

  it("draws sanitised SVG filling its box, with token fills and namespaced ids", () => {
    const html = draw(
      v2([
        vector(
          '<svg viewBox="0 0 10 10" width="10" height="10"><defs><linearGradient id="g"><stop offset="0" stop-color="var(--gold)"/></linearGradient></defs><path d="M0 0L10 10" fill="url(#g)"/></svg>',
          "slash",
        ),
      ]),
    );
    expect(html).toContain(
      '<div data-vector style="width:100%;height:100%"><svg viewBox="0 0 10 10" width="100%" height="100%"',
    );
    expect(html).toContain('id="v-slash-g"');
    expect(html).toContain('fill="url(#v-slash-g)"');
    expect(html).toContain('stop-color="var(--gold)"');
  });

  it("draws nothing for markup the sanitiser refuses", () => {
    for (const bad of [
      "<svg><script>alert(1)</script></svg>",
      '<svg onload="alert(1)"><path d="M0 0"/></svg>',
      '<svg><a href="https://x.example.org"><path d="M0 0"/></a></svg>',
      "<div></div>",
    ])
      expect(draw(v2([vector(bad)])), bad).not.toContain('data-layer-id="v"');
  });
});

describe("motion (T1.23)", () => {
  it("keeps v1's entrance strings, and takes a duration and easing", () => {
    expect(motionCss({ in: { preset: "rise", delayMs: 200 } }, true)).toEqual([
      "animation:packLayerRise .7s cubic-bezier(.2,.8,.2,1) both",
      "animation-delay:200ms",
    ]);
    expect(
      motionCss({ in: { preset: "fade", durationMs: 1200, easing: "ease-in" } }, true),
    ).toEqual(["animation:packLayerFade 1.2s ease-in both"]);
    expect(motionCss({ in: { preset: "pop" } }, false)).toEqual([]);
  });

  it("pulses like the packs' LIVE dot, after an entrance", () => {
    expect(motionCss({ loop: { preset: "pulse" } }, true)).toEqual([
      "animation:packLoopPulse 1.4s ease-in-out infinite",
    ]);
    expect(
      motionCss(
        { in: { preset: "pop", delayMs: 100 }, loop: { preset: "pulse", periodMs: 2000 } },
        true,
      ),
    ).toEqual([
      "animation:packLayerPop .5s cubic-bezier(.2,1.4,.4,1) both, packLoopPulse 2s ease-in-out infinite",
      "animation-delay:100ms, 0ms",
    ]);
  });

  it("sweeps a foil text fill on the text, and inlines the loops' keyframes", () => {
    const foil = v2([
      {
        id: "num",
        kind: "text",
        content: "{{playerName}}",
        geometry: box,
        style: {
          textFill: { type: "linear", stops: [{ color: "#f5d77a" }, { color: "#8a6a1f" }] },
        },
        motion: { loop: { preset: "shine" } },
      },
    ]);
    const animated = draw(foil, true);
    expect(animated).toContain("background-size:100% 220%");
    expect(animated).toContain("animation:packLoopShine 5.5s ease-in-out infinite");
    expect(animated).toContain("@keyframes packLoopShine");
    expect(wrapper(animated, "num")).not.toContain("packLoopShine");
    const still = draw(foil, false);
    expect(still).not.toContain("animation:");
    expect(still).not.toContain("<style>");
  });

  it("doesn't let a loop lengthen a clip", () => {
    const entrance = {
      currentTime: 0,
      pause() {},
      effect: { getComputedTiming: () => ({ endTime: 1200 }) },
    };
    const loop = {
      currentTime: 0,
      pause() {},
      effect: { getComputedTiming: () => ({ endTime: Infinity }) },
    };
    expect(clipDuration([entrance, loop])).toBe(clipDuration([entrance]));
  });
});
