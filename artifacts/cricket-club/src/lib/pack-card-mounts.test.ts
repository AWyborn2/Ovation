import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

/**
 * U4 / R7 — source-level guard against the tenant-branding leak class.
 *
 * `renderPackCard` only overlays tenant data when its optional `data` argument
 * is supplied (`if (data) applyPackData(...)`). A `<PackCard>` mounted without
 * a `data` prop therefore silently falls back to the pack's template samples —
 * which is how the Studio composer and card-type gallery came to show Halls
 * Head's logo, name, hashtag and sponsor to every tenant.
 *
 * A render-level assertion cannot catch this: the renderer behaves correctly in
 * both cases. The defect is that a *call site* forgot to pass the data. So this
 * test reads the source tree and fails on any mount that omits `data`.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Mounts that may legitimately render pack samples with no tenant data. */
const ALLOWLIST = new Set<string>([
  // Intentionally empty. Adding an entry means accepting that this surface
  // shows one club's sample identity to every tenant — justify it in review.
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blank out comments while preserving byte offsets (so reported line numbers
 * stay accurate). These files discuss `<PackCard>` in prose constantly — the
 * scan must not mistake a doc comment for a mount.
 *
 * `//` is only treated as a line comment when it is not preceded by `:`, so
 * URLs inside string literals (`https://…`) survive.
 */
function stripComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

/**
 * Extract each `<PackCard ... />` or `<PackCard ...>` opening tag with its line
 * number. Matches across newlines because the mounts are multi-line JSX.
 */
function findPackCardMounts(source: string): Array<{ line: number; tag: string }> {
  const code = stripComments(source);
  const out: Array<{ line: number; tag: string }> = [];
  const re = /<PackCard(\s[\s\S]*?)?\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    out.push({
      line: code.slice(0, m.index).split("\n").length,
      tag: m[0],
    });
  }
  return out;
}

const hasDataProp = (tag: string): boolean => /\bdata\s*=/.test(tag) || /\{\s*\.\.\./.test(tag);

describe("PackCard mounts pass tenant data (R7)", () => {
  const files = walk(SRC);

  // The scan is only as trustworthy as its matcher, so prove the matcher
  // before trusting a green result from it.
  it("detects an unwired mount (negative control)", () => {
    const mounts = findPackCardMounts(`<PackCard input={i} size={s} sponsorsOn junior={false} />`);
    expect(mounts).toHaveLength(1);
    expect(hasDataProp(mounts[0].tag)).toBe(false);
  });

  it("accepts a wired mount (positive control)", () => {
    const mounts = findPackCardMounts(
      `<PackCard input={i} size={s} sponsorsOn junior={false} data={d} />`,
    );
    expect(mounts).toHaveLength(1);
    expect(hasDataProp(mounts[0].tag)).toBe(true);
  });

  it("ignores <PackCard> mentioned in comments", () => {
    // These files discuss the component constantly; prose is not a mount.
    expect(
      findPackCardMounts(
        `// Reuse the SAME <PackCard> the modal previews.\n/* mounts <PackCard> here */`,
      ),
    ).toHaveLength(0);
  });

  it("finds the PackCard mounts it is meant to be guarding", () => {
    // Guard the guard: if a refactor renames the component or moves the
    // mounts, a silently-zero-match scan would pass forever.
    const total = files.reduce((n, f) => n + findPackCardMounts(readFileSync(f, "utf8")).length, 0);
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it("every <PackCard> mount supplies a `data` prop", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      for (const { line, tag } of findPackCardMounts(readFileSync(file, "utf8"))) {
        // `data={...}` or a `{...spread}` that could carry it.
        if (!hasDataProp(tag)) offenders.push(`src/${rel}:${line}`);
      }
    }

    expect(
      offenders,
      `<PackCard> mounted without a \`data\` prop — these render the pack's ` +
        `sample branding (another club's identity) instead of the tenant's:\n` +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  });
});
