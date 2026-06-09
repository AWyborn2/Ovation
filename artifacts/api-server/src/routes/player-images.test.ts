import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { db, adminsTable, playersTable, playerImagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type GalleryImage = {
  id: number;
  playerId: number;
  imageUrl: string;
  sortOrder: number;
  isDefault: boolean;
};

describe("player photo gallery (integration)", () => {
  let adminId: number;
  let adminCookie: string;
  let legacyPlayerId: number;
  let galleryPlayerId: number;
  const LEGACY_URL = `/api/storage/objects/legacy-${Date.now()}`;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-player-images";

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_pimg_${Date.now()}`,
        displayName: "Test Admin PIMG",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    // Legacy player: has the single-photo pointer but NO gallery rows.
    const [legacy] = await db
      .insert(playersTable)
      .values({
        surname: `PIMGLegacy${Date.now()}`,
        givenName: "Test",
        imageUrl: LEGACY_URL,
      })
      .returning();
    legacyPlayerId = legacy.id;

    // Plain player used for add/default/delete flow.
    const [gallery] = await db
      .insert(playersTable)
      .values({ surname: `PIMGGallery${Date.now()}`, givenName: "Test" })
      .returning();
    galleryPlayerId = gallery.id;
  });

  afterAll(async () => {
    await db
      .delete(playerImagesTable)
      .where(eq(playerImagesTable.playerId, legacyPlayerId));
    await db
      .delete(playerImagesTable)
      .where(eq(playerImagesTable.playerId, galleryPlayerId));
    await db.delete(playersTable).where(eq(playersTable.id, legacyPlayerId));
    await db.delete(playersTable).where(eq(playersTable.id, galleryPlayerId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  it("rejects gallery writes without an admin session", async () => {
    await request(app)
      .post(`/api/players/${galleryPlayerId}/images`)
      .send({ imageUrl: "/api/storage/objects/nope" })
      .expect(401);
  });

  it("backfills a legacy image_url as the default gallery row on read", async () => {
    const res = await request(app)
      .get(`/api/players/${legacyPlayerId}/images`)
      .expect(200);
    const images = res.body as GalleryImage[];
    expect(images).toHaveLength(1);
    expect(images[0].imageUrl).toBe(LEGACY_URL);
    expect(images[0].isDefault).toBe(true);

    // Idempotent: a second read does not create a duplicate row.
    const res2 = await request(app)
      .get(`/api/players/${legacyPlayerId}/images`)
      .expect(200);
    expect((res2.body as GalleryImage[])).toHaveLength(1);
  });

  it("adds, sets default (syncing image_url), and deletes with promotion", async () => {
    // First add becomes the default and sets players.image_url.
    const first = await request(app)
      .post(`/api/players/${galleryPlayerId}/images`)
      .set("Cookie", adminCookie)
      .send({ imageUrl: "/api/storage/objects/first" })
      .expect(201);
    const firstId = first.body.id as number;
    expect(first.body.isDefault).toBe(true);

    let [player] = await db
      .select({ imageUrl: playersTable.imageUrl })
      .from(playersTable)
      .where(eq(playersTable.id, galleryPlayerId));
    expect(player.imageUrl).toBe("/api/storage/objects/first");

    // Second add (non-default) must NOT touch image_url.
    const second = await request(app)
      .post(`/api/players/${galleryPlayerId}/images`)
      .set("Cookie", adminCookie)
      .send({ imageUrl: "/api/storage/objects/second" })
      .expect(201);
    const secondId = second.body.id as number;
    expect(second.body.isDefault).toBe(false);

    [player] = await db
      .select({ imageUrl: playersTable.imageUrl })
      .from(playersTable)
      .where(eq(playersTable.id, galleryPlayerId));
    expect(player.imageUrl).toBe("/api/storage/objects/first");

    // Set the second as default → image_url syncs to it.
    await request(app)
      .post(`/api/players/${galleryPlayerId}/images/${secondId}/default`)
      .set("Cookie", adminCookie)
      .expect(200);
    [player] = await db
      .select({ imageUrl: playersTable.imageUrl })
      .from(playersTable)
      .where(eq(playersTable.id, galleryPlayerId));
    expect(player.imageUrl).toBe("/api/storage/objects/second");

    // Delete the default → first is promoted and image_url reverts.
    await request(app)
      .delete(`/api/players/${galleryPlayerId}/images/${secondId}`)
      .set("Cookie", adminCookie)
      .expect(204);
    [player] = await db
      .select({ imageUrl: playersTable.imageUrl })
      .from(playersTable)
      .where(eq(playersTable.id, galleryPlayerId));
    expect(player.imageUrl).toBe("/api/storage/objects/first");

    const after = await request(app)
      .get(`/api/players/${galleryPlayerId}/images`)
      .expect(200);
    const remaining = after.body as GalleryImage[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(firstId);
    expect(remaining[0].isDefault).toBe(true);

    // Cross-player pair returns 404.
    await request(app)
      .delete(`/api/players/${legacyPlayerId}/images/${firstId}`)
      .set("Cookie", adminCookie)
      .expect(404);
  });
});
