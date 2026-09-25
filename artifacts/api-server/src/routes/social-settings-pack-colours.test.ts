/**
 * Design packs "Club colours / Pack's own look": the per-pack colour mode
 * round-trips through the settings API, merges per pack, is validated, and is
 * tenant-scoped. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-pack-colours";
  for (const i of [0, 1]) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `pack-colours-${i}-${STAMP}`,
        centralClubId: 9980 + i,
        name: `Colour Club ${i}`,
        plan: "pro",
      })
      .returning();
    tenantIds.push(t.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `colours_${i}_${STAMP}`,
        displayName: "Colours",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
  }
});

afterAll(async () => {
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, tenantIds));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  for (const id of tenantIds) await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
});

const get = (i: number) =>
  request(app)
    .get("/api/social-settings")
    .set("Cookie", cookies[i])
    .set("x-tenant-id", String(tenantIds[i]));
const patch = (i: number, body: object) =>
  request(app)
    .patch("/api/social-settings")
    .set("Cookie", cookies[i])
    .set("x-tenant-id", String(tenantIds[i]))
    .send(body);

describe("packColourModes", () => {
  it("is empty by default (every pack in club colours)", async () => {
    const res = await get(0);
    expect(res.status).toBe(200);
    expect(res.body.settings.packColourModes).toEqual({});
  });

  it("round-trips per pack and merges rather than replaces", async () => {
    const first = await patch(0, { packColourModes: { "sunset-v1": "pack" } });
    expect(first.status).toBe(200);
    expect(first.body.packColourModes).toEqual({ "sunset-v1": "pack" });

    const second = await patch(0, { packColourModes: { "neon-night-v1": "pack" } });
    expect(second.body.packColourModes).toEqual({
      "sunset-v1": "pack",
      "neon-night-v1": "pack",
    });

    const back = await patch(0, { packColourModes: { "sunset-v1": "club" } });
    expect(back.body.packColourModes).toEqual({
      "sunset-v1": "club",
      "neon-night-v1": "pack",
    });

    const again = await get(0);
    expect(again.body.settings.packColourModes).toEqual({
      "sunset-v1": "club",
      "neon-night-v1": "pack",
    });
  });

  it("leaves the modes alone when a PATCH does not mention them", async () => {
    const res = await patch(0, { sizeLandscape: true });
    expect(res.body.packColourModes).toEqual({
      "sunset-v1": "club",
      "neon-night-v1": "pack",
    });
  });

  it("rejects an unknown mode and a malformed pack id", async () => {
    expect((await patch(0, { packColourModes: { "sunset-v1": "neon" } })).status).toBe(400);
    expect((await patch(0, { packColourModes: { "Bad Pack!": "pack" } })).status).toBe(400);
  });

  it("is tenant-scoped", async () => {
    const other = await get(1);
    expect(other.body.settings.packColourModes).toEqual({});
    await patch(1, { packColourModes: { "gold-foil-v1": "pack" } });
    const mine = await get(0);
    expect(mine.body.settings.packColourModes).not.toHaveProperty("gold-foil-v1");
  });

  it("requires an admin", async () => {
    const res = await request(app)
      .patch("/api/social-settings")
      .set("x-tenant-id", String(tenantIds[0]))
      .send({ packColourModes: { "sunset-v1": "pack" } });
    expect(res.status).toBe(401);
  });
});
