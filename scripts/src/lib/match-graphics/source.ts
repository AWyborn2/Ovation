/**
 * The vendored Ovation Match Graphics bundle, loaded in Node (plan
 * 2026-10-23, M2). The bundle is one script that reads `window.React` and
 * assigns `window.OvationMatch`; it builds every component with
 * `createElement` alone (no hooks or effects), so React's server renderer
 * draws it exactly as the browser would. Chrome then lays the markup out.
 *
 * React comes from the web app's own dependencies, so the converter needs no
 * React of its own.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { REPO_ROOT } from "../harness-browser";

export const SOURCE_DIR = path.join(REPO_ROOT, "scripts/src/data/ovation-match-graphics");

type ReactLike = {
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown;
  Fragment: unknown;
};

/** What the bundle exports (`index.d.ts`), loosely typed: the converter drives it with plain data. */
export type OvationMatch = Record<string, unknown> & {
  SAMPLE_MATCH: unknown;
  SAMPLE_TEAMS: Record<string, unknown>;
  SAMPLE_COMPETITION: unknown;
};

const webRequire = createRequire(path.join(REPO_ROOT, "artifacts/cricket-club/package.json"));

export const React = webRequire("react") as ReactLike;
const server = webRequire("react-dom/server") as { renderToStaticMarkup: (el: unknown) => string };

/** A component a marker wraps, so its part of the markup can be found again. */
export const COMPONENT_ATTR = "data-omg";

/**
 * The bundle, with its layer components marked: every element the bundle
 * creates of a named component is wrapped in `<div data-omg="Name"
 * style="display:contents">`, which draws nothing and leaves the layout as
 * it is (its children lay out in its parent).
 */
export function loadBundle(opts: { mark?: boolean } = {}): OvationMatch {
  const code = readFileSync(path.join(SOURCE_DIR, "bundle.js"), "utf8");
  const names = new Map<unknown, string>();
  const marking: ReactLike = {
    ...React,
    Fragment: React.Fragment,
    createElement: (type, props, ...children) => {
      const el = React.createElement(type, props, ...children);
      const name = opts.mark ? names.get(type) : undefined;
      return name
        ? React.createElement("div", { [COMPONENT_ATTR]: name, style: { display: "contents" } }, el)
        : el;
    },
  };
  const window: Record<string, unknown> = { React: marking };
  vm.runInNewContext(code, { window, Math, JSON, Object, Array, String, Number, parseInt });
  const ds = window.OvationMatch as OvationMatch;
  for (const [name, value] of Object.entries(ds))
    if (typeof value === "function" && /^[A-Z]/.test(name)) names.set(value, name);
  return ds;
}

/** The markup a component draws with `props`. */
export function renderComponent(
  ds: OvationMatch,
  name: string,
  props: Record<string, unknown>,
  children: unknown[] = [],
): string {
  const component = ds[name];
  if (typeof component !== "function") throw new Error(`OvationMatch has no ${name}`);
  return server.renderToStaticMarkup(React.createElement(component, props, ...children));
}

/** Any React tree, as markup. */
export const renderTree = (el: unknown): string => server.renderToStaticMarkup(el);

/** The Google Fonts stylesheet the bundle loads (`bundle.css`). */
export function bundleFontCss(): string {
  return readFileSync(path.join(SOURCE_DIR, "bundle.css"), "utf8");
}
