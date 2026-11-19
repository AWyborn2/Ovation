/** Types for `generate-index.mjs` (the drift test and the bundle fit check import it). */
export function readBundles(
  dir?: string,
): Array<{ slug: string; kinds: Array<{ kind: string; hash: string }> }>;
export function readElementFiles(dir?: string): Array<{ look: string; hash: string }>;
export function renderIndex(dir?: string): string;
export const LOOK_SIZES: readonly ["square", "portrait", "story", "landscape"];
export function lookSizesError(sizes: unknown): string | null;
