/**
 * The starters as bundles (ADR-011 T4.11, L4-D). The starters' TypeScript went
 * with T5.18, so the bundles are the starters now: every starter look holds a
 * template for every kind it had, listed except Team List and retired kinds.
 * Its Match Day and Match Summary templates carry the carousel pages from the
 * nearest polished look (L4-D). Since C3 every template is format v2 with its
 * Club Kit library elements split into native layers, so nothing on a starter
 * card is an element the editor can't take apart. (The web's render tests pin
 * the original v1 documents, kept as fixtures.) And every committed bundle
 * syncs without a problem: a real-DB test that removes what it loaded.
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, libraryTemplatesTable, templateLooksTable } from "@workspace/db";
import {
  isDocumentV2,
  primaryPage,
  templateDocumentErrors,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";
import { isRetiredCardKind } from "@workspace/scorecard";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import { bundleSetTemplates, syncBundles } from "./bundles";

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
        expect(isDocumentV2(doc)).toBe(true);
        if (!isDocumentV2(doc)) continue;
        const primary = primaryPage(t.kind);
        const borrowed = BORROWED[t.kind] ?? [];
        expect(Object.keys(doc.pages).sort()).toEqual([primary, ...borrowed].sort());
        // No library element is left: every piece is a native layer.
        expect(JSON.stringify(doc)).not.toContain('"kind":"element"');
        // Version 2 or later: a bundle file that changes takes the next version.
        expect(t.file.version).toBeGreaterThanOrEqual(2);
        expect(t.file.listed).toBe(
          t.kind in BORROWED || (t.kind !== "teamList" && !isRetiredCardKind(t.kind)),
        );
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
        TEMPLATE_BUNDLES.flatMap((b) =>
          [...b.templates, ...bundleSetTemplates(b)].map((t) => `${b.slug}/${t.kind}`),
        ),
      ),
    );
    await db.delete(templateLooksTable).where(inArray(templateLooksTable.slug, slugs));
  });

  it("loads every bundle template with no problem", async () => {
    const summary = await syncBundles();
    expect(summary.skipped).toEqual([]);
    expect(summary.looks).toBe(TEMPLATE_BUNDLES.length);
    expect(summary.templates).toBe(
      TEMPLATE_BUNDLES.reduce((n, b) => n + b.templates.length + bundleSetTemplates(b).length, 0),
    );
  });

  it("assembles the four set templates for every look (carousel set editor plan)", () => {
    for (const bundle of TEMPLATE_BUNDLES) {
      const sets = bundleSetTemplates(bundle);
      // A design system's looks (a `family`) design one kind each, so they assemble no sets (M17);
      // nor does a pack with no match day, result or team list design (Sponsored Player).
      const setKinds = ["matchDay", "matchSummary", "teamList"];
      if (bundle.look.family || !bundle.templates.some((t) => setKinds.includes(t.kind))) {
        expect(sets).toEqual([]);
        continue;
      }
      expect(sets.map((s) => s.kind).sort()).toEqual([
        "set:matchDay",
        "set:matchSummary",
        "set:results",
        "set:teamLists",
      ]);
      for (const set of sets) {
        expect(templateDocumentErrors(set.file.document, set.kind)).toEqual([]);
        // Listed exactly when every bundle it is made of is.
        const kinds = new Set((set.file.document as SetDocument).pages.map((p) => p.kind));
        expect(set.file.listed).toBe(
          [...kinds].every((k) => bundle.templates.find((t) => t.kind === k)?.file.listed),
        );
      }
    }
  });
});
