/**
 * Unedited copies follow the library (28 Oct 2026): once a newer library
 * version passes its fit check, a club copy nobody changed takes it, and so do
 * the club's queued cards drawn from that copy. Edited copies, hand-edited
 * cards, posted cards and cards from other copies keep what they have, and
 * one club's update never reaches another club's cards.
 * Real-DB test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  socialDraftsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { documentCoverage } from "./coverage";
import { writeFitResult } from "./fit";
import { followLibraryUpdates } from "./follow";
import { v2Document } from "./bundles.test-helpers";

const STAMP = Date.now();
const KIND = "milestone";
const V1 = placeholderDocument(KIND);
const V2 = v2Document(KIND);
const tenants: number[] = [];
let lookId = 0;
let templateId = 0;
const extraTemplates: number[] = [];

async function tenant(n: number): Promise<number> {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `follow-${n}-${STAMP}`,
      centralClubId: 2_000_000 + (STAMP % 100_000) * 10 + n,
      name: `Follow Club ${n}`,
      plan: "pro",
    })
    .returning();
  tenants.push(t!.id);
  return t!.id;
}

async function copy(tenantId: number, edited = false, originTemplateId = templateId) {
  const [row] = await db
    .insert(cardTemplatesTable)
    .values({
      tenantId,
      name: "Milestone copy",
      source: "kind",
      baseKind: KIND,
      cardKinds: [KIND],
      adjustments: V1,
      version: 3,
      originTemplateId,
      originVersion: 1,
      editedAt: edited ? new Date() : null,
    })
    .returning();
  return row!;
}

async function draft(
  tenantId: number,
  copyId: number | null,
  extra: Partial<typeof socialDraftsTable.$inferInsert> = {},
) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: KIND,
      cardInput: { kind: KIND, playerName: "A" },
      adjustments: V1,
      templateVersion: 3,
      templateRef: copyId === null ? null : { copyId, version: 3 },
      ...extra,
    })
    .returning();
  return row!;
}

const readCopy = async (id: number) =>
  (await db.select().from(cardTemplatesTable).where(eq(cardTemplatesTable.id, id)))[0]!;
const readDraft = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0]!;

beforeAll(async () => {
  const [look] = await db
    .insert(templateLooksTable)
    .values({ slug: `follow-${STAMP}`, name: "Follow look", origin: "bundle" })
    .returning();
  lookId = look!.id;
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      slug: `follow-${STAMP}/${KIND}`,
      lookId,
      kind: KIND,
      name: "Follow milestone",
      origin: "bundle",
      currentVersion: 2,
      listed: true,
    })
    .returning();
  templateId = t!.id;
  await db.insert(libraryTemplateVersionsTable).values([
    {
      templateId,
      version: 1,
      document: V1,
      coverage: documentCoverage(V1, KIND),
      fitStatus: "pass",
    },
    // The new version is still waiting on its fit check.
    {
      templateId,
      version: 2,
      document: V2,
      coverage: documentCoverage(V2, KIND),
      fitStatus: "pending",
    },
  ]);
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  const libraryIds = [templateId, ...extraTemplates];
  await db
    .delete(libraryTemplateVersionsTable)
    .where(inArray(libraryTemplateVersionsTable.templateId, libraryIds));
  await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, libraryIds));
  await db.delete(templateLooksTable).where(eq(templateLooksTable.id, lookId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

describe("unedited copies follow a passed library version", () => {
  it("waits for the fit check, then updates the copy and its own queued cards only", async () => {
    const club = await tenant(1);
    const other = await tenant(2);
    const unedited = await copy(club);
    const edited = await copy(club, true);
    const otherClubs = await copy(other);

    const fromCopy = await draft(club, unedited.id);
    const handEdited = await draft(club, unedited.id, { designEditedAt: new Date() });
    const posted = await draft(club, unedited.id, { status: "posted" });
    const fromEdited = await draft(club, edited.id);
    const noRef = await draft(club, null);
    const otherClubsDraft = await draft(other, otherClubs.id);

    // Pending: nothing moves yet.
    expect(await followLibraryUpdates([templateId])).toEqual({ copies: 0, drafts: 0 });
    expect((await readCopy(unedited.id)).originVersion).toBe(1);

    // The check passes: the unedited copies take version 2.
    await writeFitResult(
      { kind: "libraryVersion", templateId, version: 2 },
      { status: "pass", report: { checkedAt: new Date().toISOString(), problems: [] } as never },
    );

    const after = await readCopy(unedited.id);
    expect(after.originVersion).toBe(2);
    expect(after.version).toBe(4);
    expect(after.adjustments).toEqual(V2);
    expect(after.fitStatus).toBe("pass");
    expect(after.editedAt).toBeNull();
    expect(after.updatedByAdminId).toBeNull();

    const keptEdit = await readCopy(edited.id);
    expect(keptEdit.originVersion).toBe(1);
    expect(keptEdit.adjustments).toEqual(V1);
    expect((await readCopy(otherClubs.id)).originVersion).toBe(2);

    const moved = await readDraft(fromCopy.id);
    expect(moved.adjustments).toEqual(V2);
    expect(moved.templateRef).toEqual({ copyId: unedited.id, version: 4 });
    expect(moved.templateVersion).toBe(4);
    expect(moved.layoutCheckPending).toBe(true);

    for (const kept of [handEdited, posted, fromEdited, noRef]) {
      expect((await readDraft(kept.id)).adjustments).toEqual(V1);
    }
    // The other club's card follows its own copy, not this club's.
    expect((await readDraft(otherClubsDraft.id)).templateRef).toEqual({
      copyId: otherClubs.id,
      version: 4,
    });

    // Already current: running again changes nothing.
    expect(await followLibraryUpdates([templateId])).toEqual({ copies: 0, drafts: 0 });
  });

  it("leaves copies of a template another club published on 'Update available'", async () => {
    const club = await tenant(3);
    const [t] = await db
      .insert(libraryTemplatesTable)
      .values({
        slug: `follow-club-${STAMP}/${KIND}`,
        lookId,
        kind: KIND,
        name: "Club-published milestone",
        origin: "club",
        currentVersion: 2,
        listed: true,
      })
      .returning();
    extraTemplates.push(t!.id);
    await db.insert(libraryTemplateVersionsTable).values([
      {
        templateId: t!.id,
        version: 1,
        document: V1,
        coverage: documentCoverage(V1, KIND),
        fitStatus: "pass",
      },
      {
        templateId: t!.id,
        version: 2,
        document: V2,
        coverage: documentCoverage(V2, KIND),
        fitStatus: "pass",
      },
    ]);
    const theirs = await copy(club, false, t!.id);
    expect(await followLibraryUpdates([t!.id])).toEqual({ copies: 0, drafts: 0 });
    const kept = await readCopy(theirs.id);
    expect(kept.originVersion).toBe(1);
    expect(kept.adjustments).toEqual(V1);
  });
});
