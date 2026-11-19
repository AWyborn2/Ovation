/**
 * Round 9, Ash's decision (b): automation is held back only by a layout
 * warning on the feed size (the size a feed post would use). A Story-only
 * warning still shows on the draft, but the Queue reads the card as ready
 * once its deadline passes and the pending count doesn't count it. A feed
 * warning, or a check still pending, keeps it waiting. Real-DB test (needs
 * DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  socialDraftsTable,
  socialSettingsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
let tenantId: number;
let adminId: number;
let cookie: string;

const box = { x: 5, y: 5, w: 90, h: 20 };
/** A Portrait and Story design. */
const DOC = {
  layers: [
    {
      id: "t",
      kind: "shape",
      sizes: ["portrait", "story"],
      geometry: { portrait: box, story: box },
    },
  ],
};
const warn = (size: string) => [{ reason: "overflow", size }];

async function draft(over: Partial<typeof socialDraftsTable.$inferInsert>) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "roundup",
      status: "awaiting_review",
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      appPath: "/",
      packId: "blank",
      adjustments: DOC,
      templateVersion: 1,
      layoutCheckPending: false,
      layoutWarnings: { portrait: [], story: [] },
      autoReadyAt: new Date(Date.now() - 60_000),
      sourceImportedAt: new Date(),
      designSize: "portrait",
      ...over,
    })
    .returning();
  return row!;
}

const get = (path: string) =>
  request(app).get(`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-feed-size";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `feedsize-${STAMP}`,
      centralClubId: 4_300_000 + (STAMP % 100_000),
      name: "Feed Size Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  const [a] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `fs_${STAMP}`, displayName: "FS", passwordHash: "x" })
    .returning();
  adminId = a!.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values({
    tenantId,
    autoPostEnabled: true,
    sizeSquare: false,
    sizePortrait: true,
    sizeStory: true,
  });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("only a feed-size layout warning holds automation back (round 9 (b))", () => {
  it("a Story-only warning reads ready and isn't pending; a Portrait warning or a pending check waits", async () => {
    const storyOnly = await draft({ layoutWarnings: { portrait: [], story: warn("story") } });
    const feedWarned = await draft({ layoutWarnings: { portrait: warn("portrait"), story: [] } });
    const pending = await draft({ layoutCheckPending: true, layoutWarnings: null });

    const status = async (id: number) => (await get(`/social-drafts/${id}`)).body.status;
    expect(await status(storyOnly.id)).toBe("ready");
    expect(await status(feedWarned.id)).toBe("awaiting_review");
    expect(await status(pending.id)).toBe("awaiting_review");
    // The Story warning still shows to the admin.
    expect((await get(`/social-drafts/${storyOnly.id}`)).body.layoutWarnings).toEqual({
      portrait: [],
      story: warn("story"),
    });

    const count = await get("/social-drafts/pending-count");
    expect(count.status).toBe(200);
    expect(count.body.count).toBe(2);
  });
});
