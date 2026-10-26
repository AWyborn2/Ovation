import { describe, expect, it } from "vitest";
import { MAX_SVG_BYTES, sanitiseSvg } from "./svg";

const ok = (svg: string) => {
  const result = sanitiseSvg(svg);
  expect(result.errors).toEqual([]);
  return result.svg!;
};
const refused = (svg: unknown) => {
  const result = sanitiseSvg(svg);
  expect(result.svg).toBeNull();
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors;
};

describe("sanitiseSvg (T1.9)", () => {
  it("keeps a Figma-style export, re-serialised", () => {
    const svg = ok(
      `<?xml version="1.0" encoding="UTF-8"?>
      <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- slash -->
        <path d="M0 40L22 0H40L18 40Z" fill="var(--gold)"/>
        <rect x='50' y="4" width="60" height="32" rx="4" stroke="#FFFFFF" stroke-width="2"/>
      </svg>`,
    );
    expect(svg).toBe(
      '<svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M0 40L22 0H40L18 40Z" fill="var(--gold)"/>' +
        '<rect x="50" y="4" width="60" height="32" rx="4" stroke="#FFFFFF" stroke-width="2"/></svg>',
    );
  });

  it("allows gradients, clip paths and masks referenced by id", () => {
    ok(
      `<svg viewBox="0 0 10 10"><defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stop-color="var(--ck-stage, #102030)"/><stop offset="1" stop-color="#fff0"/>
        </linearGradient>
        <clipPath id="c"><circle cx="5" cy="5" r="5"/></clipPath>
        <mask id="m"><rect width="10" height="10" fill="#fff"/></mask>
      </defs><g clip-path="url(#c)" mask="url(#m)"><rect width="10" height="10" fill="url(#g)"/></g></svg>`,
    );
  });

  it.each([
    ["a script element", `<svg><script>alert(1)</script></svg>`],
    ["an event attribute", `<svg onload="alert(1)"><rect width="1" height="1"/></svg>`],
    ["an unquoted event attribute", `<svg/onload=alert(1)>`],
    ["an href", `<svg><a href="https://x.test"><rect width="1" height="1"/></a></svg>`],
    ["an xlink:href on an allowed element", `<svg><path xlink:href="#x" d="M0 0"/></svg>`],
    ["foreignObject", `<svg><foreignObject><div>x</div></foreignObject></svg>`],
    ["an image", `<svg><image href="https://x.test/a.png"/></svg>`],
    ["use", `<svg><use href="#a"/></svg>`],
    [
      "animation",
      `<svg><rect width="1" height="1"><set attributeName="fill" to="red"/></rect></svg>`,
    ],
    [
      "a style attribute",
      `<svg><rect style="fill:url(https://x.test)" width="1" height="1"/></svg>`,
    ],
    ["a class", `<svg><rect class="x" width="1" height="1"/></svg>`],
    [
      "an external url()",
      `<svg><rect fill="url(https://x.test/a.svg#g)" width="1" height="1"/></svg>`,
    ],
    [
      "a javascript address",
      `<svg><rect fill="url(javascript:alert(1))" width="1" height="1"/></svg>`,
    ],
    ["a data address", `<svg><rect fill="url(data:image/svg+xml,x)" width="1" height="1"/></svg>`],
    ["an entity", `<svg><rect fill="&quot;red" width="1" height="1"/></svg>`],
    ["a doctype with entities", `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>`],
    ["CDATA", `<svg><![CDATA[<script>alert(1)</script>]]></svg>`],
    ["a processing instruction", `<?xml-stylesheet href="x.css"?><svg/>`],
    ["text", `<svg>hello</svg>`],
    ["an unclosed element", `<svg><g><rect width="1" height="1"/></svg>`],
    ["a stray closing tag", `<svg></g></svg>`],
    ["two roots", `<svg/><svg/>`],
    ["a root other than svg", `<g><rect width="1" height="1"/></g>`],
    ["an uppercase element", `<svg><SCRIPT>alert(1)</SCRIPT></svg>`],
    ["a foreign namespace", `<svg xmlns="http://www.w3.org/1999/xhtml"/>`],
    [
      "a colour token cards don't have",
      `<svg><rect fill="var(--secret)" width="1" height="1"/></svg>`,
    ],
    [
      "var() with something else inside",
      `<svg><rect fill="var(--gold, red)" width="1" height="1"/></svg>`,
    ],
    ["a semicolon", `<svg><rect fill="red;x" width="1" height="1"/></svg>`],
    ["an attribute set twice", `<svg><rect fill="#000" fill="#fff" width="1" height="1"/></svg>`],
  ])("refuses %s", (_label, svg) => {
    refused(svg);
  });

  it("refuses empty, non-string and oversized markup", () => {
    refused("");
    refused(42);
    const big = `<svg><path d="${"M0 0L1 1".repeat(MAX_SVG_BYTES / 8)}"/></svg>`;
    expect(refused(big)[0]).toMatch(/at most 64 KB/);
  });

  it("names what it refused", () => {
    expect(refused(`<svg><script/></svg>`)[0]).toMatch(/<script>/);
    expect(refused(`<svg><rect onclick="x" width="1"/></svg>`)[0]).toMatch(/onclick/);
  });
});
