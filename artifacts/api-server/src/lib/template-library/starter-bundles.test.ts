/**
 * The starters as bundles (ADR-011 T4.11): every starter × kind exported,
 * byte-identical to the TypeScript starter, listed except carousel and retired
 * kinds, and every committed bundle syncs without a problem. L4-D gives a
 * starter's Match Day and Match Summary templates the carousel pages from its
 * nearest polished look: the starter stays byte-identical as the primary page,
 * the borrowed pages are added, and the template is listed. The sync part is
 * a real-DB test (needs DATABASE_URL) and removes what it loaded.
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, libraryTemplatesTable, templateLooksTable } from "@workspace/db";
import {
  STARTER_IDS,
  TEMPLATE_CARD_KINDS,
  isDocumentV2,
  primaryPage,
  starterDocument,
  type StarterId,
} from "@workspace/scorecard/kind-templates";
import { isRetiredCardKind } from "@workspace/scorecard";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import { syncBundles } from "./bundles";

const STARTER_LOOK: Record<StarterId, string> = {
  "club-kit": "club-kit-classic",
  broadcast: "broadcast-classic",
  clubhouse: "clubhouse",
};
const CAROUSEL = new Set(["matchDay", "matchSummary", "teamList"]);
/** The pages L4-D adds to a starter's carousel templates. */
const BORROWED: Record<string, readonly string[]> = {
  matchDay: ["title", "day", "sponsors"],
  matchSummary: ["day"],
};

describe("starter bundles", () => {
  for (const starter of STARTER_IDS) {
    const bundle = TEMPLATE_BUNDLES.find((b) => b.slug === STARTER_LOOK[starter]);

    it(`${starter} is exported as the ${STARTER_LOOK[starter]} look`, () => {
      expect(bundle).toBeDefined();
      const kinds = TEMPLATE_CARD_KINDS.filter((k) => starterDocument(starter, k));
      expect(bundle!.templates.map((t) => t.kind).sort()).toEqual([...kinds].sort());
    });

    it(`${starter}'s documents are byte-identical to the TypeScript starters`, () => {
      for (const t of bundle?.templates ?? []) {
        const original = starterDocument(starter, t.kind)!;
        const doc = t.file.document;
        if (isDocumentV2(doc)) {
          const primary = primaryPage(t.kind);
          expect(JSON.stringify(doc.pages[primary]!.layers)).toBe(
            JSON.stringify(original.layers),
          );
          expect(Object.keys(doc.pages).sort()).toEqual([primary, ...BORROWED[t.kind]!].sort());
          expect(t.file.version).toBe(2);
          expect(t.file.listed).toBe(true);
          continue;
        }
        expect(JSON.stringify(doc)).toBe(JSON.stringify(original));
        expect(t.file.version).toBe(1);
        expect(t.file.listed).toBe(!CAROUSEL.has(t.kind) && !isRetiredCardKind(t.kind));
      }
    });
  }
});

describe("syncing the committed bundles", () => {
  const slugs = TEMPLATE_BUNDLES.map((b) => b.slug);
  afterAll(async () => {
    await db.delete(libraryTemplatesTable).where(
      inArray(
        libraryTemplatesTable.slug,
        TEMPLATE_BUNDLES.flatMap((b) => b.templates.map((t) => `${b.slug}/${t.kind}`)),
      ),
    );
    await db.delete(templateLooksTable).where(inArray(templateLooksTable.slug, slugs));
  });

  it("loads every bundle template with no problem", async () => {
    const summary = await syncBundles();
    expect(summary.skipped).toEqual([]);
    expect(summary.looks).toBe(TEMPLATE_BUNDLES.length);
    expect(summary.templates).toBe(TEMPLATE_BUNDLES.reduce((n, b) => n + b.templates.length, 0));
  });
});
