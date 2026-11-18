/**
 * The club crest drawn once (Ash's round 4 retest, Nov 2026: Duotone's Team
 * lists cover drew it twice, a second copy 6.5% lower and over the title).
 *
 * For every listed bundle of every look, every page, size, photo state,
 * senior or junior card, sponsors on or off and optional field: the club logo
 * layers drawn at once (a faint watermark, 30% or less, is the no-photo
 * artwork, not a crest) never overlap and are never the same crest stamped
 * twice (two copies the same size). A design may show the crest in its header
 * and again, smaller, beside the club's name in a fixture: that is two roles,
 * two sizes, apart.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { SIZES, type CardSize } from "@/lib/share-card/types";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];
const CREST = "{{clubLogo}}";
/** Two copies whose sides differ by less than this (card %) are the same crest. */
const SAME_SIZE = 0.25;

type Box = { x: number; y: number; w: number; h: number };
type Bundle = { name: string; doc: TemplateDocumentV2 };
type State = {
  size: CardSize;
  photo: boolean;
  junior: boolean;
  sponsors: boolean;
  /** Fields present (an absent key is present). */
  fields: Record<string, boolean>;
};

/** Every listed bundle of every look. */
function listedBundles(): Bundle[] {
  const out: Bundle[] = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (file === "look.json" || !file.endsWith(".json")) continue;
      const bundle = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        listed?: boolean;
        document?: TemplateDocumentV2;
      };
      if (bundle.listed === false || !bundle.document?.pages) continue;
      out.push({ name: `${look}/${file.replace(/\.json$/, "")}`, doc: bundle.document });
    }
  }
  return out;
}

/** A layer and the layers it sits in (groups), outermost first. */
type Placed = { layer: TemplateLayerV2; chain: TemplateLayerV2[] };

function placed(layers: readonly TemplateLayerV2[], up: TemplateLayerV2[] = []): Placed[] {
  return layers.flatMap((layer) => {
    const chain = [...up, layer];
    const kids = (layer as { children?: TemplateLayerV2[] }).children;
    return [{ layer, chain }, ...(Array.isArray(kids) ? placed(kids, chain) : [])];
  });
}

/** The layer's opacity as drawn in `state` (its groups' too), or 0 when it isn't drawn. */
function drawnOpacity(chain: TemplateLayerV2[], s: State): number {
  let opacity = 1;
  for (const l of chain) {
    const when = l.showWhen ?? {};
    if (l.hidden || (l.sizes && !l.sizes.includes(s.size))) return 0;
    if (typeof when.photo === "boolean" && when.photo !== s.photo) return 0;
    if (typeof when.junior === "boolean" && when.junior !== s.junior) return 0;
    if (typeof when.sponsors === "boolean" && when.sponsors !== s.sponsors) return 0;
    if (when.field && s.fields[when.field] === false) return 0;
    if (when.noField && s.fields[when.noField] !== false) return 0;
    const o = (l.style as { opacity?: unknown } | undefined)?.opacity;
    if (typeof o === "number") opacity *= o;
  }
  return opacity;
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const sameSize = (a: Box, b: Box) =>
  Math.abs(a.w - b.w) < SAME_SIZE && Math.abs(a.h - b.h) < SAME_SIZE;

/** Every crest drawn twice on a bundle's pages: "look/kind page size state: a + b". */
function doubledCrests({ name, doc }: Bundle): string[] {
  const out = new Set<string>();
  for (const [page, p] of Object.entries(doc.pages)) {
    const crests = placed(p?.layers ?? []).filter(
      ({ layer }) => layer.kind === "image" && String(layer.content ?? "").trim() === CREST,
    );
    if (crests.length < 2) continue;
    const keys = [
      ...new Set(
        crests.flatMap(({ chain }) =>
          chain.flatMap((l) => [l.showWhen?.field, l.showWhen?.noField].filter(Boolean)),
        ),
      ),
    ] as string[];
    for (const size of SIZE_KEYS)
      for (const photo of [true, false])
        for (const junior of [false, true])
          for (const sponsors of [true, false])
            for (let bits = 0; bits < 1 << keys.length; bits++) {
              const fields = Object.fromEntries(keys.map((k, i) => [k, (bits & (1 << i)) !== 0]));
              const state: State = { size, photo, junior, sponsors, fields };
              const shown = crests.flatMap(({ layer, chain }) => {
                const box = (layer.geometry as Partial<Record<CardSize, Box>>)[size];
                return box && drawnOpacity(chain, state) > 0.3 ? [{ id: layer.id, box }] : [];
              });
              for (let i = 0; i < shown.length; i++)
                for (let j = i + 1; j < shown.length; j++) {
                  const [a, b] = [shown[i]!, shown[j]!];
                  if (!overlap(a.box, b.box) && !sameSize(a.box, b.box)) continue;
                  out.add(
                    `${name} ${page} ${size} ${photo ? "photo" : "no photo"}` +
                      `${junior ? " junior" : ""}: ${a.id} + ${b.id}`,
                  );
                }
            }
  }
  return [...out];
}

describe("The club crest drawn once on every page of every look", () => {
  const bundles = listedBundles();

  it("reads every look's listed bundles", () => {
    const names = bundles.map((b) => b.name);
    for (const n of [
      "duotone/matchDay",
      "duotone/teamList",
      "bold-type/teamList",
      "clubhouse/matchDay",
    ])
      expect(names).toContain(n);
  });

  for (const bundle of bundles)
    it(`${bundle.name}: no page draws the club crest twice`, () => {
      expect(doubledCrests(bundle)).toEqual([]);
    });

  it("would catch Duotone's Team lists cover as it was (a second crest on the no-photo card)", () => {
    const md = bundles.find((b) => b.name === "duotone/matchDay")!;
    const was = structuredClone(md.doc);
    const title = was.pages.title!;
    const crest = title.layers.find((l) => l.kind === "image" && l.content === CREST)!;
    const stray = structuredClone(crest);
    stray.id = "title-l13";
    stray.showWhen = { photo: false };
    for (const g of Object.values(stray.geometry as Record<string, Box>)) g.y += 6.51;
    title.layers.splice(title.layers.indexOf(crest), 0, stray);
    expect(doubledCrests({ name: "duotone/matchDay", doc: was })).toEqual(
      expect.arrayContaining([
        "duotone/matchDay title square no photo: title-l13 + " + crest.id,
        "duotone/matchDay title story no photo junior: title-l13 + " + crest.id,
      ]),
    );
    // With the photo, the stray copy isn't drawn.
    expect(
      doubledCrests({ name: "duotone/matchDay", doc: was }).every((f) => f.includes("no photo")),
    ).toBe(true);
  });

  it("lets a design show the crest in its header and, smaller, beside the club's name", () => {
    // Bold Type's fixture: a header crest and a fixture-line crest, two sizes, apart.
    const bold = bundles.find((b) => b.name === "bold-type/matchDay")!;
    const crests = placed(bold.doc.pages.fixture!.layers).filter(
      ({ layer }) => layer.kind === "image" && layer.content === CREST,
    );
    expect(crests.length).toBeGreaterThanOrEqual(2);
    expect(doubledCrests(bold)).toEqual([]);
  });
});
