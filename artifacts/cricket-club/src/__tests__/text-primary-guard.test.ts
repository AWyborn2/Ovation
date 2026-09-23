import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Broadcast R2 / AE1: accent-coloured TEXT must use `text-primary-text`, which
 * resolves to the per-tenant contrast-safe `--primary-text` (≥4.5:1 on the
 * card). A bare `text-primary` class paints the raw fill colour, which is
 * unreadable for light brand colours (e.g. a pale yellow) in light mode.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BARE_TEXT_PRIMARY = /(?<![-\w])text-primary(?![-\w])/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("accent text uses the contrast-safe token", () => {
  it("no source file uses a bare `text-primary` class", () => {
    const offenders = walk(SRC)
      .filter((f) => BARE_TEXT_PRIMARY.test(readFileSync(f, "utf-8")))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
