/**
 * A junior card's photo slot never prints as a bare gap (Ash, retest 3, Nov
 * 2026). A junior card shows a photo only when it is the club's approved
 * junior stock (ADR-007); otherwise it draws the page as a senior card with
 * no photo. So on every page a junior card or set can draw, a photo slot
 * that takes a real share of the card must have the look's no-photo design
 * behind it: a `showWhen: { photo: false }` layer (a brand panel, a crest, a
 * no-photo accent), the look's own faint crest drawn on that size, or a
 * frame that goes with the photo (`showWhen: { photo: true }`), so the page
 * closes up as Bold Type's does.
 *
 * Read from the bundle files on disk, as the other bundle tests are.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JUNIOR_PAGES,
  flattenLayers,
  normaliseDocument,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import { SIZES, type CardSize } from "@/lib/share-card/types";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];
/** A photo slot this share of the card or more would read as a gap left bare. */
const SLOT_AREA = 0.15;

type Box = { x: number; y: number; w: number; h: number };

/** Every listed bundle of a kind a junior card can be. */
function juniorBundles(): Array<{ name: string; kind: string; doc: TemplateDocumentV2 }> {
  const out: Array<{ name: string; kind: string; doc: TemplateDocumentV2 }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      const kind = file.replace(/\.json$/, "");
      if (file === "look.json" || !JUNIOR_PAGES[kind]) continue;
      const bundle = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        listed?: boolean;
        document: unknown;
      };
      if (bundle.listed === false) continue;
      out.push({
        name: `${look}/${kind}`,
        kind,
        doc: normaliseDocument(bundle.document, kind) as TemplateDocumentV2,
      });
    }
  }
  return out;
}

const on = (l: TemplateLayerV2, size: CardSize): Box | null =>
  l.hidden || (l.sizes && !l.sizes.includes(size))
    ? null
    : ((l.geometry as Partial<Record<CardSize, Box>> | undefined)?.[size] ?? null);

/** A faint club crest (a watermark), drawn whatever the photo. */
const crestWatermark = (l: TemplateLayerV2) =>
  l.kind === "image" &&
  String(l.content ?? "").includes("{{clubLogo}}") &&
  typeof (l.style as { opacity?: unknown } | undefined)?.opacity === "number" &&
  ((l.style as { opacity: number }).opacity ?? 1) <= 0.3 &&
  l.showWhen?.photo !== true;

/** A solid frame drawn only with the photo (not a scrim over it): the slot closes up without one. */
const photoFrame = (l: TemplateLayerV2) =>
  l.kind === "shape" &&
  l.showWhen?.photo === true &&
  typeof (l.style as { fill?: unknown } | undefined)?.fill === "string";

/** Pages and sizes where a junior card's photo slot would be a bare gap. */
function bareSlots(name: string, kind: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  for (const page of JUNIOR_PAGES[kind] ?? []) {
    const layers = flattenLayers(doc.pages[page]?.layers ?? []).filter(
      (l) => l.showWhen?.junior !== false,
    );
    for (const size of SIZE_KEYS) {
      const slot = layers
        .filter((l) => l.kind === "photo" && l.showWhen?.photo === undefined)
        .map((l) => on(l, size))
        .filter((b): b is Box => !!b)
        .reduce((max, b) => Math.max(max, (b.w * b.h) / 10000), 0);
      if (slot < SLOT_AREA) continue;
      const designed = layers.some(
        (l) =>
          on(l, size) &&
          (l.showWhen?.photo === false ||
            crestWatermark(l) ||
            (photoFrame(l) && (on(l, size)!.w * on(l, size)!.h) / 10000 >= slot * 0.8)),
      );
      if (!designed) out.push(`${name} ${page} ${size}: ${Math.round(slot * 100)}% photo slot`);
    }
  }
  return out;
}

describe("Junior cards: no bare photo slot", () => {
  const bundles = juniorBundles();

  it("reads every listed bundle of a junior kind", () => {
    expect(bundles.map((b) => b.name)).toContain("broadcast-dark/teamList");
    expect(bundles.map((b) => b.name)).toContain("club-kit/matchDay");
    expect(bundles.length).toBeGreaterThanOrEqual(60);
  });

  it("every page a junior draws has the look's no-photo design behind a large photo slot", () => {
    expect(bundles.flatMap((b) => bareSlots(b.name, b.kind, b.doc))).toEqual([]);
  });

  it("a Team List shows the no-photo design where the senior card's photo goes, not a gap", () => {
    // Retest 5 (Ash): Bold Type's junior Team List closed up its photo slot
    // (its frame goes with the photo) and drew nothing where the senior card
    // shows the photo; every Team List draws its look's crest panel there.
    const missing: string[] = [];
    for (const b of bundles.filter((x) => x.kind === "teamList"))
      for (const size of SIZE_KEYS) {
        const layers = flattenLayers(b.doc.pages.team?.layers ?? []);
        const slot = layers.some((l) => l.kind === "photo" && on(l, size));
        const designed = layers.some(
          (l) =>
            on(l, size) && (l.showWhen?.photo === false || crestWatermark(l)) && l.kind !== "text",
        );
        if (slot && !designed) missing.push(`${b.name} ${size}`);
      }
    expect(missing).toEqual([]);
  });

  it("would catch Broadcast Dark's Team List as it was (no no-photo design)", () => {
    const team = bundles.find((b) => b.name === "broadcast-dark/teamList")!;
    const was = structuredClone(team.doc);
    was.pages.team!.layers = was.pages.team!.layers.filter((l) => l.showWhen?.photo !== false);
    expect(bareSlots("broadcast-dark/teamList", "teamList", was)).toHaveLength(4);
  });
});
