/**
 * The publish worker (plan 2026-10-06-001 U6). Real-DB integration test
 * (needs DATABASE_URL); the destination, still renderer and object store are
 * in-memory fakes, so no Meta call or Chromium is involved.
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
  socialSettingsTable,
  socialDraftsTable,
  socialConnectionsTable,
  socialPublicationsTable,
  notificationsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { seal } from "../secret-box";
import { setStillRenderer } from "../draft-render";
import { setPhotoStore, type PhotoStore } from "../photo-store";
import { logger } from "../logger";
import { setDestination } from "./meta-adapter";
import { DestinationError, type Destination, type PublishOutcome } from "./destination";
import { runPublishSweep, BACKOFF_MS, MAX_ATTEMPTS } from "./publish-worker";

const STAMP = Date.now();
const saved = { ...process.env };
let tenantId: number;

// ── fakes ──────────────────────────────────────────────────────────────────
const objects = new Map<string, Buffer>();
const store: PhotoStore = {
  async read(p) {
    return objects.get(p)!;
  },
  async write(data) {
    const p = `/objects/library/${randomBytes(12).toString("hex")}`;
    objects.set(p, data);
    return p;
  },
  async remove(p) {
    objects.delete(p);
  },
};

type Call = { op: string; platform: string; mediaIds?: string[] };
let calls: Call[] = [];
let publishImpl: (platform: string, mediaIds: string[]) => Promise<PublishOutcome>;
let createImpl: (platform: string) => Promise<string[]>;
let landedImpl: (platform: string, mediaIds: string[]) => Promise<string | null>;

const fake: Destination = {
  async createMedia(_a, post) {
    calls.push({ op: "create", platform: post.platform });
    return createImpl(post.platform);
  },
  async publish(_a, post, mediaIds) {
    calls.push({ op: "publish", platform: post.platform, mediaIds });
    return publishImpl(post.platform, mediaIds);
  },
  async findLanded(_a, post, mediaIds) {
    calls.push({ op: "landed", platform: post.platform, mediaIds });
    return landedImpl(post.platform, mediaIds);
  },
  async checkHealth() {
    return { ok: true };
  },
};

// ── helpers ────────────────────────────────────────────────────────────────
async function draftWith(
  platforms: ("facebook" | "instagram")[],
  at = new Date(Date.now() - 1000),
) {
  const [d] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "milestone",
      status: "ready",
      cardInput: { kind: "milestone" },
      caption: "Hi",
    })
    .returning();
  const pubs = await db
    .insert(socialPublicationsTable)
    .values(
      platforms.map((platform) => ({
        tenantId,
        draftId: d.id,
        platform,
        scheduledFor: at,
        nextAttemptAt: at,
      })),
    )
    .returning();
  return { draft: d, pubs };
}

const pub = async (id: number) =>
  (await db.select().from(socialPublicationsTable).where(eq(socialPublicationsTable.id, id)))[0];
const draftStatus = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0].status;
const notices = async (kind: string) =>
  db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.kind, kind)));
const run = (now = new Date()) => runPublishSweep({ tenantId, now }, logger);

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `worker-${STAMP}`, centralClubId: 98406, name: "Worker Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId });
});

afterAll(async () => {
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

beforeEach(async () => {
  process.env.META_PUBLISHING_ENABLED = "1";
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
  setDestination(fake);
  setPhotoStore(store);
  setStillRenderer(async () => ({
    buffer: await sharp({ create: { width: 8, height: 10, channels: 3, background: "#000" } })
      .png()
      .toBuffer(),
    contentType: "image/png",
  }));
  calls = [];
  objects.clear();
  let n = 0;
  createImpl = async (p) => [`${p}-media-${++n}`];
  publishImpl = async (p) => ({ kind: "published", postId: `${p}-post` });
  landedImpl = async () => null;
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db.insert(socialConnectionsTable).values({
    tenantId,
    status: "connected",
    pageId: "page-1",
    igUserId: "ig-1",
    pageToken: seal("EAAPageTokenForWorkerTests1"),
  });
});

afterEach(() => {
  setDestination(null);
  setPhotoStore(null);
  setStillRenderer(null);
  process.env = { ...saved };
});

describe("publish worker", () => {
  it("does nothing while the kill switch is off", async () => {
    await draftWith(["facebook"]);
    process.env.META_PUBLISHING_ENABLED = "0";
    expect((await run()).skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("publishes a due Facebook post, cleans up, and posts the draft", async () => {
    const { draft, pubs } = await draftWith(["facebook"]);
    const summary = await run();
    expect(summary).toMatchObject({ claimed: 1, published: 1 });
    expect(calls.map((c) => c.op)).toEqual(["create", "publish"]);
    const row = await pub(pubs[0].id);
    expect(row).toMatchObject({
      status: "published",
      externalPostId: "facebook-post",
      imagePaths: [],
    });
    expect(row.mediaIds).toEqual(["facebook-media-1"]);
    expect(objects.size).toBe(0);
    expect(await draftStatus(draft.id)).toBe("posted");
    expect(await notices("published")).toHaveLength(1);
  });

  it("checks an Instagram container on a later run instead of waiting", async () => {
    const { pubs } = await draftWith(["instagram"]);
    publishImpl = async () => ({ kind: "processing" });
    const now = new Date();
    await run(now);
    let row = await pub(pubs[0].id);
    expect(row.status).toBe("scheduled");
    expect(row.attempts).toBe(0);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());

    publishImpl = async () => ({ kind: "published", postId: "ig-post" });
    await run(new Date(now.getTime() + 61_000));
    row = await pub(pubs[0].id);
    expect(row.status).toBe("published");
    // The second run reused the stored container: no new media.
    expect(calls.filter((c) => c.op === "create")).toHaveLength(1);
  });

  it("counts a container still processing after five minutes as a failed attempt", async () => {
    const { pubs } = await draftWith(["instagram"]);
    publishImpl = async () => ({ kind: "processing" });
    const now = new Date();
    await run(now);
    await run(new Date(now.getTime() + 6 * 60_000));
    const row = await pub(pubs[0].id);
    expect(row).toMatchObject({ status: "scheduled", attempts: 1, mediaIds: [] });
  });

  it("Covers AE3: Instagram fails on every attempt while Facebook publishes", async () => {
    const { draft, pubs } = await draftWith(["facebook", "instagram"]);
    publishImpl = async (p) => {
      if (p === "instagram") throw new DestinationError("transient", "Meta is having a moment");
      return { kind: "published", postId: "fb-post" };
    };
    let now = new Date();
    await run(now);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      now = new Date(now.getTime() + BACKOFF_MS[i] + 1000);
      await run(now);
    }
    const ig = pubs.find((p) => p.platform === "instagram")!;
    const fb = pubs.find((p) => p.platform === "facebook")!;
    expect(await pub(fb.id)).toMatchObject({ status: "published" });
    expect(await pub(ig.id)).toMatchObject({
      status: "failed",
      attempts: MAX_ATTEMPTS,
      lastError: "Meta is having a moment",
    });
    expect(await draftStatus(draft.id)).toBe("ready");
    expect(await notices("publish_failed")).toHaveLength(1);
  });

  it("fails a permanent error at once with Meta's reason and drops the media", async () => {
    const { pubs } = await draftWith(["instagram"]);
    publishImpl = async () => {
      throw new DestinationError("permanent", "Instagram could not process the image.");
    };
    await run();
    const row = await pub(pubs[0].id);
    expect(row).toMatchObject({ status: "failed", attempts: 1, mediaIds: [], imagePaths: [] });
    expect(objects.size).toBe(0);
  });

  it("Covers AE4 (hold half): a token error holds the club's posts and asks for a reconnect", async () => {
    const first = await draftWith(["facebook"]);
    const later = await draftWith(["instagram"], new Date(Date.now() + 3_600_000));
    publishImpl = async () => {
      throw new DestinationError("token", "Meta access was revoked or expired.");
    };
    await run();
    expect((await pub(first.pubs[0].id)).status).toBe("held");
    expect((await pub(later.pubs[0].id)).status).toBe("held");
    const [conn] = await db
      .select()
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.tenantId, tenantId));
    expect(conn.status).toBe("needs_reconnect");
    expect(await notices("reconnect_needed")).toHaveLength(1);

    // Held posts make no further Meta calls.
    calls = [];
    await db
      .update(socialPublicationsTable)
      .set({ status: "scheduled" })
      .where(eq(socialPublicationsTable.id, first.pubs[0].id));
    await run();
    expect(calls).toHaveLength(0);
    expect((await pub(first.pubs[0].id)).status).toBe("held");
  });

  it("Covers AE7: a retry whose post already landed records it without posting again", async () => {
    const { pubs } = await draftWith(["facebook"]);
    await db
      .update(socialPublicationsTable)
      .set({ mediaIds: ["photo-9"], attempts: 1 })
      .where(eq(socialPublicationsTable.id, pubs[0].id));
    landedImpl = async () => "fb-live-post";
    await run();
    expect(calls.map((c) => c.op)).toEqual(["landed"]);
    expect(await pub(pubs[0].id)).toMatchObject({
      status: "published",
      externalPostId: "fb-live-post",
    });
  });

  it("Covers AE7: a duplicate error that already landed counts as published", async () => {
    const { pubs } = await draftWith(["facebook"]);
    publishImpl = async () => {
      throw new DestinationError("duplicate", "Duplicate status message");
    };
    landedImpl = async (_p, ids) => (ids.length ? "fb-dupe-post" : null);
    await run();
    expect(await pub(pubs[0].id)).toMatchObject({
      status: "published",
      externalPostId: "fb-dupe-post",
    });
  });

  it("processes a due row once across two concurrent runs, and reclaims only stale leases", async () => {
    const { pubs } = await draftWith(["facebook"]);
    const [a, b] = await Promise.all([
      runPublishSweep({ tenantId }, logger),
      runPublishSweep({ tenantId }, logger),
    ]);
    expect(a.published + b.published).toBe(1);
    expect(calls.filter((c) => c.op === "publish")).toHaveLength(1);

    await db
      .update(socialPublicationsTable)
      .set({ status: "publishing", leaseUntil: new Date(Date.now() + 60_000), mediaIds: [] })
      .where(eq(socialPublicationsTable.id, pubs[0].id));
    calls = [];
    await run();
    expect(calls).toHaveLength(0);
    await db
      .update(socialPublicationsTable)
      .set({ leaseUntil: new Date(Date.now() - 1000) })
      .where(eq(socialPublicationsTable.id, pubs[0].id));
    await run();
    expect((await pub(pubs[0].id)).status).toBe("published");
  });

  it("leaves future posts alone", async () => {
    const { pubs } = await draftWith(["facebook"], new Date(Date.now() + 3_600_000));
    await run();
    expect(calls).toHaveLength(0);
    expect((await pub(pubs[0].id)).status).toBe("scheduled");
  });

  it("guards the internal endpoint with its own secret", async () => {
    process.env.SOCIAL_SWEEP_SECRET = "sweep-secret-value";
    process.env.SOCIAL_PUBLISH_SECRET = "publish-secret-value";
    const post = (secret?: string) => {
      const r = request(app).post("/api/internal/publish-sweep");
      return secret ? r.set("x-publish-secret", secret) : r;
    };
    expect((await post()).status).toBe(401);
    expect((await post("sweep-secret-value")).status).toBe(401);
    expect((await post("publish-secret-value")).status).toBe(200);
    process.env.SOCIAL_PUBLISH_SECRET = "sweep-secret-value";
    expect((await post("sweep-secret-value")).status).toBe(401);
    delete process.env.SOCIAL_PUBLISH_SECRET;
    expect((await post("publish-secret-value")).status).toBe(401);
  });

  it("cancels posts for a dismissed draft", async () => {
    const { draft, pubs } = await draftWith(["facebook"]);
    await db
      .update(socialDraftsTable)
      .set({ status: "dismissed" })
      .where(eq(socialDraftsTable.id, draft.id));
    await run();
    expect((await pub(pubs[0].id)).status).toBe("cancelled");
    expect(calls).toHaveLength(0);
  });
});
