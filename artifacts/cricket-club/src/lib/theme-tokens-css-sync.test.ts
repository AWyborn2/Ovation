import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { deriveThemeTokens } from "./theme-tokens";

/**
 * index.css's :root/.dark colour tokens are documented as "generated from
 * deriveThemeTokens(DEFAULT_BRAND, mode)" — this test is the enforcement for
 * that comment: it fails loudly if someone hand-edits one without
 * regenerating the other, so the static pre-JS fallback can't silently drift
 * from what the function actually computes (Phase 5 U2).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(__dirname, "../index.css");

function extractBlock(css: string, selector: string): Record<string, string> {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const match = re.exec(css);
  if (!match) throw new Error(`Could not find ${selector} block in index.css`);
  const tokens: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = /^\s*(--[a-z-]+):\s*([^;]+);/.exec(line);
    if (!m) continue;
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

// Only the colour tokens deriveThemeTokens produces — index.css's :root/.dark
// blocks also carry non-colour tokens (fonts, radius, juniors-accent) that
// aren't part of this generated set.
const COLOUR_KEYS = Object.keys(deriveThemeTokens(DEFAULT_BRAND, "dark"));

describe("index.css colour tokens stay in sync with deriveThemeTokens(DEFAULT_BRAND, mode)", () => {
  const css = readFileSync(CSS_PATH, "utf-8");
  const root = extractBlock(css, ":root");
  const dark = extractBlock(css, ".dark");
  const expectedLight = deriveThemeTokens(DEFAULT_BRAND, "light");
  const expectedDark = deriveThemeTokens(DEFAULT_BRAND, "dark");

  for (const key of COLOUR_KEYS) {
    it(`:root ${key} matches deriveThemeTokens(DEFAULT_BRAND, "light")`, () => {
      expect(root[key]).toBe(expectedLight[key]);
    });
    it(`.dark ${key} matches deriveThemeTokens(DEFAULT_BRAND, "dark")`, () => {
      expect(dark[key]).toBe(expectedDark[key]);
    });
  }
});
