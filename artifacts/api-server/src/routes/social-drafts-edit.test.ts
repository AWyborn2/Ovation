/**
 * Social Studio U8 — editing a draft (caption, photo swap) keeps a revision
 * and records the admin's choices; a posted card that goes stale keeps the
 * corrected data as a revision the admin can apply. Real-DB integration test
 * (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialDraftsTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { upsertDraftByKey } from "../lib/draft-upsert";
import { listDraftRevisions } from "../lib/draft-revisions";

const STAMP = Date.now();
let tenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-drafts-edit";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `drafts-edit-${STAMP}`, centralClubId: 9971, name: "Edit Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `edit_${STAMP}`, displayName: "Editor", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId]));
});

const patch = (id: number, body: object) =>
  request(app)
    .patch(`/api/social-drafts/${id}`)
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId))
    .send(body);

const card = (value: number) => ({ kind: "gradeLeader", playerName: "Kim", value, grade: "A" });

describe("PATCH /social-drafts/:id", () => {
  it("swapping the photo records the manual choice and keeps a revision", async () => {
    const { draft } = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `edit:${STAMP}:photo`,
      cardInput: card(10),
      appPath: "/records",
    });
    await db
      .update(socialDraftsTable)
      .set({ autoReadyAt: new Date(Date.now() + 3600_000) })
      .where(eq(socialDraftsTable.id, draft.id));

    const res = await patch(draft.id, { photoUrl: "/api/storage/objects/library/x" });
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toBe("/api/storage/objects/library/x");
    expect(res.body.photoSource).toBe("manual");
    expect(res.body.autoReadyAt).toBeNull();
    const revs = await listDraftRevisions(tenantId, draft.id);
    expect(revs[0].reason).toBe("edit");
  });

  it("picking a player's area tile crops the card to that player's area", async () => {
    const [photo] = await db
      .insert(clubPhotosTable)
      .values({
        tenantId,
        objectPath: `/objects/library/edit-area-${STAMP}`,
        thumbPath: `/objects/library/edit-area-${STAMP}-thumb`,
        width: 400,
        height: 300,
        focusBox: { x: 0, y: 0, w: 1, h: 1 },
      })
      .returning();
    const area = { x: 0.1, y: 0.2, w: 0.2, h: 0.5 };
    await db.insert(clubPhotoPlayersTable).values([
      { tenantId, photoId: photo.id, playerId: 41, area },
      { tenantId, photoId: photo.id, playerId: 42 },
    ]);
    const { draft } = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `edit:${STAMP}:area`,
      cardInput: card(14),
      appPath: "/records",
    });
    const url = `/api/storage${photo.objectPath}`;
    // The whole photo: its own box.
    const whole = await patch(draft.id, { photoUrl: url });
    expect(whole.body.photoFocus).toEqual({
      box: { x: 0, y: 0, w: 1, h: 1 },
      width: 400,
      height: 300,
    });
    // The same photo, Kim's tile: re-snapshots to her area.
    const kim = await patch(draft.id, { photoUrl: url, photoPlayerId: 41 });
    expect(kim.body.photoFocus).toEqual({ box: area, width: 400, height: 300 });
    // A tagged player with no area falls back to the photo's box.
    const noArea = await patch(draft.id, { photoUrl: url, photoPlayerId: 42 });
    expect(noArea.body.photoFocus?.box).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("clearing the photo is recorded as a choice, so a later library fill leaves it empty", async () => {
    const { draft } = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `edit:${STAMP}:clear`,
      cardInput: card(13),
      appPath: "/records",
    });
    const res = await patch(draft.id, { photoUrl: null });
    expect(res.body.photoUrl).toBeNull();
    expect(res.body.photoSource).toBe("none");
  });

  it("a caption edit marks the draft edited; dismissed drafts are 409", async () => {
    const { draft } = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `edit:${STAMP}:caption`,
      cardInput: card(11),
      appPath: "/records",
    });
    const res = await patch(draft.id, { caption: "Custom words" });
    expect(res.body.caption).toBe("Custom words");
    expect(res.body.editedAt).not.toBeNull();

    await db
      .update(socialDraftsTable)
      .set({ status: "dismissed" })
      .where(eq(socialDraftsTable.id, draft.id));
    expect((await patch(draft.id, { caption: "x" })).status).toBe(409);
  });

  it("saving editor adjustments stores them, marks the draft edited and keeps one revision (U15)", async () => {
    const { draft } = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `edit:${STAMP}:adjust`,
      cardInput: card(12),
      appPath: "/records",
    });
    // A pack draft from before the template library: its editor overlay still saves.
    await db
      .update(socialDraftsTable)
      .set({
        packId: "club-kit-v1",
        adjustments: null,
        templateVersion: null,
        templateRef: null,
        layoutCheckPending: false,
      })
      .where(eq(socialDraftsTable.id, draft.id));
    const adjustments = {
      fields: { headline: "Century maker" },
      hidden: ["slot:photo"],
      layers: [
        {
          id: "l1",
          kind: "text",
          content: "SOLD OUT",
          geometry: { square: { x: 1, y: 2, w: 3, h: 4 } },
        },
      ],
    };
    const res = await patch(draft.id, { adjustments });
    expect(res.status).toBe(200);
    expect(res.body.adjustments).toEqual(adjustments);
    expect(res.body.editedAt).not.toBeNull();
    expect(await listDraftRevisions(tenantId, draft.id)).toHaveLength(1);

    const cleared = await patch(draft.id, { adjustments: null });
    expect(cleared.body.adjustments).toBeNull();
  });
});

describe("stale posted cards (R31)", () => {
  it("saving a templated draft's design keeps every key of its document (format v2 pages)", async () => {
    const { draft } = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `edit:${STAMP}:design-v2`,
      cardInput: card(13),
      appPath: "/records",
    });
    await db
      .update(socialDraftsTable)
      .set({ packId: "blank", templateVersion: 1, layoutCheckPending: false })
      .where(eq(socialDraftsTable.id, draft.id));
    const adjustments = {
      formatVersion: 2,
      palettes: ["club-kit"],
      pages: {
        card: {
          layers: [
            {
              id: "t1",
              kind: "text",
              content: "{{headline}}",
              geometry: { square: { x: 5, y: 5, w: 90, h: 10 } },
            },
          ],
        },
      },
    };
    const res = await patch(draft.id, { adjustments });
    expect(res.status).toBe(200);
    expect(res.body.adjustments).toEqual(adjustments);
    expect(res.body.designEditedAt).not.toBeNull();
    expect(res.body.layoutCheckPending).toBe(true);
  });

  it("keeps the corrected data as one revision; reverting to it applies it and clears stale", async () => {
    const key = `edit:${STAMP}:stale`;
    const base = {
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: key,
      appPath: "/records",
    };
    const { draft } = await upsertDraftByKey({ ...base, cardInput: card(20) });
    await db
      .update(socialDraftsTable)
      .set({ status: "posted" })
      .where(eq(socialDraftsTable.id, draft.id));

    await upsertDraftByKey({ ...base, cardInput: card(25) });
    await upsertDraftByKey({ ...base, cardInput: card(25) }); // a repeat sweep adds nothing
    const revs = await listDraftRevisions(tenantId, draft.id);
    expect(revs).toHaveLength(1);
    expect(revs[0].cardInput).toEqual(card(25));

    const res = await request(app)
      .post(`/api/social-drafts/${draft.id}/revisions/${revs[0].id}/revert`)
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));
    expect(res.status).toBe(200);
    expect(res.body.cardInput).toEqual(card(25));
    expect(res.body.staleSince).toBeNull();
    expect(res.body.status).toBe("posted");
  });
});
