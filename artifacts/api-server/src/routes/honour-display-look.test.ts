import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { db, adminsTable, honourDisplaySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureHonourDisplaySettings } from "../lib/honour-display/settings";

// The kiosk redesign's club look (kiosk_look) and per-board motion settings
// round-trip through PATCH /honour-display-settings. Needs only the settings
// row, so (unlike honour-display-kiosk.test.ts) it runs on the fresh CI database.
describe("honour display settings: kiosk look (integration)", () => {
  const tenantId = 1;
  let adminId: number;
  let adminCookie: string;
  let original: { kioskLook: unknown; boardConfigs: unknown; kioskPhotoSlideshows: unknown };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-honour-look";
    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_hdl_${Date.now()}`,
        displayName: "Test Admin HDL",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
    const row = await ensureHonourDisplaySettings(tenantId);
    original = {
      kioskLook: row.kioskLook,
      boardConfigs: row.boardConfigs,
      kioskPhotoSlideshows: row.kioskPhotoSlideshows,
    };
  });

  afterAll(async () => {
    await db
      .update(honourDisplaySettingsTable)
      .set(original as Partial<typeof honourDisplaySettingsTable.$inferInsert>)
      .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  const patch = (body: object) =>
    request(app).patch("/api/honour-display-settings").set("Cookie", adminCookie).send(body);

  it("round-trips the club look and the new per-board settings", async () => {
    const kioskLook = {
      move: "pages",
      trans: "wipe",
      dur: "L",
      size: "XL",
      perPage: 8,
      pageSecs: 7,
      speed: 48,
      hold: 4,
      columnsPerScreen: 3,
    };
    const boardConfig = { move: "credits", trans: "flip", columnsPerScreen: 2, top: 50 };
    const res = await patch({ kioskLook, boardConfigs: { most_games: boardConfig } }).expect(200);
    expect(res.body.kioskLook).toEqual(kioskLook);
    expect(res.body.boardConfigs.most_games).toEqual(boardConfig);

    const [row] = await db
      .select()
      .from(honourDisplaySettingsTable)
      .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
    expect(row!.kioskLook).toEqual(kioskLook);
  });

  it("rejects values outside the allowed set", async () => {
    for (const kioskLook of [{ move: "sideways" }, { columnsPerScreen: 9 }, { pageSecs: 0 }]) {
      await patch({ kioskLook }).expect(400);
    }
    await patch({ boardConfigs: { most_games: { top: 37 } } }).expect(400);
  });

  it("round-trips photo slideshows and resolves them in the admin bundle (D1)", async () => {
    const slideshow = {
      id: "photos-1",
      name: "Clubroom photos",
      library: "senior",
      source: "recent",
      recentDays: 30,
      order: "random",
      perPass: 12,
      secondsPerPhoto: 6,
      captions: true,
    };
    const res = await patch({ kioskPhotoSlideshows: [slideshow] }).expect(200);
    expect(res.body.kioskPhotoSlideshows).toEqual([slideshow]);
    await patch({ kioskPhotoSlideshows: [{ ...slideshow, perPass: 0 }] }).expect(400);
    await patch({ kioskPhotoSlideshows: [{ ...slideshow, library: "everyone" }] }).expect(400);
    // P0/P1 options: hand-picked photos in a manual order, folders, framing,
    // cross-fade and interludes.
    const picked = {
      ...slideshow,
      source: "picked",
      order: "manual",
      picked: [
        { library: "junior", id: 7 },
        { library: "senior", id: 3 },
      ],
      folders: [{ grade: "club-wide", type: null }],
      frame: "whole",
      crossfade: false,
      interludeEvery: 3,
    };
    const res2 = await patch({ kioskPhotoSlideshows: [picked] }).expect(200);
    expect(res2.body.kioskPhotoSlideshows).toEqual([picked]);
    await patch({
      kioskPhotoSlideshows: [{ ...picked, picked: [{ library: "staff", id: 1 }] }],
    }).expect(400);
    await patch({ kioskPhotoSlideshows: [{ ...picked, interludeEvery: 0 }] }).expect(400);
    await patch({ kioskPhotoSlideshows: [slideshow] }).expect(200);

    const bundle = await request(app)
      .get("/api/honour-display")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(bundle.body.photoSlideshows).toEqual([{ id: "photos-1", photos: expect.any(Array) }]);
  });
});
