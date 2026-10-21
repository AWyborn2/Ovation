/**
 * The SVG sanitiser for vector layers (ADR-011 §1, T1.9).
 *
 * Vector layers hold SVG markup from the converter, the Figma import and the
 * AI designer, and it is drawn inline in every card, on screen and in the
 * server's headless renderer. So the markup is parsed strictly against an
 * allowlist, never patched up: anything outside it (an element, attribute,
 * link, script, entity, text node or external `url()`) is an error, and the
 * document isn't stored. Fills and strokes may name the card's colour tokens
 * (`var(--gold)`), so a vector follows the club's colours.
 *
 * `sanitiseSvg` also returns the markup re-serialised from what it parsed
 * (comments and an XML declaration dropped, attributes double-quoted), which
 * is what the renderer draws (L1-D, T1.22). Pure string work: no DOM, so the
 * API, the web app and tests share it.
 */
import { COLOUR_TOKENS, DERIVED_PALETTE_PREFIX } from "./format";

/** A vector layer's markup can be at most this long (UTF-16 code units, about bytes). */
export const MAX_SVG_BYTES = 64 * 1024;

/** The elements a vector may use (case-sensitive, as SVG is). */
export const SVG_ELEMENTS = [
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
] as const;

/** Presentation and geometry attributes a vector may use. No `href`, `style`, `class` or events. */
export const SVG_ATTRIBUTES = [
  "xmlns",
  "version",
  "id",
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "d",
  "points",
  "pathLength",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "clip-path",
  "clipPathUnits",
  "mask",
  "maskUnits",
  "maskContentUnits",
  "shape-rendering",
  "vector-effect",
] as const;

const ELEMENTS = new Set<string>(SVG_ELEMENTS);
const ATTRIBUTES = new Set<string>(SVG_ATTRIBUTES);
const SVG_NS = "http://www.w3.org/2000/svg";

/** Characters an attribute value may hold: no quotes, angle brackets, entities, `;`, braces or backslashes. */
const SAFE_VALUE = /^[A-Za-z0-9 \t\n.,#%()+\-_:/*]*$/;
const URL_REF = /url\(\s*([^)]*?)\s*\)/g;
const VAR_REF = /var\(\s*(--[\w-]+)\s*(?:,\s*(#[0-9a-fA-F]{3,8})\s*)?\)/g;

/** Whether `name` is a colour token a document may use: the card's own, or a derived palette's. */
export function isColourTokenName(name: string): boolean {
  return (
    (COLOUR_TOKENS as readonly string[]).includes(name) ||
    Object.values(DERIVED_PALETTE_PREFIX).some((prefix) => name.startsWith(prefix))
  );
}

function checkValue(errors: string[], element: string, name: string, value: string): void {
  const at = `<${element}> ${name}`;
  if (!SAFE_VALUE.test(value)) {
    errors.push(`${at} holds characters SVG layers can't use.`);
    return;
  }
  if (/javascript|expression\s*\(|data:/i.test(value)) {
    errors.push(`${at} holds a script or data address.`);
    return;
  }
  for (const m of value.matchAll(URL_REF)) {
    if (!/^#[\w.-]{1,64}$/.test(m[1] ?? ""))
      errors.push(`${at} can only point at an id in the same SVG, as url(#id).`);
  }
  const withoutVars = value.replace(VAR_REF, (_all, token: string) => {
    if (!isColourTokenName(token))
      errors.push(`${at} names a colour token cards don't have: ${token}.`);
    return "";
  });
  if (/var\(/.test(withoutVars))
    errors.push(`${at} uses var() other than var(--token) or var(--token, #hex).`);
}

type Node = { name: string; attrs: Array<[string, string]>; children: Node[] };

const TAG_OPEN = /<([A-Za-z][\w-]*)((?:\s+[^\s=<>/"']+\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>/y;
const TAG_CLOSE = /<\/([A-Za-z][\w-]*)\s*>/y;
const COMMENT = /<!--[\s\S]*?-->/y;
const XML_DECL = /<\?xml\s[^?<>]*\?>/y;
const SPACE = /\s+/y;
const ATTR = /\s+([^\s=<>/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

function parseAttrs(errors: string[], element: string, source: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  const seen = new Set<string>();
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(source))) {
    const name = m[1] ?? "";
    const value = m[2] ?? m[3] ?? "";
    if (!ATTRIBUTES.has(name)) {
      errors.push(`<${element}> has an attribute SVG layers can't use: ${name.slice(0, 40)}.`);
      continue;
    }
    if (seen.has(name)) errors.push(`<${element}> sets ${name} twice.`);
    seen.add(name);
    if (name === "xmlns") {
      if (element !== "svg" || value !== SVG_NS)
        errors.push(`<${element}> has an xmlns other than SVG's.`);
    } else checkValue(errors, element, name, value);
    attrs.push([name, value]);
  }
  return attrs;
}

/** Parse markup into a tree, reporting everything outside the allowlist. */
function parse(markup: string, errors: string[]): Node | null {
  const stack: Node[] = [];
  let root: Node | null = null;
  let i = 0;
  const at = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = i;
    const m = re.exec(markup);
    if (m) i = re.lastIndex;
    return m;
  };
  while (i < markup.length && errors.length < 20) {
    if (at(SPACE) || at(COMMENT)) continue;
    if (i === markup.search(/\S/) && at(XML_DECL)) continue;
    const close = at(TAG_CLOSE);
    if (close) {
      const open = stack.pop();
      if (!open || open.name !== close[1]) {
        errors.push(`The SVG closes <${(close[1] ?? "").slice(0, 30)}> without opening it.`);
        return null;
      }
      continue;
    }
    const tag = at(TAG_OPEN);
    if (tag) {
      const name = tag[1] ?? "";
      if (!ELEMENTS.has(name)) {
        errors.push(`The SVG uses an element SVG layers can't use: <${name.slice(0, 30)}>.`);
        return null;
      }
      const node: Node = { name, attrs: parseAttrs(errors, name, tag[2] ?? ""), children: [] };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else if (root) {
        errors.push("The SVG must have a single <svg> root.");
        return null;
      } else root = node;
      if (!tag[3]) stack.push(node);
      continue;
    }
    const rest = markup.slice(i, i + 30);
    errors.push(
      rest.startsWith("<")
        ? `The SVG holds markup SVG layers can't use: ${rest.replace(/\s+/g, " ")}…`
        : "The SVG holds text, which SVG layers can't use.",
    );
    return null;
  }
  if (errors.length) return null;
  if (stack.length) errors.push(`The SVG leaves <${stack[stack.length - 1]?.name}> open.`);
  else if (!root) errors.push("The SVG is empty.");
  else if (root.name !== "svg") errors.push("The SVG must start with an <svg> element.");
  return errors.length ? null : root;
}

function serialise(node: Node): string {
  const attrs = node.attrs.map(([k, v]) => ` ${k}="${v}"`).join("");
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serialise).join("")}</${node.name}>`;
}

/** The result of sanitising: the markup to draw, or why it can't be stored. */
export type SvgResult = { svg: string; errors: [] } | { svg: null; errors: string[] };

/** Parse a vector layer's markup against the allowlist; null markup when anything is outside it. */
export function sanitiseSvg(markup: unknown): SvgResult {
  if (typeof markup !== "string" || markup.trim() === "")
    return { svg: null, errors: ["A vector needs SVG markup."] };
  if (markup.length > MAX_SVG_BYTES)
    return { svg: null, errors: [`A vector's SVG can be at most ${MAX_SVG_BYTES / 1024} KB.`] };
  const errors: string[] = [];
  const root = parse(markup, errors);
  return root && errors.length === 0 ? { svg: serialise(root), errors: [] } : { svg: null, errors };
}
