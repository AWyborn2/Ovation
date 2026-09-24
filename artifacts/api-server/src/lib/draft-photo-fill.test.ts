/**
 * A draft's photo is picked when it is created, so drafts made before the
 * photo library had a match stayed empty for good (the queue showed no images
 * for every draft older than the library). fillMissingDraftPhotos gives those
 * open drafts a photo once one exists, without overriding an admin's choice.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, tenantsTable, clubPhotosTable, socialDraftsTable } from "@workspace/db";
import { fillMissingDraftPhotos } from "./draft-enrich";

const STAMP = Date.now();
let tenantId: number;

async function draft(over: Partial<typeof socialDraftsTable.$inferInsert> = {}) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "roundup",
      status: "awaiting_review",
      cardInput: { kind: "gradeLeader", grade: "A Grade", playerName: "Kim" },
      appPath: "/records",
      ...over,
    })
    .returning();
  return row;
}

const reload = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `photo-fill-${STAMP}`, centralClubId: 9962, name: "Fill Club", plan: "pro" })
    .returning();
  tenantId = t.id;
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId]));
});

describe("fillMissingDraftPhotos", () => {
  it("fills drafts made before the library had a match, and leaves every choice alone", async () => {
    const empty = await draft();
    const ready = await draft({ status: "ready" });
    const cleared = await draft({ photoSource: "none" });
    const manual = await draft({ photoUrl: "/api/storage/objects/mine", photoSource: "manual" });
    const dismissed = await draft({ status: "dismissed" });
    const posted = await draft({ status: "posted" });
    const junior = await draft({ sourceMatchIsJunior: true });
    const otherGrade = await draft({
      cardInput: { kind: "gradeLeader", grade: "C Grade", playerName: "Lee" },
    });

    // Nothing in the library yet: nothing to fill.
    expect(await fillMissingDraftPhotos(tenantId)).toBe(0);

    // The club adds an A Grade photo after the drafts were made.
    await db.insert(clubPhotosTable).values({
      tenantId,
      objectPath: `/objects/library/agrade-${STAMP}`,
      thumbPath: `/objects/library/agrade-${STAMP}-thumb`,
      width: 100,
      height: 100,
      grade: "A Grade",
    });

    expect(await fillMissingDraftPhotos(tenantId)).toBe(2);
    for (const d of [empty, ready]) {
      const row = await reload(d.id);
      expect(row.photoUrl).toContain(`agrade-${STAMP}`);
      expect(row.photoSource).toBe("auto:library-grade");
    }
    expect((await reload(cleared.id)).photoUrl).toBeNull();
    expect((await reload(manual.id)).photoUrl).toBe("/api/storage/objects/mine");
    for (const d of [dismissed, posted, junior, otherGrade]) {
      expect((await reload(d.id)).photoUrl).toBeNull();
    }

    // A second run has nothing left to do.
    expect(await fillMissingDraftPhotos(tenantId)).toBe(0);
  });
});
