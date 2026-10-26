/** Types for `generate-index.mjs` (the drift test imports it). */
export function readBundles(
  dir?: string,
): Array<{ slug: string; kinds: Array<{ kind: string; hash: string }> }>;
export function readElementFiles(dir?: string): Array<{ look: string; hash: string }>;
export function renderIndex(dir?: string): string;
