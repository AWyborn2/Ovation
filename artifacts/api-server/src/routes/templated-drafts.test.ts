/**
 * Drafts picked from a template (ADR-011 T3.21): Create a Card with a
 * `templateRef`, and a templated (version 3) Weekend Carousel. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  socialDraftsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { documentCoverage } from "../lib/template-library/coverage";

const STAMP = Date.now();
const LOOK = `td-${STAMP}`;
let tenantId: number;
let adminId: number;
let cookie: string;
const lib: Record<string, number> = {};

const box = { x: 5, y: 5, w: 90, h: 20 };
const shape = (id: string) => ({
  id,
  kind: "shape",
  geometry: { square: box, portrait: box, story: box, landscape: box },
});
const matchDayDoc = {
  formatVersion: 2,
  pages: Object.fromEntries(
    ["fixture", "title", "sponsors"].map((p) => [p, { layers: [shape(`md-${p}`)] }]),
  ),
};

/** A Match Day look with every page but no Story size (an OMG T20 look, round 9 B13). */
const noStoryShape = (id: string) => ({
  id,
  kind: "shape",
  sizes: ["square", "portrait", "landscape"],
  geometry: { square: box, portrait: box, landscape: box },
});
const noStoryMatchDayDoc = {
  formatVersion: 2,
  pages: Object.fromEntries(
    ["fixture", "title", "sponsors"].map((p) => [p, { layers: [noStoryShape(`t20-${p}`)] }]),
  ),
};

async function libraryTemplate(
  kind: string,
  document: unknown,
  slug = `${LOOK}/${kind}`,
): Promise<number> {
  const [look] = await db
    .insert(templateLooksTable)
    .values({ slug: LOOK, name: LOOK, origin: "bundle" })
    .onConflictDoUpdate({ target: templateLooksTable.slug, set: { name: LOOK } })
    .returning();
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      slug,
      lookId: look!.id,
      kind,
      name: `${kind} (test)`,
      origin: "bundle",
      listed: true,
    })
    .returning();
  await db.insert(libraryTemplateVersionsTable).values({
    templateId: t!.id,
    version: 1,
    document,
    coverage: documentCoverage(document, kind),
    fitStatus: "pass",
  });
  return t!.id;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-templated-drafts";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `td-${STAMP}`,
      centralClubId: 4_000_000 + (STAMP % 100_000),
      name: "Draft Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  const [a] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `td_${STAMP}`, displayName: "TD", passwordHash: "x" })
    .returning();
  adminId = a!.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  lib.milestone = await libraryTemplate("milestone", placeholderDocument("milestone"));
  lib.matchDay = await libraryTemplate("matchDay", matchDayDoc);
  lib.noStory = await libraryTemplate("matchDay", noStoryMatchDayDoc, `${LOOK}/t20-matchDay`);
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
  await db
    .delete(libraryTemplatesTable)
    .where(inArray(libraryTemplatesTable.id, Object.values(lib)));
  await db.delete(templateLooksTable).where(eq(templateLooksTable.slug, LOOK));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const post = (body: object) =>
  request(app)
    .post("/api/social-drafts")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId))
    .send(body);

describe("Create a Card with a picked template", () => {
  it("copies a library version onto the blank base without touching the club's default", async () => {
    const res = await post({
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      templateRef: { libraryTemplateId: lib.milestone, version: 1 },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      packId: "blank",
      templateVersion: 1,
      templateRef: { libraryTemplateId: lib.milestone, version: 1 },
      layoutCheckPending: true,
    });
    expect(res.body.adjustments).toEqual(placeholderDocument("milestone"));
    const kindRows = await db
      .select()
      .from(cardTemplatesTable)
      .where(and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, "kind")));
    expect(kindRows).toEqual([]);
  });

  it("refuses a template of another kind, and a picked template with a saved layout", async () => {
    const wrong = await post({
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      templateRef: { libraryTemplateId: lib.matchDay, version: 1 },
    });
    expect(wrong.status).toBe(400);
    const both = await post({
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      templateRef: { libraryTemplateId: lib.milestone, version: 1 },
      adjustments: { layers: [] },
    });
    expect(both.status).toBe(400);
  });

  it("without a pick, a card copies the club's default (every club, no switch)", async () => {
    const res = await post({ cardInput: { kind: "milestone", playerName: "Sam", value: 100 } });
    expect(res.status).toBe(201);
    expect(res.body.packId).toBe("blank");
    expect(res.body.templateRef.copyId).toEqual(expect.any(Number));
  });
});

describe("a templated (version 3) Weekend Carousel", () => {
  const slides = ["title", "fixture", "sponsors"].map((id, i) => ({
    id,
    label: id,
    junior: false,
    sponsorsOn: false,
    warnings: [],
    input: {
      kind: "matchDay",
      ...(i !== 1 ? { carouselPage: { page: id, title: "This weekend", sponsors: [] } } : {}),
    },
    data: {},
  }));

  it("saves the assembled document and renders on the blank base", async () => {
    const res = await post({
      caption: "This weekend",
      cardInput: {
        kind: "matchDay",
        weekendCarousel: {
          version: 3,
          templateRef: { libraryTemplateId: lib.matchDay, version: 1 },
          setType: "matchDay",
          submissionId: randomUUID(),
          size: "square",
          slides,
        },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.packId).toBe("blank");
    expect(res.body.templateRef).toEqual({ libraryTemplateId: lib.matchDay, version: 1 });
    expect(Object.keys(res.body.adjustments.pages).sort()).toEqual([
      "fixture",
      "sponsors",
      "title",
    ]);
    expect(res.body.cardInput.weekendCarousel.packId).toBeUndefined();
  });

  it("refuses a version 3 carousel that names a pack", async () => {
    const res = await post({
      caption: "This weekend",
      packId: "club-kit-v1",
      cardInput: {
        kind: "matchDay",
        weekendCarousel: {
          version: 3,
          packId: "club-kit-v1",
          templateRef: { libraryTemplateId: lib.matchDay, version: 1 },
          setType: "matchDay",
          submissionId: randomUUID(),
          size: "square",
          slides,
        },
      },
    });
    expect(res.status).toBe(400);
  });

  it("refuses a Story set drawn with a look that has no Story size, never swapping the look (round 9 B13)", async () => {
    const carousel = (size: string) => ({
      caption: "This weekend",
      cardInput: {
        kind: "matchDay",
        weekendCarousel: {
          version: 3,
          templateRef: { libraryTemplateId: lib.noStory, version: 1 },
          setType: "matchDay",
          submissionId: randomUUID(),
          size,
          slides,
        },
      },
    });
    const count = async () =>
      (
        await db
          .select({ id: socialDraftsTable.id })
          .from(socialDraftsTable)
          .where(eq(socialDraftsTable.tenantId, tenantId))
      ).length;
    const before = await count();
    const story = await post(carousel("story"));
    expect(story.status).toBe(409);
    expect(story.body.error).toBe(
      "This look has no Story size, so it can't draw this carousel at Story. Pick a look that comes in Story, or another size.",
    );
    // Nothing was queued in another look's place.
    expect(await count()).toBe(before);
    // The same look at a size it has draws with that look, not another.
    const portrait = await post(carousel("portrait"));
    expect(portrait.status).toBe(201);
    expect(portrait.body.templateRef).toEqual({ libraryTemplateId: lib.noStory, version: 1 });
    expect(portrait.body.adjustments.pages.fixture.layers[0].id).toBe("t20-fixture");
  });

  it("the composer's assembly preview refuses it too, given the size", async () => {
    const body = {
      setType: "matchDay",
      pages: ["fixture"],
      templateRef: { libraryTemplateId: lib.noStory, version: 1 },
    };
    const send = (extra: object) =>
      request(app)
        .post("/api/template-library/carousel-assembly")
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantId))
        .send({ ...body, ...extra });
    const story = await send({ size: "story" });
    expect(story.status).toBe(409);
    expect(story.body.error).toMatch(/^This look has no Story size/);
    const portrait = await send({ size: "portrait" });
    expect(portrait.status).toBe(200);
    expect(portrait.body.templateRef).toEqual({ libraryTemplateId: lib.noStory, version: 1 });
    expect((await send({ size: "banner" })).status).toBe(400);
  });

  it("a version 1 carousel still saves with its pack", async () => {
    const res = await post({
      caption: "Pack set",
      packId: "club-kit-v1",
      cardInput: {
        kind: "matchDay",
        weekendCarousel: {
          version: 1,
          packId: "club-kit-v1",
          submissionId: randomUUID(),
          size: "square",
          slides,
        },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.packId).toBe("club-kit-v1");
    expect(res.body.templateRef).toBeNull();
  });
});
