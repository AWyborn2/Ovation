/**
 * The converter's DOM walk (ADR-011 §5): every element of a mounted pack card
 * with its tag, `data-*` attributes, box relative to the card root, the
 * computed styles that matter, `::before` / `::after`, and its own text runs.
 * Dev and CI builds only (see `./index.ts`).
 *
 * Styles are recorded by difference, so a capture stays small: a
 * non-inherited property when it differs from a bare element of the same tag,
 * an inherited one when it differs from the parent. Text-bearing elements
 * always carry their full text styles, so a text layer never has to walk up
 * the tree for its font.
 */

import type {
  CaptureDetail,
  CapturedBox,
  CapturedElement,
  CapturedText,
} from "@workspace/scorecard/pack-capture";

/** Inherited properties: recorded when they differ from the parent. */
const TEXT_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant-caps",
  "font-variant-numeric",
  "font-feature-settings",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-align",
  "text-indent",
  "white-space",
  "word-break",
  "overflow-wrap",
  "hyphens",
  "writing-mode",
  "color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-width",
  "-webkit-text-stroke-color",
  "text-shadow",
  "visibility",
] as const;

/** Non-inherited properties: recorded when they differ from the tag's default. */
const BOX_PROPS = [
  "display",
  "position",
  "z-index",
  "overflow-x",
  "overflow-y",
  "box-sizing",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "align-content",
  "align-self",
  "row-gap",
  "column-gap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "grid-template-columns",
  "grid-template-rows",
  "grid-auto-flow",
  "text-overflow",
  "-webkit-line-clamp",
  "text-decoration-line",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-clip",
  "background-origin",
  "background-blend-mode",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "outline-width",
  "outline-style",
  "outline-color",
  "outline-offset",
  "box-shadow",
  "opacity",
  "transform",
  "transform-origin",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "isolation",
  "clip-path",
  "mask-image",
  "object-fit",
  "object-position",
  "animation-name",
  "animation-duration",
  "animation-delay",
  "animation-iteration-count",
  "animation-timing-function",
  "animation-direction",
  "animation-fill-mode",
] as const;

/** Extra properties a pseudo-element needs: its content and where it sits. */
const PSEUDO_PROPS = ["content", "top", "right", "bottom", "left", "width", "height"] as const;

/** What `colours` detail keeps: everything a palette can change. */
const COLOUR_PROPS = new Set<string>([
  "color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "text-shadow",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "filter",
  "backdrop-filter",
  "mask-image",
]);

const SIDES = ["top", "right", "bottom", "left"] as const;
const SKIP_TAGS = new Set(["style", "script", "template", "noscript", "link", "meta"]);
const MAX_SVG = 64 * 1024;
const MAX_DATA_URL = 160;

const SENTINEL_IMAGE = /sentinel(?::|%3A)([A-Za-z0-9_.-]+)/;

/**
 * A sentinel image's data URL as `sentinel:<name>` (see `sentinelImage`), any
 * other long data URL as `data:<type>…(<n> chars)`; anything else unchanged.
 */
export function shortenUrls(value: string): string {
  return value.replace(/data:([a-z0-9.+/-]+)[^)"'\s]*/gi, (url, type: string) => {
    const sentinel = SENTINEL_IMAGE.exec(url)?.[1];
    if (sentinel) return `sentinel:${sentinel}`;
    return url.length > MAX_DATA_URL ? `data:${type}…(${url.length} chars)` : url;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

function relBox(r: DOMRect | DOMRectReadOnly, origin: DOMRect): CapturedBox {
  return {
    x: round(r.left - origin.left),
    y: round(r.top - origin.top),
    w: round(r.width),
    h: round(r.height),
  };
}

/** Bare elements per tag, in an off-screen sandbox, for default values. */
class Defaults {
  private sandbox: HTMLElement;
  private cache = new Map<string, Map<string, string>>();

  constructor(doc: Document) {
    this.sandbox = doc.createElement("div");
    this.sandbox.setAttribute("aria-hidden", "true");
    this.sandbox.style.cssText =
      "position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden";
    doc.body.appendChild(this.sandbox);
  }

  get(tag: string, prop: string): string {
    let values = this.cache.get(tag);
    if (!values) {
      const el = this.sandbox.ownerDocument.createElement(tag);
      this.sandbox.appendChild(el);
      const cs = getComputedStyle(el);
      values = new Map();
      for (const p of [...BOX_PROPS, ...PSEUDO_PROPS]) values.set(p, cs.getPropertyValue(p));
      // A pseudo-element is an inline box: its defaults are a span's.
      el.remove();
      this.cache.set(tag, values);
    }
    return values.get(prop) ?? "";
  }

  dispose() {
    this.sandbox.remove();
  }
}

/** Defaults that depend on the element itself rather than its tag. */
function isNoise(cs: CSSStyleDeclaration, prop: string, value: string): boolean {
  // A transform origin only means something with a transform.
  if (prop === "transform-origin") return cs.getPropertyValue("transform") === "none";
  // A border colour defaults to the text colour; it shows only on a drawn side.
  for (const side of SIDES) {
    if (prop === `border-${side}-color`) {
      return (
        cs.getPropertyValue(`border-${side}-style`) === "none" ||
        parseFloat(cs.getPropertyValue(`border-${side}-width`)) === 0
      );
    }
  }
  if (prop === "outline-color" || prop === "outline-offset")
    return cs.getPropertyValue("outline-style") === "none";
  // The text fill and stroke follow the text colour unless set.
  if (prop === "-webkit-text-fill-color") return value === cs.getPropertyValue("color");
  if (prop === "-webkit-text-stroke-color")
    return parseFloat(cs.getPropertyValue("-webkit-text-stroke-width")) === 0;
  if (prop.startsWith("animation-") && prop !== "animation-name")
    return cs.getPropertyValue("animation-name") === "none";
  return false;
}

function styleOf(
  cs: CSSStyleDeclaration,
  parent: CSSStyleDeclaration | null,
  tag: string,
  defaults: Defaults,
  detail: CaptureDetail,
  fullText: boolean,
  extra: readonly string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  const keep = (prop: string) => detail === "full" || COLOUR_PROPS.has(prop);
  for (const prop of TEXT_PROPS) {
    if (!keep(prop)) continue;
    const value = cs.getPropertyValue(prop);
    if (isNoise(cs, prop, value)) continue;
    if (fullText || !parent || parent.getPropertyValue(prop) !== value) out[prop] = value;
  }
  for (const prop of [...BOX_PROPS, ...extra]) {
    if (!keep(prop)) continue;
    const value = cs.getPropertyValue(prop);
    if (value === defaults.get(tag, prop) || isNoise(cs, prop, value)) continue;
    out[prop] = shortenUrls(value);
  }
  return out;
}

function pseudoStyle(
  el: Element,
  which: "::before" | "::after",
  cs: CSSStyleDeclaration,
  defaults: Defaults,
  detail: CaptureDetail,
): Record<string, string> | undefined {
  const ps = getComputedStyle(el, which);
  const content = ps.getPropertyValue("content");
  if (!content || content === "none" || content === "normal") return undefined;
  const style = styleOf(ps, cs, "span", defaults, detail, false, PSEUDO_PROPS);
  style.content = shortenUrls(content);
  return style;
}

function textRuns(el: Element, origin: DOMRect): CapturedText[] {
  const runs: CapturedText[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(node);
    // jsdom has no layout: fall back to the element's own box.
    const rects = typeof range.getClientRects === "function" ? range.getClientRects() : null;
    const box =
      typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : el.getBoundingClientRect();
    const tops = new Set<number>();
    for (const r of Array.from(rects ?? [])) if (r.width > 0) tops.add(Math.round(r.top));
    runs.push({ text, box: relBox(box, origin), lines: Math.max(1, tops.size) });
  }
  return runs;
}

/** The `@keyframes` rules the document defines, by name (cross-origin sheets skipped). */
function keyframeRules(doc: Document): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSKeyframesRule) out.set(rule.name, rule.cssText);
      else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules)
        visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A cross-origin sheet (Google Fonts) can't be read; it holds no keyframes.
    }
  }
  return out;
}

export interface DomCapture {
  elements: CapturedElement[];
  keyframes: Record<string, string>;
}

/** Walk the card under `root` (the `.pack-card-root`). */
export function captureCardDom(root: HTMLElement, detail: CaptureDetail): DomCapture {
  const doc = root.ownerDocument;
  const defaults = new Defaults(doc);
  const origin = root.getBoundingClientRect();
  const elements: CapturedElement[] = [];
  const animations = new Set<string>();

  const walk = (el: Element, parent: number | null, parentStyle: CSSStyleDeclaration | null) => {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const cs = getComputedStyle(el);
    const id = elements.length;
    const rect = el.getBoundingClientRect();
    const entry: CapturedElement = { id, parent, tag, box: relBox(rect, origin), style: {} };
    elements.push(entry);

    const data: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (!attr.name.startsWith("data-")) continue;
      const key = attr.name.slice(5).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      data[key] = shortenUrls(attr.value);
    }
    if (Object.keys(data).length) entry.data = data;
    const className = el.getAttribute("class");
    if (className) entry.className = className;
    // Custom properties as written, `var()` kept: how a pack derives its colours.
    const inline = (el as HTMLElement).style;
    if (inline && detail !== "boxes") {
      const vars: Record<string, string> = {};
      for (const name of Array.from(inline))
        if (name.startsWith("--")) vars[name] = shortenUrls(inline.getPropertyValue(name).trim());
      if (Object.keys(vars).length) entry.vars = vars;
    }

    if (cs.display === "none") {
      entry.hidden = "display";
      return;
    }
    if (cs.visibility === "hidden") entry.hidden = "visibility";

    if (el instanceof HTMLElement) {
      const { offsetWidth: w, offsetHeight: h } = el;
      if (Math.abs(w - rect.width) > 0.5 || Math.abs(h - rect.height) > 0.5)
        entry.size = { w: round(w), h: round(h) };
    }

    const text = detail === "colours" ? [] : textRuns(el, origin);
    if (text.length) entry.text = text;
    if (detail !== "boxes") {
      entry.style = styleOf(cs, parentStyle, tag, defaults, detail, text.length > 0);
      const before = pseudoStyle(el, "::before", cs, defaults, detail);
      const after = pseudoStyle(el, "::after", cs, defaults, detail);
      if (before) entry.before = before;
      if (after) entry.after = after;
      for (const s of [entry.style, before, after]) {
        const names = s?.["animation-name"];
        if (names && names !== "none") for (const n of names.split(",")) animations.add(n.trim());
      }
    }

    if (tag === "img")
      entry.src = shortenUrls((el as HTMLImageElement).currentSrc || el.getAttribute("src") || "");
    if (tag === "svg") {
      const markup = el.outerHTML;
      entry.svg =
        markup.length > MAX_SVG ? `${markup.slice(0, MAX_SVG)}<!-- truncated -->` : markup;
      return;
    }
    for (const child of Array.from(el.children)) walk(child, id, cs);
  };

  try {
    walk(root, null, null);
  } finally {
    defaults.dispose();
  }

  const keyframes: Record<string, string> = {};
  if (animations.size) {
    const rules = keyframeRules(doc);
    for (const name of animations) {
      const css = rules.get(name);
      if (css) keyframes[name] = css;
    }
  }
  return { elements, keyframes };
}
