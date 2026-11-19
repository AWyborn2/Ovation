/**
 * Template bundles (ADR-011): Ovation's converted looks and starters, shipped as
 * JSON in this package and loaded into the template library at server start
 * (`syncBundles()` in the API). Only the API server imports this package — the
 * web app never does (a test enforces it); clubs reach bundle templates through
 * the library routes.
 *
 * Layout, one folder per look:
 *
 *   <look-slug>/look.json      { name, description?, displayOrder?, family?, sizes? }
 *   <look-slug>/<kind>.json    { name, version, listed, document }
 *
 *   elements/<look-slug>.json  the look's decorations for the element library
 *                              (written by `scripts/src/extract-elements.ts`)
 *
 * A template's slug is `<look-slug>/<kind>`. Versions are immutable once synced:
 * change a document by raising its `version`. `listed` asks for the template to be
 * listed; the server lists it once that version passes the fit check.
 */

/** A card size a look can design (`TemplateSize` in `@workspace/scorecard`). */
export type BundleLookSize = "square" | "portrait" | "story" | "landscape";

/** `look.json`. */
export type BundleLookFile = {
  name: string;
  description?: string;
  displayOrder?: number;
  /**
   * The design system the look belongs to ("Ovation Match Graphics"): the
   * library shows a family's looks together, and the Elements panel lists the
   * family as one look with a heading per style.
   */
  family?: string;
  /**
   * The sizes the look designs (plan 2026-11-19-portrait-story-sizes, Stage 5):
   * a new look sets `["portrait", "story"]`, and every page of every template
   * must then cover exactly these sizes, with no layer on any other. A look
   * without it (every look from before the change) must cover all four. The
   * bundle fit check enforces both (`check-template-bundles-core.ts`).
   */
  sizes?: BundleLookSize[];
};

/** `<kind>.json`. */
export type BundleTemplateFile = {
  name: string;
  version: number;
  listed: boolean;
  /** A template document (format v1 or v2), checked by the API before it syncs. */
  document: unknown;
};

export type BundleTemplate = {
  kind: string;
  /** sha256 of the `<kind>.json` file, recorded on the synced version. */
  hash: string;
  file: BundleTemplateFile;
};

export type TemplateBundle = {
  slug: string;
  look: BundleLookFile;
  templates: BundleTemplate[];
};

/** One element in `elements/<look-slug>.json` (editable-elements plan, D2). */
export type BundleElement = {
  /** `<look-slug>/<category>/<name>`: what the sync matches rows by. */
  slug: string;
  name: string;
  /** An Elements panel category (`ELEMENT_CATEGORIES` in `@workspace/scorecard`). */
  category: string;
  tags: string[];
  /** What the extraction de-duplicated by. */
  signature: string;
  /** `{ formatVersion: 2, layers, palettes? }`, checked by the API before it syncs. */
  document: unknown;
};

/** `elements/<look-slug>.json`. */
export type BundleElementFile = { look: string; elements: BundleElement[] };

export type ElementBundle = {
  look: string;
  /** sha256 of the file. */
  hash: string;
  file: BundleElementFile;
};
