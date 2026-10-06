/**
 * Auto-publish at the deadline (plan 2026-10-06-001 U7). Real-DB integration
 * test (needs DATABASE_URL); Meta, the renderer and storage are faked.
 */
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import app from "../../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialSettingsTable,
  socialDraftsTable,
  socialConnectionsTable,
  socialPublicationsTable,
  notificationsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { seal } from "../secret-box";
import { setStillRenderer } from "../draft-render";
import { setPhotoStore } from "../photo-store";
import { logger } from "../logger";
import { runDraftSweep } from "../draft-sweep";
import { upsertDraftByKey } from "../draft-upsert";
import { setDestination } from "./meta-adapter";
import { scheduleAutoPublish } from "./auto-publish";

const STAMP = Date.now();
const HOUR = 3_600_000;
const saved = { ...process.env };
let tenantId: number;
let adminId: number;
let cookie: string;
let seq = 0;

async function autoDraft(importedHoursAgo: number, cardInput: Record<string, unknown> = {}) {
  const { draft } = await upsertDraftByKey({
    tenantId,
    engine: "roundup",
    family: "roundup",
    sourceKey: `autopub:${STAMP}:${++seq}`,
    cardInput: {
      kind: "gradeLeader",
      playerName: `P${seq}`,
      value: 1,
      grade: "A Grade",
      ...cardInput,
    },
    appPath: "/records",
    sourceImportedAt: new Date(Date.now() - importedHoursAgo * HOUR),
  });
  return draft;
}

const pubsFor = (draftId: number) =>
  db.select().from(socialPublicationsTable).where(eq(socialPublicationsTable.draftId, draftId));

async function settings(set: Partial<typeof socialSettingsTable.$inferInsert>) {
  await db.update(socialSettingsTable).set(set).where(eq(socialSettingsTable.tenantId, tenantId));
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-auto-publish";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `autopub-${STAMP}`, centralClubId: 98407, name: "AutoPub", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `autopub_${STAMP}`, displayName: "A", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values({
    tenantId,
    autoPostEnabled: true,
    autoPostWindowHours: 12,
    autoPublishEnabled: true,
    autoPublishFreshnessHours: 24,
  });
});

afterAll(async () => {
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

beforeEach(async () => {
  process.env.META_PUBLISHING_ENABLED = "1";
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
  await settings({ autoPostEnabled: true, autoPublishEnabled: true, autoPostWindowHours: 12 });
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db.insert(socialConnectionsTable).values({
    tenantId,
    status: "connected",
    pageId: "page-1",
    igUserId: "ig-1",
    pageToken: seal("EAAAutoPublishPageToken12"),
  });
});

afterEach(() => {
  setDestination(null);
  setStillRenderer(null);
  setPhotoStore(null);
  process.env = { ...saved, SESSION_SECRET: process.env.SESSION_SECRET };
});

describe("auto-publish candidates", () => {
  it("Covers AE1: a fresh auto-promoted draft gets feed posts on both platforms and no ready notice", async () => {
    const d = await autoDraft(12.1);
    // The sweep runs the worker too; give it fakes so nothing real happens.
    setDestination({
      createMedia: async (_a, p) => [`${p.platform}-m`],
      publish: async (_a, p) => ({ kind: "published", postId: `${p.platform}-post` }),
      findLanded: async () => null,
      checkHealth: async () => ({ ok: true }),
    });
    setPhotoStore({
      read: async () => Buffer.alloc(0),
      write: async () => `/objects/library/${randomBytes(8).toString("hex")}`,
      remove: async () => {},
    });
    setStillRenderer(async () => ({
      buffer: await sharp({ create: { width: 4, height: 5, channels: 3, background: "#fff" } })
        .png()
        .toBuffer(),
      contentType: "image/png",
    }));
    await runDraftSweep(tenantId, { kind: "scheduled" }, logger);
    const pubs = await pubsFor(d.id);
    expect(pubs.map((p) => p.platform).sort()).toEqual(["facebook", "instagram"]);
    expect(pubs.every((p) => p.origin === "auto" && p.postType === "feed")).toBe(true);
    const ready = await db
      .select()
      .from(notificationsTable)
      .where(
        and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.kind, "drafts_ready")),
      );
    expect(ready).toHaveLength(0);
  });

  it("Covers AE2: switching auto-publish on publishes fresh ready drafts, not old ones", async () => {
    await settings({ autoPublishEnabled: false });
    const fresh = await autoDraft(13);
    const old = await autoDraft(72);
    await db
      .update(socialDraftsTable)
      .set({ status: "ready" })
      .where(eq(socialDraftsTable.tenantId, tenantId));
    expect((await scheduleAutoPublish(tenantId, new Date())).size).toBe(0);
    await settings({ autoPublishEnabled: true });
    const scheduled = await scheduleAutoPublish(tenantId, new Date());
    expect([...scheduled]).toEqual([fresh.id]);
    expect(await pubsFor(old.id)).toHaveLength(0);
  });

  it("Covers AE8: a corrective re-import does not restart the freshness clock", async () => {
    const d = await autoDraft(72);
    // The same source key again, as a re-import would.
    await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: d.sourceKey!,
      cardInput: { kind: "gradeLeader", playerName: "Fixed", value: 2, grade: "A Grade" },
      appPath: "/records",
      sourceImportedAt: new Date(),
    });
    await db
      .update(socialDraftsTable)
      .set({ status: "ready" })
      .where(eq(socialDraftsTable.id, d.id));
    expect((await scheduleAutoPublish(tenantId, new Date())).has(d.id)).toBe(false);
  });

  it("picks up a promoted draft a crashed sweep never scheduled, but not a touched one", async () => {
    const orphan = await autoDraft(13);
    const touched = await autoDraft(13);
    await db
      .update(socialDraftsTable)
      .set({ status: "ready" })
      .where(eq(socialDraftsTable.id, orphan.id));
    await db
      .update(socialDraftsTable)
      .set({ status: "ready", autoReadyAt: null })
      .where(eq(socialDraftsTable.id, touched.id));
    const scheduled = await scheduleAutoPublish(tenantId, new Date());
    expect(scheduled.has(orphan.id)).toBe(true);
    expect(scheduled.has(touched.id)).toBe(false);
    // Already scheduled: a second sweep adds nothing.
    expect((await scheduleAutoPublish(tenantId, new Date())).size).toBe(0);
  });

  it("Covers AE5: junior drafts never auto-publish, by either marker", async () => {
    const byColumn = await autoDraft(13);
    const byInput = await autoDraft(13, { junior: true });
    await db
      .update(socialDraftsTable)
      .set({ status: "ready" })
      .where(eq(socialDraftsTable.tenantId, tenantId));
    await db
      .update(socialDraftsTable)
      .set({ sourceMatchIsJunior: true })
      .where(eq(socialDraftsTable.id, byColumn.id));
    const scheduled = await scheduleAutoPublish(tenantId, new Date());
    expect(scheduled.has(byColumn.id)).toBe(false);
    expect(scheduled.has(byInput.id)).toBe(false);
  });

  it("does nothing while the club needs to reconnect", async () => {
    await autoDraft(13);
    await db
      .update(socialDraftsTable)
      .set({ status: "ready" })
      .where(eq(socialDraftsTable.tenantId, tenantId));
    await db
      .update(socialConnectionsTable)
      .set({ status: "needs_reconnect" })
      .where(eq(socialConnectionsTable.tenantId, tenantId));
    expect((await scheduleAutoPublish(tenantId, new Date())).size).toBe(0);
  });
});

describe("auto-publish settings", () => {
  const patch = (body: object) =>
    request(app)
      .patch("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send(body);

  it("needs a connection, and a cut-off at least the window", async () => {
    await settings({ autoPublishEnabled: false });
    await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
    expect((await patch({ autoPublishEnabled: true })).status).toBe(400);

    await db.insert(socialConnectionsTable).values({
      tenantId,
      status: "connected",
      pageId: "page-1",
      pageToken: seal("EAAAutoPublishPageToken12"),
    });
    expect((await patch({ autoPublishEnabled: true, autoPublishFreshnessHours: 6 })).status).toBe(
      400,
    );
    const ok = await patch({ autoPublishEnabled: true, autoPublishFreshnessHours: 24 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ autoPublishEnabled: true, autoPublishFreshnessHours: 24 });
  });

  it("turning auto-post off turns auto-publish off", async () => {
    const res = await patch({ autoPostEnabled: false });
    expect(res.body).toMatchObject({ autoPostEnabled: false, autoPublishEnabled: false });
  });
});
