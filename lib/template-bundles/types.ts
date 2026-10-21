/**
 * Template bundles (ADR-011): Ovation's converted looks and starters, shipped as
 * JSON in this package and loaded into the template library at server start
 * (`syncBundles()` in the API). Only the API server imports this package — the
 * web app never does (a test enforces it); clubs reach bundle templates through
 * the library routes.
 *
 * Layout, one folder per look:
 *
 *   <look-slug>/look.json      { name, description?, displayOrder? }
 *   <look-slug>/<kind>.json    { name, version, listed, document }
 *
 * A template's slug is `<look-slug>/<kind>`. Versions are immutable once synced:
 * change a document by raising its `version`. `listed` asks for the template to be
 * listed; the server lists it once that version passes the fit check.
 */

/** `look.json`. */
export type BundleLookFile = {
  name: string;
  description?: string;
  displayOrder?: number;
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
