/**
 * Migration 0079 removes orphaned slide layouts from set drafts (dev retest 3,
 * item 4; draft 962). Real-DB test (needs DATABASE_URL): inside a rolled-back
 * transaction it stores set drafts as draft 962 was saved, counts them with
 * the read-only query, runs the migration twice and checks each draft is what
 * opening and saving it gives (`withoutStrandedLayouts`, `isOrphanPageSlide`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db, socialDraftsTable, tenantsTable } from "@workspace/db";
import {
  isOrphanPageSlide,
  withoutStrandedLayouts,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";

const ROOT = path.resolve(__dirname, "../../../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIGRATION = read("lib/db/migrations/0079_orphan_layout_pages.sql");
const COUNT = read("scripts/sql/count-orphan-layout-pages.sql");
const statements = MIGRATION.split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const STAMP = Date.now();
let tenantId: number;

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `mig-0079-${STAMP}`,
      centralClubId: 800_000 + (STAMP % 100_000),
      name: "Orphan Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

class Rollback extends Error {}

const page = (id: string, slot: string, kind: string, p: string, name?: string) => ({
  id,
  role: ["team", "fixture", "result", "day"].includes(slot) ? "repeat" : "fixed",
  slot,
  kind,
  page: p,
  ...(name ? { name } : {}),
  layers: [],
});

const PAGES = [
  page("cover", "cover", "teamListRound", "card"),
  page("team", "team", "teamList", "team"),
  page("sponsors", "sponsors", "matchDay", "sponsors"),
];

const slide = (
  id: string,
  input: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  id,
  label: id,
  input,
  data: {},
  junior: false,
  sponsorsOn: true,
  warnings: [],
  ...extra,
});

/** A queued Team List carousel as draft 962 was saved: two let-go layouts and their slides. */
const BROKEN_962 = {
  doc: {
    formatVersion: 2,
    set: "teamLists",
    pages: [
      ...PAGES,
      page("a-layout", "page", "teamList", "team", "A Grade v Waroona layout"),
      page("b-layout", "page", "teamList", "team", "B Grade v Pinjarra layout"),
      page("p3", "page", "teamList", "team", "Page 3"),
    ],
  },
  slides: [
    slide("cover", { kind: "teamListRound", carouselPage: { page: "title" } }),
    slide("b", { kind: "teamList", grade: "B Grade" }),
    slide("sponsors", { kind: "matchDay", carouselPage: { page: "sponsors" } }),
    slide("page:a-layout", { kind: "teamList" }, { pageId: "a-layout" }),
    slide("page:b-layout", { kind: "teamList" }, { pageId: "b-layout" }),
    slide("page:p3", { kind: "teamList" }, { pageId: "p3" }),
  ],
};

/** Opened since #645 and shed in the editor, never saved: only the stale slides are left. */
const SHED_UNSAVED = {
  doc: { formatVersion: 2, set: "teamLists", pages: PAGES },
  slides: [
    slide("cover", { kind: "teamListRound", carouselPage: { page: "title" } }),
    slide("page:gone-layout", { kind: "teamList" }, { pageId: "gone-layout" }),
  ],
};

/** A Round Team Lists set: one live layout, one a deleted slide held. */
const LIST = {
  formatVersion: 2,
  set: "teamLists",
  pages: [
    ...PAGES,
    page("a-layout", "page", "teamList", "team", "A Grade layout"),
    page("c-layout", "page", "teamList", "team", "C Grade layout"),
  ],
  arrangement: {
    order: [],
    removed: ["c"],
    pageFor: { a: "a-layout", c: "c-layout" },
  },
};

/** A healthy set: its layout is mapped, nothing to change. */
const HEALTHY = {
  formatVersion: 2,
  set: "teamLists",
  pages: [...PAGES, page("a-layout", "page", "teamList", "team", "A Grade layout")],
  arrangement: { order: [], removed: [], pageFor: { a: "a-layout" } },
};

const carouselInput = (slides: Array<{ id: string }>) => ({
  kind: "weekendCarousel",
  weekendCarousel: { version: 3, setType: "teamList", size: "square", slides },
});

describe("migration 0079", () => {
  it("counts, then removes orphaned layout pages and their slides, twice over", async () => {
    await db
      .transaction(async (tx) => {
        const rows = await tx
          .insert(socialDraftsTable)
          .values([
            {
              tenantId,
              engine: "ondemand",
              cardInput: carouselInput(BROKEN_962.slides),
              adjustments: BROKEN_962.doc,
            },
            {
              tenantId,
              engine: "ondemand",
              cardInput: carouselInput(SHED_UNSAVED.slides),
              adjustments: SHED_UNSAVED.doc,
            },
            {
              tenantId,
              engine: "teamlist",
              cardInput: { kind: "teamListRound" },
              adjustments: LIST,
            },
            {
              tenantId,
              engine: "teamlist",
              cardInput: { kind: "teamListRound" },
              adjustments: HEALTHY,
            },
          ])
          .returning();
        const ids = rows.map((r) => r.id);
        const [broken, unsaved, list, healthy] = rows;

        const counted = (await tx.execute(sql.raw(COUNT))).rows[0] as {
          drafts_affected: string | number;
          draft_ids: string;
        };
        // Other tenants' drafts in the test database may count too: ours are in it.
        const listed = counted.draft_ids.split(", ").map(Number);
        expect(listed).toEqual(expect.arrayContaining([broken!.id, unsaved!.id, list!.id]));
        expect(listed).not.toContain(healthy!.id);

        for (let run = 0; run < 2; run++) {
          for (const stmt of statements) await tx.execute(sql.raw(stmt));
        }

        const after = await tx
          .select()
          .from(socialDraftsTable)
          .where(inArray(socialDraftsTable.id, ids));
        const byId = new Map(after.map((r) => [r.id, r]));

        // Draft 962: the let-go layouts and their slides go; the admin's Page 3 stays.
        const b = byId.get(broken!.id)!;
        const bDoc = b.adjustments as SetDocument;
        expect(bDoc.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors", "p3"]);
        expect(bDoc).toEqual(withoutStrandedLayouts(BROKEN_962.doc as unknown as SetDocument));
        const bSlides = (b.cardInput as ReturnType<typeof carouselInput>).weekendCarousel.slides;
        expect(bSlides.map((s) => s.id)).toEqual(["cover", "b", "sponsors", "page:p3"]);

        // The slide whose page was shed on open goes; the design is unchanged.
        const u = byId.get(unsaved!.id)!;
        expect(u.adjustments).toEqual(SHED_UNSAVED.doc);
        const uSlides = (u.cardInput as ReturnType<typeof carouselInput>).weekendCarousel.slides;
        expect(uSlides.map((s) => s.id)).toEqual(["cover"]);
        // Exactly the slides the editor and the post skip.
        expect(
          SHED_UNSAVED.slides
            .filter((s) => !isOrphanPageSlide(SHED_UNSAVED.doc as unknown as SetDocument, s))
            .map((s) => s.id),
        ).toEqual(["cover"]);

        // A deleted slide's layout goes with its map entry; the live one stays.
        const l = byId.get(list!.id)!;
        expect(l.adjustments).toEqual(withoutStrandedLayouts(LIST as unknown as SetDocument));
        expect((l.adjustments as SetDocument).arrangement).toEqual({
          order: [],
          removed: ["c"],
          pageFor: { a: "a-layout" },
        });

        // Nothing to do: untouched.
        expect(byId.get(healthy!.id)!.adjustments).toEqual(HEALTHY);
        expect(byId.get(healthy!.id)!.cardInput).toEqual({ kind: "teamListRound" });

        // A second count finds none of ours.
        const again = (await tx.execute(sql.raw(COUNT))).rows[0] as { draft_ids: string };
        const left = again.draft_ids ? again.draft_ids.split(", ").map(Number) : [];
        for (const id of ids) expect(left).not.toContain(id);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  });
});
