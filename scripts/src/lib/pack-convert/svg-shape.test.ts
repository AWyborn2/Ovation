import { describe, expect, it } from "vitest";
import { sanitiseSvg } from "@workspace/scorecard/kind-templates";
import { explicitColours, straightPath, svgToShape } from "./svg-shape";

const svg = (body: string, attrs = 'viewBox="0 0 100 50" preserveAspectRatio="none"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const px = { w: 200, h: 100 };
const W = 1000;

describe("svgToShape", () => {
  it("turns a polygon into a shape cut to its outline, boxed to its bounds", () => {
    const shape = svgToShape(
      svg('<polygon points="10,0 60,0 50,50 0,50" fill="var(--gold)"/>'),
      px,
      W,
    );
    expect(shape).toEqual({
      box: { x: 0, y: 0, w: 60, h: 100 },
      style: {
        fill: "var(--gold)",
        clip: {
          polygon: [
            [16.67, 0],
            [100, 0],
            [83.33, 100],
            [0, 100],
          ],
        },
      },
    });
  });

  it("keeps a skew polygon's translucency, and needs no clip for a plain box", () => {
    expect(
      svgToShape(
        svg('<polygon points="0,0 100,0 100,50 0,50" fill="#fff" fill-opacity="0.4"/>'),
        px,
        W,
      ),
    ).toEqual({ box: { x: 0, y: 0, w: 100, h: 100 }, style: { fill: "#fff", opacity: 0.4 } });
  });

  it("turns a rect into a box, with its corners and its stroke as a border", () => {
    const shape = svgToShape(
      svg(
        '<rect x="10" y="10" width="40" height="20" rx="2" fill="var(--ink)" stroke="var(--gold)" stroke-width="2"/>',
        'viewBox="0 0 100 50"',
      ),
      px,
      W,
    );
    // Uniform scale 2 (meet): the stroke is 4 px, half outside the rect.
    expect(shape?.box).toEqual({ x: 9, y: 18, w: 42, h: 44 });
    expect(shape?.style).toEqual({
      fill: "var(--ink)",
      radius: 6,
      border: { width: 0.4, color: "var(--gold)" },
    });
  });

  it("turns a line into its stroke's outline", () => {
    const shape = svgToShape(
      svg('<line x1="0" y1="25" x2="100" y2="25" stroke="var(--gold)" stroke-width="10"/>'),
      px,
      W,
    );
    expect(shape?.box).toEqual({ x: 0, y: 40, w: 100, h: 20 });
    expect(shape?.style).toEqual({ fill: "var(--gold)" });
  });

  it("rounds a circle fully, and cuts an ellipse to its outline", () => {
    const circle = svgToShape(
      svg('<circle cx="50" cy="25" r="20" fill="red"/>', 'viewBox="0 0 100 50"'),
      px,
      W,
    );
    expect(circle?.box).toEqual({ x: 30, y: 10, w: 40, h: 80 });
    expect(circle?.style).toEqual({ fill: "red", radius: 10000 });
    const ellipse = svgToShape(
      svg('<ellipse cx="50" cy="25" rx="40" ry="10" fill="red"/>', 'viewBox="0 0 100 50"'),
      px,
      W,
    );
    expect(ellipse?.style.clip?.polygon).toHaveLength(32);
  });

  it("takes a straight path, with relative, H and V commands", () => {
    expect(straightPath("M10 0 h50 l-10 50 H0 z")).toEqual([
      { x: 10, y: 0 },
      { x: 60, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ]);
    expect(straightPath("M0 0 C 10 10 20 20 30 30")).toBeNull();
    expect(straightPath("M0 0 L10 0 L10 10 Z M20 20 L30 20 L30 30 Z")).toBeNull();
    expect(
      svgToShape(svg('<path d="M10 0 h50 l-10 50 H0 z" fill="var(--gold)"/>'), px, W)?.box,
    ).toEqual({
      x: 0,
      y: 0,
      w: 60,
      h: 100,
    });
  });

  it("inherits a wrapper's paint and multiplies its opacity", () => {
    const shape = svgToShape(
      svg(
        '<g fill="var(--gold)" opacity="0.5"><polygon points="0,0 100,0 50,50" opacity="0.5"/></g>',
      ),
      px,
      W,
    );
    expect(shape?.style).toMatchObject({ fill: "var(--gold)", opacity: 0.25 });
  });

  it("leaves anything that isn't one simple, solid element a vector", () => {
    const stays = [
      '<polygon points="0,0 10,0 5,5" fill="red"/><polygon points="0,0 10,0 5,5" fill="red"/>',
      '<path d="M0 0 C 10 10 20 20 30 30 Z" fill="red"/>',
      '<polygon points="0,0 10,0 5,5" fill="url(#g)"/>',
      '<polygon points="0,0 10,0 5,5" fill="red" transform="rotate(10)"/>',
      '<polygon points="0,0 10,0 5,5" fill="red" stroke="blue"/>',
      '<line x1="0" y1="0" x2="10" y2="10"/>',
    ];
    for (const body of stays) expect(svgToShape(svg(body), px, W)).toBeNull();
    expect(
      svgToShape(
        svg(
          '<rect width="10" height="10"/>',
          'viewBox="0 0 10 10" preserveAspectRatio="xMinYMin slice"',
        ),
        px,
        W,
      ),
    ).toBeNull();
  });
});

describe("explicitColours", () => {
  it("gives every drawn element its own colour, taken from its wrappers", () => {
    const out = explicitColours(
      svg(
        '<g fill="var(--gold)" stroke="var(--ink)"><path d="M0 0L1 1"/><circle r="2" fill="red"/></g><line x1="0" y1="0" x2="1" y2="1" stroke="blue"/><rect width="1" height="1"/>',
      ),
    );
    expect(out).toContain('<path d="M0 0L1 1" fill="var(--gold)" stroke="var(--ink)"/>');
    expect(out).toContain('<circle r="2" fill="red" stroke="var(--ink)"/>');
    expect(out).toContain('<line x1="0" y1="0" x2="1" y2="1" stroke="blue"/>');
    expect(out).toContain('<rect width="1" height="1" fill="#000000"/>');
    // The wrapper's own paint is gone, and the markup still passes the sanitiser.
    expect(out).toContain("<g>");
    expect(sanitiseSvg(out).svg).toBe(out);
  });

  it("leaves gradients and clip paths as they are", () => {
    const body =
      '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><path d="M0 0L1 1" fill="url(#g)"/>';
    expect(explicitColours(svg(body))).toContain(body);
  });
});
