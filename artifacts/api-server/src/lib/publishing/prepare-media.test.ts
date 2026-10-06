/**
 * Publish-ready media (plan 2026-10-06-001 U4): sizes, JPEG output, absolute
 * public URLs, carousel splitting and its cap, captions per platform, and
 * cleanup. Real-DB integration test (needs DATABASE_URL); the still renderer
 * and object store are swapped for in-memory fakes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
  type SocialDraftRow,
} from "@workspace/db";
import { setStillRenderer } from "../draft-render";
import { logger } from "../logger";
import { setPhotoStore, type PhotoStore } from "../photo-store";
import { prepareMedia, removeImages, MAX_IMAGES } from "./prepare-media";

const STAMP = Date.now();
const log = logger;
const saved = { ...process.env };
let tenantId: number;

const objects = new Map<string, { data: Buffer; type: string }>();
const memoryStore: PhotoStore = {
  async read(p) {
    return objects.get(p)!.data;
  },
  async write(data, type) {
    const p = `/objects/library/${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    objects.set(p, { data, type });
    return p;
  },
  async remove(p) {
    objects.delete(p);
  },
};

const renders: { size: string }[] = [];
async function fakeRender(_input: unknown, options: unknown) {
  renders.push({ size: (options as { size: string }).size });
  const buffer = await sharp({
    create: { width: 40, height: 50, channels: 4, background: "#123456" },
  })
    .png()
    .toBuffer();
  return { buffer, contentType: "image/png" };
}

async function draft(
  over: Partial<typeof socialDraftsTable.$inferInsert> = {},
): Promise<SocialDraftRow> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "milestone",
      status: "ready",
      cardInput: { kind: "milestone", playerName: "Sam Smith", value: 100 },
      caption: "Instagram caption",
      ...over,
    })
    .returning();
  return row;
}

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `media-${STAMP}`, centralClubId: 9941, name: "Media Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId, sizePortrait: true, sizeStory: true });
  await db.insert(captionTemplatesTable).values({
    tenantId,
    engine: "milestone",
    platform: "facebook",
    template: "Facebook: {player.name}",
  });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

beforeEach(() => {
  process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
  setStillRenderer(fakeRender);
  setPhotoStore(memoryStore);
  renders.length = 0;
  objects.clear();
});

afterEach(() => {
  setStillRenderer(null);
  setPhotoStore(null);
  process.env = { ...saved };
});

describe("prepareMedia", () => {
  it("renders a feed post at the portrait size as a JPEG on the public origin", async () => {
    const d = await draft();
    const { post, imagePaths } = await prepareMedia(d, "instagram", "feed", log);
    expect(renders).toEqual([{ size: "portrait" }]);
    expect(post.imageUrls).toHaveLength(1);
    expect(post.imageUrls[0]).toMatch(
      /^https:\/\/platform\.test\/api\/storage\/objects\/library\/\w{12,}/,
    );
    const stored = objects.get(imagePaths[0])!;
    expect(stored.type).toBe("image/jpeg");
    expect((await sharp(stored.data).metadata()).format).toBe("jpeg");
    expect(post.caption).toBe("Instagram caption");
  });

  it("falls back to square when portrait is off", async () => {
    await db
      .update(socialSettingsTable)
      .set({ sizePortrait: false })
      .where(eq(socialSettingsTable.tenantId, tenantId));
    try {
      await prepareMedia(await draft(), "facebook", "feed", log);
      expect(renders).toEqual([{ size: "square" }]);
    } finally {
      await db
        .update(socialSettingsTable)
        .set({ sizePortrait: true })
        .where(eq(socialSettingsTable.tenantId, tenantId));
    }
  });

  it("uses the story size and no caption for Stories", async () => {
    const { post } = await prepareMedia(await draft(), "instagram", "story", log);
    expect(renders).toEqual([{ size: "story" }]);
    expect(post.caption).toBeNull();
  });

  it("splits a long list into ordered images and refuses more than ten", async () => {
    const fixtures = (n: number) => Array.from({ length: n }, (_, i) => ({ grade: `Grade ${i}` }));
    const three = await draft({
      cardInput: { kind: "roundFixtures", fixtures: fixtures(12) },
    });
    const { post } = await prepareMedia(three, "instagram", "feed", log);
    expect(post.imageUrls.length).toBeGreaterThan(1);
    expect(post.imageUrls.length).toBeLessThanOrEqual(MAX_IMAGES);

    const huge = await draft({
      cardInput: { kind: "roundFixtures", fixtures: fixtures(200) },
    });
    await expect(prepareMedia(huge, "instagram", "feed", log)).rejects.toThrow(/at most 10/);
  });

  it("Covers AE6: renders the draft's current content each time", async () => {
    const d = await draft();
    await prepareMedia(d, "instagram", "feed", log);
    const seen: unknown[] = [];
    setStillRenderer(async (input, options) => {
      seen.push(input);
      return fakeRender(input, options);
    });
    const [updated] = await db
      .update(socialDraftsTable)
      .set({ cardInput: { kind: "milestone", playerName: "Corrected Name", value: 101 } })
      .where(eq(socialDraftsTable.id, d.id))
      .returning();
    await prepareMedia(updated, "instagram", "feed", log);
    expect(JSON.stringify(seen)).toContain("Corrected Name");
  });

  it("captions Facebook from its template unless the officer edited the draft", async () => {
    const d = await draft();
    expect((await prepareMedia(d, "facebook", "feed", log)).post.caption).toBe(
      "Facebook: Sam Smith",
    );
    const edited = await draft({ editedAt: new Date(), caption: "My own words" });
    expect((await prepareMedia(edited, "facebook", "feed", log)).post.caption).toBe("My own words");
  });

  it("fails clearly without a public origin, and cleanup removes the images", async () => {
    delete process.env.SOCIAL_PUBLIC_ORIGIN;
    await expect(prepareMedia(await draft(), "instagram", "feed", log)).rejects.toThrow(
      /SOCIAL_PUBLIC_ORIGIN/,
    );
    process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
    const { imagePaths } = await prepareMedia(await draft(), "instagram", "feed", log);
    expect(objects.size).toBe(1);
    await removeImages(imagePaths);
    expect(objects.size).toBe(0);
  });
});
