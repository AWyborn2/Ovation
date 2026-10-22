/**
 * The draft pipeline on the library (ADR-011 L3-B): lazy defaults from the
 * club's pack look (T3.14), the pilot guard (T3.15), templated drafts with
 * their template ref (T3.16), carousel assembly (T3.20), the pilot carry-over
 * (T3.22) and every club (T3.23). Real-DB test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "@workspace/scorecard/card-content";
import {
  placeholderDocument,
  primaryPage,
  type PageKey,
} from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { ensureKindTemplate, templatedDesignFor } from "../kind-templates";
import { assembleCarouselDocument, assembleCarouselPages, designFromRef } from "./draw";
import { documentCoverage } from "./coverage";

const STAMP = Date.now();
const LOOKS = [
  "club-kit",
  "broadcast-dark",
  "duotone",
  "broadcast-classic",
  "club-kit-classic",
  `pl-${STAMP}`,
];
const tenants: number[] = [];
const ids: Record<string, number> = {};

const box = { x: 5, y: 5, w: 90, h: 20 };
const layer = (id: string) => ({
  id,
  kind: "shape",
  geometry: { square: box, portrait: box, story: box, landscape: box },
});
/** A v2 document with one shape per page, named after the template and page. */
const pagesDoc = (name: string, pages: PageKey[]) => ({
  formatVersion: 2,
  pages: Object.fromEntries(pages.map((p) => [p, { layers: [layer(`${name}-${p}`)] }])),
});

async function look(slug: string): Promise<number> {
  const [row] = await db
    .insert(templateLooksTable)
    .values({ slug, name: slug, origin: "bundle" })
    .onConflictDoUpdate({ target: templateLooksTable.slug, set: { name: slug } })
    .returning();
  return row!.id;
}

async function libraryTemplate(
  lookSlug: string,
  kind: string,
  document: unknown,
  listed = true,
): Promise<number> {
  const lookId = await look(lookSlug);
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      slug: `${lookSlug}/${kind}`,
      lookId,
      kind,
      name: `${lookSlug} ${kind}`,
      origin: "bundle",
      listed,
    })
    .returning();
  await db.insert(libraryTemplateVersionsTable).values({
    templateId: t!.id,
    version: 1,
    document,
    coverage: documentCoverage(document, kind),
    fitStatus: "pass",
  });
  ids[`${lookSlug}/${kind}`] = t!.id;
  return t!.id;
}

async function tenant(name: string): Promise<number> {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `pl-${name}-${STAMP}`,
      centralClubId: 1_000_000 + (STAMP % 100_000) * 20 + tenants.length,
      name,
      plan: "pro",
    })
    .returning();
  tenants.push(t!.id);
  return t!.id;
}

beforeAll(async () => {
  // Guard against leftovers from an earlier run using the real look slugs.
  await db.delete(libraryTemplatesTable).where(
    inArray(
      libraryTemplatesTable.slug,
      LOOKS.flatMap((l) =>
        ["milestone", "matchDay", "matchSummary", "teamList", "player", "premiership"].map(
          (k) => `${l}/${k}`,
        ),
      ),
    ),
  );
  await libraryTemplate("club-kit", "milestone", placeholderDocument("milestone"));
  await libraryTemplate("broadcast-dark", "milestone", placeholderDocument("milestone"));
  await libraryTemplate(
    "club-kit",
    "matchDay",
    pagesDoc("ck-md", ["fixture", "title", "day", "sponsors"]),
  );
  await libraryTemplate("club-kit", "matchSummary", pagesDoc("ck-ms", ["result", "day"]));
  await libraryTemplate("duotone", "matchDay", pagesDoc("dt-md", ["fixture", "title", "sponsors"]));
  // A look with a Match Summary but no Match Day template.
  await libraryTemplate(`pl-${STAMP}`, "matchSummary", pagesDoc("pl-ms", ["result", "day"]));
});

afterAll(async () => {
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  await db
    .delete(libraryTemplatesTable)
    .where(inArray(libraryTemplatesTable.id, Object.values(ids)));
  await db.delete(templateLooksTable).where(inArray(templateLooksTable.slug, LOOKS));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const defaultOf = async (tenantId: number, kind: string) => {
  const [row] = await db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.baseKind, kind),
        eq(cardTemplatesTable.isKindDefault, true),
      ),
    );
  return row!;
};

describe("lazy defaults from the club's pack look (T3.14, T3.23)", () => {
  it("every club gets its default from the right look", async () => {
    const clubKit = await tenant("ck");
    const broadcast = await tenant("bd");
    const duotone = await tenant("dt");
    const hidden = await tenant("gf");
    await ensureKindTemplate(clubKit, "milestone", "club-kit-v1");
    await ensureKindTemplate(broadcast, "milestone", "broadcast-dark-v1");
    await ensureKindTemplate(duotone, "milestone", "duotone-v1");
    await ensureKindTemplate(duotone, "matchDay", "duotone-v1");
    await ensureKindTemplate(hidden, "milestone", "gold-foil-v1");
    expect((await defaultOf(clubKit, "milestone")).originTemplateId).toBe(
      ids["club-kit/milestone"],
    );
    expect((await defaultOf(broadcast, "milestone")).originTemplateId).toBe(
      ids["broadcast-dark/milestone"],
    );
    // Duotone designs Match Day; its other kinds take Club Kit's.
    expect((await defaultOf(duotone, "milestone")).originTemplateId).toBe(
      ids["club-kit/milestone"],
    );
    expect((await defaultOf(duotone, "matchDay")).originTemplateId).toBe(ids["duotone/matchDay"]);
    const gf = await defaultOf(hidden, "milestone");
    expect(gf.originTemplateId).toBe(ids["club-kit/milestone"]);
    expect(gf.replacedPackId).toBe("gold-foil-v1");
    expect(gf.editedAt).toBeNull();
    expect(gf.originVersion).toBe(1);
  });

  it("falls back to the pack's starter look when the converted looks lack the kind", async () => {
    await libraryTemplate("broadcast-classic", "player", placeholderDocument("player"));
    const t = await tenant("starter-look");
    const row = await ensureKindTemplate(t, "player", "gold-foil-v1");
    expect(row.originTemplateId).toBe(ids["broadcast-classic/player"]);
  });

  it("skips a converted look that isn't listed yet, for the starter look", async () => {
    await libraryTemplate("club-kit", "premiership", placeholderDocument("premiership"), false);
    await libraryTemplate(
      "club-kit-classic",
      "premiership",
      placeholderDocument("premiership"),
      false,
    );
    const t = await tenant("raw-look");
    const row = await ensureKindTemplate(t, "premiership", "club-kit-v1");
    expect(row.originTemplateId).toBe(ids["club-kit-classic/premiership"]);
  });

  it("falls back to the starter when the library has no look for the kind", async () => {
    const t = await tenant("starter");
    const row = await ensureKindTemplate(t, "record", "club-kit-v1");
    expect(row.originTemplateId).toBeNull();
    expect(row.isKindDefault).toBe(true);
    // The starter bundle is format v2 (C3): its layers are on the kind's primary page.
    const doc = row.adjustments as { pages: Record<string, { layers: unknown[] }> };
    expect(doc.pages[primaryPage("record")]!.layers.length).toBeGreaterThan(0);
  });

  it("concurrent drafts converge on one default", async () => {
    const t = await tenant("race");
    await Promise.all([1, 2, 3].map(() => templatedDesignFor(t, "milestone", "club-kit-v1")));
    const rows = await db
      .select()
      .from(cardTemplatesTable)
      .where(and(eq(cardTemplatesTable.tenantId, t), eq(cardTemplatesTable.baseKind, "milestone")));
    expect(rows).toHaveLength(1);
  });
});

describe("the pilot (T3.15, T3.22)", () => {
  let pilot: number;
  let pilotRow: typeof cardTemplatesTable.$inferSelect;
  const pilotDoc = { layers: [{ ...layer("pilot-own"), kind: "shape" }] };

  beforeAll(async () => {
    pilot = await tenant("pilot");
    [pilotRow] = (await db
      .insert(cardTemplatesTable)
      .values(
        ["milestone", "matchDay"].map((kind) => ({
          tenantId: pilot,
          name: `${kind} template`,
          source: "kind",
          baseKind: kind,
          cardKinds: [kind],
          adjustments: pilotDoc,
          version: 5,
          // As if the release's data step had been missed: no default flag.
          isKindDefault: false,
        })),
      )
      .returning()) as [typeof cardTemplatesTable.$inferSelect];
  });

  it("promotes its own pre-library row instead of seeding a new one", async () => {
    const row = await ensureKindTemplate(pilot, "milestone", "club-kit-v1");
    expect(row.id).toBe(pilotRow.id);
    expect(row.isKindDefault).toBe(true);
    expect(row.version).toBe(5);
    expect(row.adjustments).toEqual(pilotDoc);
  });

  it("keeps its own design on single cards", async () => {
    const design = await templatedDesignFor(pilot, "milestone", "club-kit-v1");
    expect(design!.adjustments).toEqual(pilotDoc);
    expect(design!.templateRef).toEqual({ copyId: pilotRow.id, version: 5 });
  });

  it("draws carousels with its pack look, as a whole template", async () => {
    const carousel = matchDaySet();
    const { document, templateRef } = await assembleCarouselDocument(pilot, carousel, {
      packId: "club-kit-v1",
    });
    expect(templateRef).toEqual({ libraryTemplateId: ids["club-kit/matchDay"], version: 1 });
    expect(Object.keys(document.pages).sort()).toEqual(["fixture", "sponsors", "title"]);
    expect(document.pages.fixture!.layers[0]!.id).toBe("ck-md-fixture");
    expect(document.pages.title!.layers[0]!.id).toBe("ck-md-title");
  });
});

/** A Match Day carousel: title, one fixture, sponsors. */
function matchDaySet() {
  const opts = {
    heading: "This weekend",
    from: "2026-10-09",
    to: "2026-10-11",
    roundLabels: ["3"],
    fixtureCount: 1,
  };
  const slide = (id: string, content: unknown) => ({
    id,
    label: id,
    content,
    visibleFields: [...presetFields("matchDay", "standard")],
    photoId: null,
    data: {},
    junior: false,
    sponsorsOn: false,
    warnings: [],
  });
  return readQueuedCarousel({
    weekendCarousel: {
      version: 3,
      templateRef: { copyId: 1, version: 1 },
      setType: "matchDay",
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size: "square",
      slides: [
        slide("title", matchDayTitleContent(opts)),
        slide(
          "fixture",
          matchDayFixtureContent({
            id: 7,
            grade: "A Grade",
            roundLabel: "Round 3",
            opponentName: "Mandurah",
            opponentLogoUrl: null,
            venue: "Oval",
            startAt: new Date("2026-10-10T02:00:00Z"),
            isHome: true,
          }),
        ),
        slide("sponsors", matchDaySponsorsContent({ ...opts, sponsors: [] })),
      ],
    },
  })!;
}

/** A Results set's pages: title, one result, sponsors (only the inputs matter here). */
const resultsSet = () =>
  ({
    setType: "matchSummary",
    slides: [
      { input: { kind: "matchDay", carouselPage: { page: "title" } } },
      { input: { kind: "matchSummary" } },
      { input: { kind: "matchDay", carouselPage: { page: "sponsors" } } },
    ],
  }) as unknown as Parameters<typeof assembleCarouselDocument>[1];

describe("carousel assembly (T3.20)", () => {
  it("takes the set's pages from its template and the bookends from the same look", async () => {
    const t = await tenant("asm");
    const { document, templateRef } = await assembleCarouselDocument(t, resultsSet(), {
      templateRef: { libraryTemplateId: ids["club-kit/matchSummary"]!, version: 1 },
      packId: "club-kit-v1",
    });
    expect(templateRef).toEqual({ libraryTemplateId: ids["club-kit/matchSummary"], version: 1 });
    expect(Object.keys(document.pages).sort()).toEqual(["result", "sponsors", "title"]);
    expect(document.pages.result!.layers[0]!.id).toBe("ck-ms-result");
    expect(document.pages.title!.layers[0]!.id).toBe("ck-md-title");
    expect(document.pages.sponsors!.layers[0]!.id).toBe("ck-md-sponsors");
  });

  it("uses the club's default Match Day bookends when the look has no Match Day template", async () => {
    const t = await tenant("asm2");
    const { document } = await assembleCarouselDocument(t, resultsSet(), {
      templateRef: { libraryTemplateId: ids[`pl-${STAMP}/matchSummary`]!, version: 1 },
      packId: "duotone-v1",
    });
    // The club's default Match Day came from Duotone's look.
    expect(document.pages.title!.layers[0]!.id).toBe("dt-md-title");
    expect(document.pages.result!.layers[0]!.id).toBe("pl-ms-result");
  });

  it("a pilot Results set falls back to the pack look whole, never mixed", async () => {
    const t = await tenant("asm5");
    await db.insert(cardTemplatesTable).values(
      ["matchSummary", "matchDay"].map((kind) => ({
        tenantId: t,
        name: kind,
        source: "kind",
        baseKind: kind,
        cardKinds: [kind],
        isKindDefault: true,
        adjustments: { layers: [layer(`own-${kind}`)] },
      })),
    );
    const { document, templateRef } = await assembleCarouselDocument(t, resultsSet(), {
      packId: "club-kit-v1",
    });
    expect(templateRef).toEqual({ libraryTemplateId: ids["club-kit/matchSummary"], version: 1 });
    expect(document.pages.result!.layers[0]!.id).toBe("ck-ms-result");
    expect(document.pages.title!.layers[0]!.id).toBe("ck-md-title");
  });

  it("assembles from the pages alone exactly as from the slides (the composer's preview, T5.17)", async () => {
    const t = await tenant("asm6");
    const opts = {
      templateRef: { libraryTemplateId: ids["club-kit/matchSummary"]!, version: 1 },
      packId: "club-kit-v1",
    };
    const fromSlides = await assembleCarouselDocument(t, resultsSet(), opts);
    const fromPages = await assembleCarouselPages(t, "matchSummary", ["result"], opts);
    expect(fromPages).toEqual(fromSlides);
  });

  it("refuses a template of another kind, and another club's template", async () => {
    const t = await tenant("asm3");
    const other = await tenant("asm4");
    await expect(
      designFromRef(t, "milestone", { libraryTemplateId: ids["club-kit/matchDay"]!, version: 1 }),
    ).rejects.toMatchObject({ status: 400 });
    const theirs = await ensureKindTemplate(other, "milestone", "club-kit-v1");
    await expect(
      designFromRef(t, "milestone", { copyId: theirs.id, version: theirs.version }),
    ).rejects.toMatchObject({ status: 404 });
    const mine = await designFromRef(t, "milestone", {
      libraryTemplateId: ids["club-kit/milestone"]!,
      version: 1,
    });
    expect(mine.templateRef).toEqual({ libraryTemplateId: ids["club-kit/milestone"], version: 1 });
    expect(mine.packId).toBe("blank");
  });
});
