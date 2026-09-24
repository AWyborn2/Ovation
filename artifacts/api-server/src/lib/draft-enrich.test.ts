/**
 * Social Studio automation U5 — every auto-draft carries its pack, caption and
 * photo from creation: R5's photo order (AE2), no junior photos, the club's
 * default pack, and refresh rules (auto photos re-picked, admin choices kept).
 * Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  playerImagesTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  cardTemplatesTable,
  socialSettingsTable,
  socialDraftsTable,
} from "@workspace/db";
import { enrichDraft, pickDraftPhoto } from "./draft-enrich";
import { upsertDraftByKey } from "./draft-upsert";

const STAMP = Date.now();
let tenantId: number;
const playerIds: number[] = [];

async function libraryPhoto(opts: {
  path: string;
  takenAt?: string;
  grade?: string;
  playerId?: number;
}): Promise<void> {
  const [photo] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId,
      objectPath: `/objects/library/${opts.path}`,
      thumbPath: `/objects/library/${opts.path}-thumb`,
      width: 100,
      height: 100,
      grade: opts.grade ?? null,
      takenAt: opts.takenAt ? new Date(opts.takenAt) : null,
    })
    .returning();
  if (opts.playerId != null) {
    await db
      .insert(clubPhotoPlayersTable)
      .values({ tenantId, photoId: photo.id, playerId: opts.playerId });
  }
}

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `enrich-${STAMP}`, centralClubId: 9961, name: "Enrich Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({
    tenantId,
    clubUrl: "https://enrich.example",
    clubHashtag: "#Enrich",
  });
  const players = await db
    .insert(playersTable)
    .values([
      { surname: `Tagged${STAMP}`, givenName: "A" },
      { surname: `Headshot${STAMP}`, givenName: "B" },
      { surname: `Nobody${STAMP}`, givenName: "C" },
    ])
    .returning();
  playerIds.push(...players.map((p) => p.id));
  const [tagged, headshotOnly] = playerIds;

  await libraryPhoto({ path: `old-${STAMP}`, takenAt: "2024-01-10", playerId: tagged });
  await libraryPhoto({ path: `new-${STAMP}`, takenAt: "2025-02-20", playerId: tagged });
  await libraryPhoto({ path: `team-${STAMP}`, takenAt: "2025-01-01", grade: "A Grade" });
  await libraryPhoto({
    path: `action-${STAMP}`,
    takenAt: "2025-03-01",
    grade: "A Grade",
    playerId: tagged,
  });
  for (const id of [tagged, headshotOnly]) {
    await db.insert(playerImagesTable).values({
      tenantId,
      playerId: id,
      imageUrl: `/api/storage/objects/headshot-${id}`,
      isDefault: true,
    });
  }
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
  await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId));
  await db.delete(playerImagesTable).where(eq(playerImagesTable.tenantId, tenantId));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("photo pick (R5, AE2)", () => {
  it("a player with two tagged photos and a headshot gets the newer tagged photo", async () => {
    const pick = await pickDraftPhoto(tenantId, {
      playerId: playerIds[0],
      grade: "A Grade",
      junior: false,
    });
    expect(pick).toEqual({
      url: `/api/storage/objects/library/action-${STAMP}`,
      source: "auto:library-player",
    });
  });

  it("with no tagged photo, the headshot; with neither, the grade's team photo; else none", async () => {
    expect(
      await pickDraftPhoto(tenantId, { playerId: playerIds[1], grade: "A Grade", junior: false }),
    ).toEqual({ url: `/api/storage/objects/headshot-${playerIds[1]}`, source: "auto:headshot" });
    // The team photo (no individual tags) beats a newer tagged action shot.
    expect(
      await pickDraftPhoto(tenantId, { playerId: playerIds[2], grade: "A Grade", junior: false }),
    ).toEqual({ url: `/api/storage/objects/library/team-${STAMP}`, source: "auto:library-grade" });
    expect(
      await pickDraftPhoto(tenantId, { playerId: playerIds[2], grade: "D Grade", junior: false }),
    ).toBeNull();
  });

  it("a junior match summary gets no photo", async () => {
    const e = await enrichDraft({
      tenantId,
      engine: "matchSummary",
      cardInput: { kind: "matchSummary", junior: true, result: "Won", matchTitle: "Under 15" },
      appPath: "/juniors/matches/1",
      grade: "A Grade",
    });
    expect(e.photoUrl).toBeNull();
    expect(e.photoSource).toBeNull();
  });
});

describe("pack and caption", () => {
  it("uses the club's default pack; changing the default leaves existing drafts alone", async () => {
    const [sunset] = await db
      .insert(cardTemplatesTable)
      .values({
        tenantId,
        name: "Sunset",
        source: "pack",
        packId: "sunset-v1",
        packVariant: "square",
        defaultForKinds: ["matchSummary"],
      })
      .returning();
    await db.insert(cardTemplatesTable).values({
      tenantId,
      name: "Neon",
      source: "pack",
      packId: "neon-night-v1",
      packVariant: "square",
    });

    const first = await upsertDraftByKey({
      tenantId,
      engine: "matchSummary",
      family: "results",
      sourceKey: `enrich:${STAMP}:pack`,
      cardInput: { kind: "matchSummary", result: "Won by 4 wickets", matchTitle: "A Grade R2" },
      appPath: "/matches/77",
      grade: "A Grade",
    });
    expect(first.draft.packId).toBe("sunset-v1");
    expect(first.draft.caption).toContain("enrich.example/matches/77");

    await db
      .update(cardTemplatesTable)
      .set({ defaultForKinds: [] })
      .where(eq(cardTemplatesTable.id, sunset.id));
    await db
      .update(cardTemplatesTable)
      .set({ defaultForKinds: ["matchSummary"] })
      .where(eq(cardTemplatesTable.packId, "neon-night-v1"));

    const refreshed = await upsertDraftByKey({
      tenantId,
      engine: "matchSummary",
      family: "results",
      sourceKey: `enrich:${STAMP}:pack`,
      cardInput: { kind: "matchSummary", result: "Won by 5 wickets", matchTitle: "A Grade R2" },
      appPath: "/matches/77",
      grade: "A Grade",
    });
    expect(refreshed.action).toBe("refreshed");
    expect(refreshed.draft.packId).toBe("sunset-v1");

    const fresh = await upsertDraftByKey({
      tenantId,
      engine: "matchSummary",
      family: "results",
      sourceKey: `enrich:${STAMP}:pack2`,
      cardInput: { kind: "matchSummary", result: "Lost", matchTitle: "A Grade R3" },
      appPath: "/matches/78",
    });
    expect(fresh.draft.packId).toBe("neon-night-v1");
  });
});

describe("refresh keeps what an admin chose", () => {
  it("re-picks an auto photo and caption, but keeps a manual photo and an edited caption", async () => {
    const base = {
      tenantId,
      engine: "milestone",
      family: "achievements",
      appPath: `/players/${playerIds[2]}`,
      playerId: playerIds[2],
    };
    const key = `enrich:${STAMP}:refresh`;
    const card = (runs: number) => ({
      kind: "century",
      playerName: "C Nobody",
      runs,
      grade: "A Grade",
    });
    const first = await upsertDraftByKey({ ...base, sourceKey: key, cardInput: card(101) });
    expect(first.draft.photoSource).toBe("auto:library-grade");
    expect(first.draft.caption).toContain("C Nobody");

    const auto = await upsertDraftByKey({ ...base, sourceKey: key, cardInput: card(102) });
    expect(auto.draft.caption).toContain("102");

    await db
      .update(socialDraftsTable)
      .set({
        photoUrl: "/api/storage/objects/chosen",
        photoSource: "manual",
        caption: "hand written",
        editedAt: new Date(),
      })
      .where(eq(socialDraftsTable.id, first.draft.id));
    const kept = await upsertDraftByKey({ ...base, sourceKey: key, cardInput: card(103) });
    expect(kept.action).toBe("refreshed");
    expect(kept.draft.photoUrl).toBe("/api/storage/objects/chosen");
    expect(kept.draft.caption).toBe("hand written");
  });
});
