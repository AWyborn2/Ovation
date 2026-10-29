/**
 * Accent ink only on the accent (Halls Head, Oct 2026): in every committed
 * bundle, text in `--accent-ink` (near-black on Halls Head's gold) sits on a
 * chip, never on the page's dark base, and a hashtag stays on its plate.
 * Clubhouse and Duotone once printed the next home game, the thank-you and
 * their headings in it on the dark base.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accentInkChip, hashtagPastPlate, photoStates } from "./accent-ink";
import type { TemplateSize } from "./document";
import { flattenLayers, type TemplateLayerV2 } from "./format";
import { normaliseDocument } from "./normalise";

const BUNDLES = path.resolve(__dirname, "../../../template-bundles");

function problems(name: string, document: unknown, kind: string): string[] {
  const doc = normaliseDocument(document, kind);
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    if (!p) continue;
    const layers = flattenLayers(p.layers).filter((l) => !l.hidden);
    for (const t of layers) {
      if (t.kind !== "text" || !String(t.style?.color ?? "").includes("--accent-ink")) continue;
      if (t.style?.background) continue;
      for (const size of Object.keys(t.geometry) as TemplateSize[]) {
        if (t.sizes && !t.sizes.includes(size)) continue;
        const label = `${name} ${page} ${size}: ${"content" in t ? t.content : t.id}`;
        for (const photo of photoStates(t))
          if (!accentInkChip(layers, t, size, photo).on)
            out.push(`${label} (off any chip ${photo ? "with" : "without"} the photo)`);
        if (hashtagPastPlate(layers, t, size)) out.push(`${label} (past its plate)`);
      }
    }
  }
  return out;
}

function bundleDocuments(): Array<{ name: string; kind: string; document: unknown }> {
  const out: Array<{ name: string; kind: string; document: unknown }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const { document } = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        document: unknown;
      };
      const kind = file.replace(/\.json$/, "");
      out.push({ name: `${look}/${kind}`, kind, document });
    }
  }
  return out;
}

const box = (x: number, y: number, w: number, h: number) => ({ square: { x, y, w, h } });
const shape = (id: string, fill: string, geometry: ReturnType<typeof box>) =>
  ({ id, kind: "shape", style: { fill }, geometry }) as unknown as TemplateLayerV2;
const ink = (id: string, content: string, geometry: ReturnType<typeof box>) =>
  ({
    id,
    kind: "text",
    content,
    style: { color: "var(--accent-ink)" },
    geometry,
  }) as unknown as TemplateLayerV2;

describe("accent ink only on the accent", () => {
  it("every committed bundle sets accent ink on a chip, and hashtags on their plates", () => {
    const docs = bundleDocuments();
    expect(docs.length).toBeGreaterThan(50);
    expect(docs.flatMap((d) => problems(d.name, d.document, d.kind))).toEqual([]);
  });

  it("reads the topmost painted shape under the text", () => {
    const base = shape("base", "var(--ink)", box(0, 0, 100, 100));
    const gold = shape("gold", "var(--gold)", box(0, 0, 100, 100));
    const corner = shape("corner", "var(--ink)", box(50, 50, 50, 50));
    const onGold = ink("a", "{{x}}", box(10, 10, 20, 5));
    const onCorner = ink("b", "{{x}}", box(60, 90, 30, 4));
    const layers = [base, gold, corner, onGold, onCorner];
    expect(accentInkChip(layers, onGold, "square").on).toBe(true);
    expect(accentInkChip(layers, onCorner, "square").on).toBe(false);
    // A pink chip of the look's own colour counts; a see-through one doesn't.
    const pink = shape("pink", "#DB4178", box(5, 40, 20, 6));
    const clear = shape("clear", "#FFFFFF10", box(5, 60, 20, 6));
    const onPink = ink("c", "{{x}}", box(6, 41, 18, 4));
    const onClear = ink("d", "{{x}}", box(6, 61, 18, 4));
    expect(accentInkChip([base, pink, onPink], onPink, "square").on).toBe(true);
    expect(accentInkChip([base, clear, onClear], onClear, "square").on).toBe(false);
  });

  it("checks each photo state: a dark panel shown only with the photo", () => {
    const gold = shape("gold", "var(--gold)", box(0, 0, 100, 100));
    const corner = {
      ...shape("corner", "var(--ink)", box(50, 50, 50, 50)),
      showWhen: { photo: true },
    } as TemplateLayerV2;
    const tag = ink("t", "{{clubHashtag}}", box(60, 90, 30, 4));
    const layers = [gold, corner, tag];
    expect(photoStates(tag)).toEqual([true, false]);
    expect(accentInkChip(layers, tag, "square", false).on).toBe(true);
    expect(accentInkChip(layers, tag, "square", true).on).toBe(false);
  });

  it("finds a hashtag widened past its gold plate", () => {
    const plate = shape("plate", "var(--gold)", box(55, 90, 39, 4));
    const wide = ink("h", "{{clubHashtag}}", box(6, 90.3, 88, 3.4));
    const fits = ink("h2", "{{clubHashtag}}", box(56.6, 90.3, 37, 3.4));
    expect(hashtagPastPlate([plate, wide], wide, "square")).toEqual(plate.geometry.square);
    expect(hashtagPastPlate([plate, fits], fits, "square")).toBeNull();
  });
});
