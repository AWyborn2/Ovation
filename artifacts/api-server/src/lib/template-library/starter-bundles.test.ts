/**
 * The starters as bundles (ADR-011 T4.11): every starter × kind exported,
 * byte-identical to the TypeScript starter, listed except carousel and retired
 * kinds, and every committed bundle syncs without a problem. The sync part is
 * a real-DB test (needs DATABASE_URL) and removes what it loaded.
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, libraryTemplatesTable, templateLooksTable } from "@workspace/db";
import {
  STARTER_IDS,
  TEMPLATE_CARD_KINDS,
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
        expect(JSON.stringify(t.file.document)).toBe(
          JSON.stringify(starterDocument(starter, t.kind)),
        );
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
