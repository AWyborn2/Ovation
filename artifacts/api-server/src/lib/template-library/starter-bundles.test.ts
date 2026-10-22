/**
 * The starters as bundles (ADR-011 T4.11, L4-D). The starters' TypeScript went
 * with T5.18, so the bundles are the starters now: every starter look holds a
 * template for every kind it had, listed except Team List and retired kinds.
 * Its Match Day and Match Summary templates carry the carousel pages from the
 * nearest polished look (L4-D) at version 2; the rest are the original v1
 * documents at version 1. (The web's render tests pin those originals.) And
 * every committed bundle syncs without a problem: a real-DB test that removes
 * what it loaded.
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, libraryTemplatesTable, templateLooksTable } from "@workspace/db";
import { isDocumentV2, primaryPage } from "@workspace/scorecard/kind-templates";
import { isRetiredCardKind } from "@workspace/scorecard";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import { syncBundles } from "./bundles";

const STARTER_LOOKS = ["club-kit-classic", "broadcast-classic", "clubhouse"];
/** The pages L4-D adds to a starter's carousel templates. */
const BORROWED: Record<string, readonly string[]> = {
  matchDay: ["title", "day", "sponsors"],
  matchSummary: ["day"],
};

describe("starter bundles", () => {
  for (const look of STARTER_LOOKS) {
    const bundle = TEMPLATE_BUNDLES.find((b) => b.slug === look);

    it(`${look} carries its carousel pages, and lists everything but Team List`, () => {
      expect(bundle).toBeDefined();
      expect(bundle!.templates.length).toBeGreaterThan(20);
      for (const t of bundle!.templates) {
        const doc = t.file.document;
        if (t.kind in BORROWED) {
          expect(isDocumentV2(doc)).toBe(true);
          if (!isDocumentV2(doc)) continue;
          const primary = primaryPage(t.kind);
          expect(Object.keys(doc.pages).sort()).toEqual([primary, ...BORROWED[t.kind]!].sort());
          expect(t.file).toMatchObject({ version: 2, listed: true });
          continue;
        }
        expect(isDocumentV2(doc)).toBe(false);
        expect(t.file.version).toBe(1);
        expect(t.file.listed).toBe(t.kind !== "teamList" && !isRetiredCardKind(t.kind));
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
