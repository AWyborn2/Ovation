import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Pack animations must be defined in the app, not just referenced.
 *
 * The pack templates are transcribed from Claude Design bundles that declare
 * their keyframes in a `<style>` block. The original conversion took the card
 * markup and left that block behind, so every `animation:` in every pack
 * silently did nothing — Gold Foil's foil sweep sat frozen at its default
 * background position, and Broadcast Dark's "LIVE" / "FULL TIME" dot never
 * pulsed. Nothing caught it: the markup is valid, the property is present, and
 * a still export captures one frame either way.
 *
 * This scans the pack templates for animation names and fails when one has no
 * `@keyframes` in the app stylesheet. Packs C, D and E also use `hhGlow`, so
 * this will hold the line as they land.
 *
 * Lives on the server side for the same reason as the coverage-parity test:
 * api-server runs under node, so reading source works locally as well as in CI
 * (the web suite is jsdom, where `node:fs` cannot be imported).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, "..", "..", "..", "cricket-club", "src");
const PACK_TEMPLATES_DIR = join(WEB_SRC, "lib", "pack-templates");
const APP_CSS = join(WEB_SRC, "index.css");

/** `animation:<name> ...` / `animation-name:<name>` in an inline style string. */
const ANIMATION_RE = /animation(?:-name)?:\s*([A-Za-z_][\w-]*)/g;
/** CSS keywords that can lead an `animation` shorthand before the name. */
const NOT_A_NAME = new Set([
  "none",
  "inherit",
  "initial",
  "unset",
  "revert",
  "infinite",
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "alternate",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
  "normal",
  "reverse",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function usedAnimationNames(): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const file of walk(PACK_TEMPLATES_DIR)) {
    const rel = file.slice(PACK_TEMPLATES_DIR.length + 1).replace(/\\/g, "/");
    for (const m of readFileSync(file, "utf-8").matchAll(ANIMATION_RE)) {
      const name = m[1];
      if (NOT_A_NAME.has(name)) continue;
      const list = byName.get(name) ?? [];
      if (!list.includes(rel)) list.push(rel);
      byName.set(name, list);
    }
  }
  return byName;
}

function definedKeyframes(): Set<string> {
  const css = existsSync(APP_CSS) ? readFileSync(APP_CSS, "utf-8") : "";
  const out = new Set<string>();
  for (const m of css.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)) out.add(m[1]);
  return out;
}

describe("pack card animations are defined in the app", () => {
  const used = usedAnimationNames();
  const defined = definedKeyframes();

  it("finds the pack templates and the app stylesheet it is meant to check", () => {
    // Guard the guard: a moved directory would otherwise make this pass by
    // checking nothing.
    expect(existsSync(PACK_TEMPLATES_DIR), PACK_TEMPLATES_DIR).toBe(true);
    expect(existsSync(APP_CSS), APP_CSS).toBe(true);
    expect(used.size, "no animations found in any pack template").toBeGreaterThan(0);
  });

  it("every animation a pack template uses has @keyframes in index.css", () => {
    const missing = [...used.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `${name} — used by ${files.join(", ")}`);
    expect(
      missing,
      "pack templates reference animations with no @keyframes in src/index.css. " +
        "The declaration is valid CSS, so the animation silently does nothing:\n" +
        missing.map((m) => `  - ${m}`).join("\n"),
    ).toEqual([]);
  });

  it("covers the three names the design bundles define", () => {
    // Named explicitly so a regression that drops one from index.css fails here
    // even if no pack happens to reference it at that moment.
    for (const name of ["hhPulse", "hhShine", "hhGlow"]) {
      expect(defined.has(name), `@keyframes ${name} missing from index.css`).toBe(true);
    }
  });
});
