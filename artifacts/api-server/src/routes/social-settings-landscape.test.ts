/**
 * The club's output-size switches through the settings API (Social Studio
 * U11; portrait and story sizes plan, Stage 6, D3). New clubs start with
 * Portrait and Story on and the older sizes (Square, Landscape) off; an older
 * size can be switched off but never back on, and no save leaves a club
 * without a feed size. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
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
let tenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-landscape";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `landscape-${STAMP}`, centralClubId: 9993, name: "Wide Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `wide_${STAMP}`, displayName: "Wide", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const get = () =>
  request(app)
    .get("/api/social-settings")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId));
const patch = (body: Record<string, unknown>) =>
  request(app)
    .patch("/api/social-settings")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId))
    .send(body);
/** Sets the stored switches directly, as a club from before Stage 6 has them. */
const store = (sizes: Partial<typeof socialSettingsTable.$inferInsert>) =>
  db.update(socialSettingsTable).set(sizes).where(eq(socialSettingsTable.tenantId, tenantId));
const stored = async () => {
  const [row] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return {
    square: row!.sizeSquare,
    portrait: row!.sizePortrait,
    story: row!.sizeStory,
    landscape: row!.sizeLandscape,
  };
};

describe("output sizes", () => {
  it("a new club starts with Portrait and Story on, Square and Landscape off", async () => {
    const first = await get();
    expect(first.status).toBe(200);
    expect(first.body.settings).toMatchObject({
      sizeSquare: false,
      sizePortrait: true,
      sizeStory: true,
      sizeLandscape: false,
    });
  });

  it("refuses to switch an older size back on once it's off", async () => {
    const square = await patch({ sizeSquare: true });
    expect(square.status).toBe(400);
    expect(square.body.error).toMatch(/Square is an older size/);
    const landscape = await patch({ sizeLandscape: true });
    expect(landscape.status).toBe(400);
    expect(landscape.body.error).toMatch(/Landscape is an older size/);
    expect(await stored()).toEqual({
      square: false,
      portrait: true,
      story: true,
      landscape: false,
    });
  });

  it("lets a club with an older size on keep it, or switch it off for good", async () => {
    await store({ sizeSquare: true, sizeLandscape: true });
    // Saving it on again, as the settings card does, is fine.
    expect((await patch({ sizeSquare: true, sizeLandscape: true })).status).toBe(200);
    const off = await patch({ sizeLandscape: false });
    expect(off.status).toBe(200);
    expect(off.body.sizeLandscape).toBe(false);
    expect((await get()).body.settings.sizeLandscape).toBe(false);
    expect((await patch({ sizeLandscape: true })).status).toBe(400);
    expect((await stored()).landscape).toBe(false);
  });

  it("switching Square off with Portrait off switches Portrait on: never no feed size", async () => {
    await store({ sizeSquare: true, sizePortrait: false, sizeStory: true });
    const res = await patch({ sizeSquare: false, sizePortrait: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Portrait is your feed size, so it stays on.");
    expect(await stored()).toMatchObject({ square: true, portrait: false });

    const off = await patch({ sizeSquare: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ sizeSquare: false, sizePortrait: true });
    expect(await stored()).toMatchObject({ square: false, portrait: true, story: true });
  });

  it("refuses to switch Portrait off while Square is off", async () => {
    await store({ sizeSquare: false, sizePortrait: true });
    const res = await patch({ sizePortrait: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Portrait is your feed size, so it stays on.");
    expect((await stored()).portrait).toBe(true);
    // Story is not a feed size, so it can come and go.
    expect((await patch({ sizeStory: false })).status).toBe(200);
    expect((await patch({ sizeStory: true })).status).toBe(200);
    expect(await stored()).toMatchObject({ square: false, portrait: true, story: true });
  });

  it("a club with Square on can still switch Portrait off", async () => {
    await store({ sizeSquare: true, sizePortrait: true });
    const res = await patch({ sizePortrait: false });
    expect(res.status).toBe(200);
    expect(await stored()).toMatchObject({ square: true, portrait: false });
  });

  it("a save that doesn't mention sizes leaves them alone", async () => {
    await store({ sizeSquare: false, sizePortrait: true, sizeStory: false, sizeLandscape: false });
    expect((await patch({ clubHashtag: "#Wide" })).status).toBe(200);
    expect(await stored()).toEqual({
      square: false,
      portrait: true,
      story: false,
      landscape: false,
    });
  });
});
