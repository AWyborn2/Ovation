/**
 * Social Studio U18 — ad-hoc cards and editor templates. An ad-hoc card waits
 * for review and never auto-promotes; saving a draft as a template and
 * creating a card from it reproduces the pack and adjustments; editor
 * templates stay out of the card-template gallery and never leak across
 * tenants. Real-DB integration test (needs DATABASE_URL).
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
  socialSettingsTable,
  cardTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { randomUUID } from "node:crypto";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import { PACKS } from "../lib/design-packs";
import { renderDraftSlides, setStillRenderer } from "../lib/draft-render";
import { logger } from "../lib/logger";

const STAMP = Date.now();
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];

async function makeTenant(n: number) {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `adhoc-${n}-${STAMP}`,
      centralClubId: 9960 + n,
      name: "Adhoc Club",
      plan: "pro",
    })
    .returning();
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId: t.id, username: `adhoc${n}_${STAMP}`, displayName: "A", passwordHash: "x" })
    .returning();
  tenantIds.push(t.id);
  adminIds.push(admin.id);
  cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-adhoc";
  await makeTenant(1);
  await makeTenant(2);
  // Auto-post on: an ad-hoc card must still wait for review.
  await db.insert(socialSettingsTable).values({ tenantId: tenantIds[0], autoPostEnabled: true });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenantIds));
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenantIds));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
});

const as = (i: number) => ({
  post: (path: string, body?: object) =>
    request(app)
      .post(`/api${path}`)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i]))
      .send(body ?? {}),
  get: (path: string) =>
    request(app)
      .get(`/api${path}`)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i])),
  del: (path: string) =>
    request(app)
      .delete(`/api${path}`)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i])),
});

const signing = { kind: "newSigning", playerName: "Sam Lee", headline: "WELCOME" };
const adjustments = {
  fields: { headline: "NEW RECRUIT" },
  layers: [
    {
      id: "l1",
      kind: "text",
      content: "Sat 2pm",
      geometry: { square: { x: 5, y: 5, w: 40, h: 8 } },
    },
  ],
};

describe("POST /social-drafts (ad-hoc)", () => {
  it("accepts exactly the server's registered built-in pack identities", () => {
    expect([...CAROUSEL_PACK_IDS].sort()).toEqual(PACKS.map((p) => p.id).sort());
  });
  it.each(CAROUSEL_PACK_IDS)(
    "freezes %s for review and exports instead of the mutable draft default",
    async (packId) => {
      const slides = ["title", "content", "sponsors"].map((id, index) => ({
        id,
        label: id,
        junior: false,
        sponsorsOn: false,
        warnings: [],
        input: {
          kind: "matchDay",
          ...(index !== 1 ? { carouselPage: { page: id, title: "Frozen set", sponsors: [] } } : {}),
        },
        data: { photoTransform: { focalX: 0.2, focalY: 0.6, zoom: 1.4 } },
      }));
      const composition = {
        version: 1,
        packId,
        submissionId: randomUUID(),
        size: "square",
        slides,
      };
      const response = await as(0).post("/social-drafts", {
        packId,
        caption: "Frozen caption",
        cardInput: { kind: "matchDay", weekendCarousel: composition },
      });
      expect(response.status).toBe(201);
      expect(response.body.packId).toBe(packId);
      expect(response.body.cardInput.weekendCarousel).toEqual(composition);
      const [row] = await db
        .select()
        .from(socialDraftsTable)
        .where(eq(socialDraftsTable.id, response.body.id));
      const calls: Record<string, unknown>[] = [];
      setStillRenderer(async (_input, options) => {
        calls.push(options as Record<string, unknown>);
        return { buffer: Buffer.from("png"), contentType: "image/png" };
      });
      try {
        await renderDraftSlides(
          { ...row, packId: "unrelated-current-default" },
          ["square", "portrait", "story", "landscape"],
          null,
          logger,
        );
        expect(calls).toHaveLength(12);
        expect(calls.every((c) => c.packId === packId)).toBe(true);
        const legacy = structuredClone(row.cardInput) as { weekendCarousel: { packId?: string } };
        delete legacy.weekendCarousel.packId;
        calls.length = 0;
        await renderDraftSlides(
          { ...row, cardInput: legacy, packId: "sunset-v1" },
          ["square"],
          null,
          logger,
        );
        expect(calls.every((c) => c.packId === "club-kit-v1")).toBe(true);
      } finally {
        setStillRenderer(null);
      }
      const invalid = await as(0).post("/social-drafts", {
        caption: "Invalid pack",
        cardInput: {
          kind: "matchDay",
          weekendCarousel: { ...composition, packId: "uploaded-custom" },
        },
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toMatch(/Unknown carousel design pack/);
      const mismatched = await as(0).post("/social-drafts", {
        packId: packId === "sunset-v1" ? "club-kit-v1" : "sunset-v1",
        caption: "Mismatch",
        cardInput: { kind: "matchDay", weekendCarousel: composition },
      });
      expect(mismatched.status).toBe(400);
    },
  );
  it("queues an entire match-day carousel once, keeps it private and renders every saved slide", async () => {
    const slides = ["title", "fixture-11", "sponsors"].map((id, index) => ({
      id,
      label: id,
      junior: false,
      sponsorsOn: index !== 2,
      warnings: [],
      input: {
        kind: "matchDay",
        ...(index !== 1
          ? { carouselPage: { page: id, title: "Round one", sponsors: [] } }
          : { grade: "A Grade", oppositionName: "Visitors" }),
      },
      data: {
        photoUrl: "/test-photo.png",
        photoTransform: { focalX: 0.3, focalY: 0.7, zoom: 1.8 },
        sponsors: [{ name: "Team sponsor", logoUrl: "/team-logo.png" }],
      },
    }));
    const body = {
      cardInput: {
        kind: "matchDay",
        headline: "Round one carousel",
        weekendCarousel: {
          version: 1,
          packId: "club-kit-v1",
          submissionId: randomUUID(),
          size: "portrait",
          slides,
        },
      },
      caption: "MATCH DAY\nA Grade v Visitors",
      packId: "club-kit-v1",
    };
    const created = await as(0).post("/social-drafts", body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: "awaiting_review",
      autoReadyAt: null,
      caption: body.caption,
      family: "matchday",
    });
    expect(created.body.cardInput).toEqual(body.cardInput);
    const retry = await as(0).post("/social-drafts", body);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(created.body.id);
    const queue = await as(0).get("/social-drafts?status=awaiting_review");
    expect(queue.body.filter((d: { id: number }) => d.id === created.body.id)).toHaveLength(1);
    const otherQueue = await as(1).get("/social-drafts");
    expect(otherQueue.body.map((d: { id: number }) => d.id)).not.toContain(created.body.id);
    const pending = await as(0).get("/social-drafts/pending-count");
    expect(pending.body.count).toBeGreaterThan(0);
    const caption = await request(app)
      .patch(`/api/social-drafts/${created.body.id}`)
      .set("Cookie", cookies[0])
      .set("x-tenant-id", String(tenantIds[0]))
      .send({ caption: "Updated match-day caption" });
    expect(caption.status).toBe(200);
    const approved = await as(0).post(`/social-drafts/${created.body.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("ready");
    const [row] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, created.body.id));
    expect(row.caption).toBe("Updated match-day caption");
    const calls: { input: unknown; options: Record<string, unknown> }[] = [];
    setStillRenderer(async (input, options) => {
      calls.push({ input, options: options as Record<string, unknown> });
      return { buffer: Buffer.from("test-png"), contentType: "image/png" };
    });
    try {
      const rendered = await renderDraftSlides(row, ["portrait", "landscape"], null, logger);
      expect(rendered.map((s) => [s.size, s.page, s.of])).toEqual([
        ["portrait", 1, 3],
        ["portrait", 2, 3],
        ["portrait", 3, 3],
        ["landscape", 1, 3],
        ["landscape", 2, 3],
        ["landscape", 3, 3],
      ]);
      expect(calls.slice(0, 3).map((c) => c.input)).toEqual(slides.map((s) => s.input));
      expect(calls[1].options).toMatchObject({
        data: slides[1].data,
        sponsorsOn: true,
        packId: "club-kit-v1",
        strictImages: true,
        adjustments: { photo: { portrait: slides[1].data.photoTransform } },
      });
    } finally {
      setStillRenderer(null);
    }
  });

  it("rejects incomplete carousel payloads and blank captions", async () => {
    const res = await as(0).post("/social-drafts", {
      cardInput: { kind: "matchDay", weekendCarousel: { version: 1, slides: [] } },
      caption: "",
    });
    expect(res.status).toBe(400);
  });

  it("creates a draft awaiting review that never auto-promotes", async () => {
    const res = await as(0).post("/social-drafts", { cardInput: signing, packId: null });
    expect(res.status).toBe(201);
    expect(res.body.engine).toBe("adhoc");
    expect(res.body.status).toBe("awaiting_review");
    expect(res.body.autoReadyAt).toBeNull();
    expect(res.body.family).toBe("matchday");

    const [row] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, res.body.id));
    expect(row.sourceImportedAt).toBeNull();
    expect(row.createdByAdminId).toBe(adminIds[0]);
  });

  it("stays out of the queue until it is edited, then shows who made it", async () => {
    const res = await as(0).post("/social-drafts", { cardInput: signing, packId: null });
    const ids = async () =>
      ((await as(0).get("/social-drafts?status=awaiting_review")).body as { id: number }[]).map(
        (d) => d.id,
      );
    const pending = async () => (await as(0).get("/social-drafts/pending-count")).body.count;
    const before = await pending();
    expect(await ids()).not.toContain(res.body.id);

    const edited = await request(app)
      .patch(`/api/social-drafts/${res.body.id}`)
      .set("Cookie", cookies[0])
      .set("x-tenant-id", String(tenantIds[0]))
      .send({ caption: "Welcome Sam" });
    expect(edited.status).toBe(200);
    expect(await ids()).toContain(res.body.id);
    expect(await pending()).toBe(before + 1);
    const list = (await as(0).get("/social-drafts")).body as { id: number; createdBy: string }[];
    expect(list.find((d) => d.id === res.body.id)?.createdBy).toBe("A");
  });

  it("a blank canvas keeps the blank pack and its layers", async () => {
    const res = await as(0).post("/social-drafts", {
      cardInput: signing,
      packId: "blank",
      adjustments,
    });
    expect(res.status).toBe(201);
    expect(res.body.packId).toBe("blank");
    expect(res.body.adjustments).toEqual(adjustments);
  });

  it("rejects a card input with no kind", async () => {
    expect((await as(0).post("/social-drafts", { cardInput: {} })).status).toBe(400);
  });
});

describe("editor templates", () => {
  it("save as template, then create from it, reproduces the pack and adjustments", async () => {
    const draft = await as(0).post("/social-drafts", {
      cardInput: signing,
      packId: "broadcast-dark-v1",
      adjustments,
    });
    const saved = await as(0).post(`/social-drafts/${draft.body.id}/save-template`, {
      name: "Signing, with time",
    });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({
      name: "Signing, with time",
      baseKind: "newSigning",
      packId: "broadcast-dark-v1",
      adjustments,
    });

    const listed = await as(0).get("/editor-templates");
    expect(listed.body.map((t: { id: number }) => t.id)).toContain(saved.body.id);
    // Editor templates are not gallery designs.
    const gallery = await as(0).get("/card-templates");
    expect(gallery.body.map((t: { id: number }) => t.id)).not.toContain(saved.body.id);

    const other = { ...signing, playerName: "Jo Park" };
    const fresh = await as(0).post("/social-drafts", {
      cardInput: other,
      templateId: saved.body.id,
    });
    expect(fresh.status).toBe(201);
    expect(fresh.body.cardInput).toEqual(other);
    expect(fresh.body.packId).toBe("broadcast-dark-v1");
    expect(fresh.body.adjustments).toEqual(adjustments);
  });

  it("another club cannot see, use or delete a template", async () => {
    const draft = await as(0).post("/social-drafts", { cardInput: signing, adjustments });
    const saved = await as(0).post(`/social-drafts/${draft.body.id}/save-template`, {
      name: "Private",
    });
    expect((await as(1).get("/editor-templates")).body).toEqual([]);
    const use = await as(1).post("/social-drafts", {
      cardInput: signing,
      templateId: saved.body.id,
    });
    expect(use.status).toBe(404);
    expect((await as(1).del(`/editor-templates/${saved.body.id}`)).status).toBe(404);
    expect((await as(0).del(`/editor-templates/${saved.body.id}`)).status).toBe(204);
  });

  it("an empty name is rejected", async () => {
    const draft = await as(0).post("/social-drafts", { cardInput: signing });
    const res = await as(0).post(`/social-drafts/${draft.body.id}/save-template`, { name: "" });
    expect(res.status).toBe(400);
  });
});
