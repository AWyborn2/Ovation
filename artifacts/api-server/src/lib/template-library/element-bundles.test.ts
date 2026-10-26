/**
 * Syncing the element library's bundle files (editable-elements plan, D2):
 * every committed element is valid, and the sync inserts, rewrites only what
 * changed, keeps Ovation's unlisting and removes what left the files.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db, libraryElementsTable, templateLooksTable } from "@workspace/db";
import { isElementCategory } from "@workspace/scorecard/kind-templates";
import {
  ELEMENT_BUNDLES,
  TEMPLATE_BUNDLES,
  type BundleElement,
  type ElementBundle,
} from "@workspace/template-bundles";
import { syncElementBundles } from "./element-bundles";
import { elementSaveErrors } from "./elements";

/** Element files that aren't a look's: the free kits (`public/library-assets/CREDITS.md`), with their sizes. */
const KITS: Record<string, number> = {
  "textures-kit": 40,
  "seamless-patterns": 40,
  "hero-patterns": 87,
  "tabler-icons": 52,
  "phosphor-icons": 23,
  "game-icons": 14,
  coolshapes: 92,
  "fluent-emoji": 20,
};
const WEB_PUBLIC = path.resolve(__dirname, "../../../../cricket-club/public");

const STAMP = Date.now();
const LOOK = `eb-${STAMP}`;

const element = (name: string, over: Partial<BundleElement> = {}): BundleElement => ({
  slug: `${LOOK}/rules/${name.toLowerCase().replace(/\s+/g, "-")}`,
  name,
  category: "rules",
  tags: ["Rule", LOOK],
  signature: "abc",
  document: {
    formatVersion: 2,
    layers: [
      {
        id: "e1",
        kind: "shape",
        geometry: { square: { x: 6, y: 50, w: 30, h: 1 } },
        style: { fill: "var(--gold)" },
      },
    ],
  },
  ...over,
});

const bundle = (elements: BundleElement[]): ElementBundle[] => [
  { look: LOOK, hash: "h", file: { look: LOOK, elements } },
];

const rows = () =>
  db
    .select()
    .from(libraryElementsTable)
    .where(like(libraryElementsTable.slug, `${LOOK}/%`));

describe("the committed element files", () => {
  it("cover every look and are all valid", () => {
    const looks = new Set(TEMPLATE_BUNDLES.map((b) => b.slug));
    expect(ELEMENT_BUNDLES.length).toBeGreaterThanOrEqual(10);
    const slugs = new Set<string>();
    for (const b of ELEMENT_BUNDLES) {
      expect(looks.has(b.look) || b.look in KITS).toBe(true);
      expect(b.file.look).toBe(b.look);
      for (const e of b.file.elements) {
        expect(e.slug.startsWith(`${b.look}/${e.category}/`)).toBe(true);
        expect(slugs.has(e.slug)).toBe(false);
        slugs.add(e.slug);
        expect(isElementCategory(e.category)).toBe(true);
        expect(e.name.trim()).not.toBe("");
        expect({ slug: e.slug, errors: elementSaveErrors(e.document) }).toEqual({
          slug: e.slug,
          errors: [],
        });
      }
    }
    expect(slugs.size).toBeGreaterThan(50);
  });

  it("hold every kit's elements, and ship every image they draw with the web app", () => {
    const kits = ELEMENT_BUNDLES.filter((b) => b.look in KITS);
    expect(Object.fromEntries(kits.map((b) => [b.look, b.file.elements.length]))).toEqual(KITS);
    for (const b of kits) {
      for (const e of b.file.elements) {
        const layers = (e.document as { layers: Array<{ kind: string; content?: string }> }).layers;
        if (layers[0]!.kind !== "image") continue;
        const src = layers[0]!.content!;
        expect(src.startsWith("/library-assets/")).toBe(true);
        expect({ src, exists: existsSync(path.join(WEB_PUBLIC, src)) }).toEqual({
          src,
          exists: true,
        });
      }
    }
  });
});

describe("syncElementBundles", () => {
  let lookId: number;

  beforeAll(async () => {
    const [look] = await db
      .insert(templateLooksTable)
      .values({ slug: LOOK, name: "Element Bundle Look", origin: "bundle" })
      .returning();
    lookId = look!.id;
  });

  afterAll(async () => {
    await db.delete(libraryElementsTable).where(like(libraryElementsTable.slug, `${LOOK}/%`));
    await db.delete(templateLooksTable).where(eq(templateLooksTable.slug, LOOK));
    // Put the real bundle elements back for any suite that runs after this one.
    await syncElementBundles();
  });

  it("inserts each element, credited to its look, listed", async () => {
    const summary = await syncElementBundles(bundle([element("Gold rule"), element("Ink rule")]));
    expect(summary).toMatchObject({ elements: 2, changed: 2, skipped: [] });
    const synced = await rows();
    expect(synced).toHaveLength(2);
    expect(synced[0]).toMatchObject({
      origin: "bundle",
      lookId,
      listed: true,
      category: "rules",
      tags: ["rule", LOOK],
      authorTenantId: null,
    });
  });

  it("rewrites only what changed, and keeps Ovation's unlisting", async () => {
    await db
      .update(libraryElementsTable)
      .set({ listed: false, unlistedBy: "ovation", unlistReason: "Too busy" })
      .where(eq(libraryElementsTable.slug, `${LOOK}/rules/ink-rule`));
    const summary = await syncElementBundles(
      bundle([element("Gold rule", { tags: ["rule", "gold"] }), element("Ink rule")]),
    );
    expect(summary).toMatchObject({ elements: 2, changed: 1 });
    const synced = await rows();
    expect(synced.find((r) => r.name === "Gold rule")!.tags).toEqual(["rule", "gold"]);
    expect(synced.find((r) => r.name === "Ink rule")).toMatchObject({
      listed: false,
      unlistedBy: "ovation",
    });
  });

  it("skips an invalid element and removes one that left the files", async () => {
    const summary = await syncElementBundles(
      bundle([
        element("Gold rule", { tags: ["rule", "gold"] }),
        element("Bad rule", { category: "stickers" }),
        element("Remote rule", {
          document: {
            formatVersion: 2,
            layers: [{ id: "e1", kind: "image", content: "https://evil.test/x.png" }],
          },
        }),
      ]),
    );
    expect(summary.skipped.map((s) => s.slug)).toEqual([
      `${LOOK}/rules/bad-rule`,
      `${LOOK}/rules/remote-rule`,
    ]);
    expect(summary.removed).toBeGreaterThanOrEqual(1);
    expect((await rows()).map((r) => r.name)).toEqual(["Gold rule"]);
  });
});
