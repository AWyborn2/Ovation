/**
 * A carousel set draft's set design (carousel set editor plan, part 3): load
 * one for a queued carousel and a Round Team Lists draft, then reorder,
 * delete, add design pages, switch look and change size. Real-DB integration
 * test (needs DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
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
import {
  assembleSetDocument,
  setTemplateKind,
  type DataSetType,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { documentCoverage } from "../lib/template-library/coverage";

const STAMP = Date.now();
const LOOKS = [`sd-${STAMP}-a`, `sd-${STAMP}-b`];
let tenantId: number;
let otherTenantId: number;
let adminId: number;
let cookie: string;
const lib: Record<string, number> = {};

const box = { x: 5, y: 5, w: 90, h: 20 };
const shape = (id: string) => ({
  id,
  kind: "shape" as const,
  geometry: { square: box, portrait: box, story: box, landscape: box },
});
const kindDoc = (pages: string[], tag: string) => ({
  formatVersion: 2,
  pages: Object.fromEntries(pages.map((p) => [p, { layers: [shape(`${tag}-${p}`)] }])),
});
const DOCS = (tag: string): Record<string, unknown> => ({
  matchDay: kindDoc(["fixture", "title", "sponsors"], `${tag}-md`),
  teamList: kindDoc(["team"], `${tag}-tl`),
  teamListRound: kindDoc(["card"], `${tag}-tlr`),
});

async function libraryTemplate(look: string, kind: string, document: unknown): Promise<number> {
  const [l] = await db
    .insert(templateLooksTable)
    .values({ slug: look, name: look, origin: "bundle" })
    .onConflictDoUpdate({ target: templateLooksTable.slug, set: { name: look } })
    .returning();
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      slug: `${look}/${kind}`,
      lookId: l!.id,
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

const setOf = (type: DataSetType, tag: string): SetDocument =>
  assembleSetDocument(type, (k) => DOCS(tag)[k])!.document;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-set-designs";
  const tenants = await db
    .insert(tenantsTable)
    .values(
      [0, 1].map((n) => ({
        slug: `sd-${STAMP}-${n}`,
        centralClubId: 4_100_000 + (STAMP % 100_000) + n,
        name: `Set Club ${n}`,
        plan: "pro",
      })),
    )
    .returning();
  tenantId = tenants[0]!.id;
  otherTenantId = tenants[1]!.id;
  const [a] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `sd_${STAMP}`, displayName: "SD", passwordHash: "x" })
    .returning();
  adminId = a!.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  for (const [i, look] of LOOKS.entries()) {
    const tag = `l${i}`;
    for (const [kind, doc] of Object.entries(DOCS(tag)))
      lib[`${tag}:${kind}`] = await libraryTemplate(look, kind, doc);
    for (const type of ["matchDay", "teamLists"] as const)
      lib[`${tag}:set:${type}`] = await libraryTemplate(
        look,
        setTemplateKind(type),
        setOf(type, tag),
      );
  }
});

afterAll(async () => {
  await db
    .delete(socialDraftsTable)
    .where(inArray(socialDraftsTable.tenantId, [tenantId, otherTenantId]));
  await db
    .delete(cardTemplatesTable)
    .where(inArray(cardTemplatesTable.tenantId, [tenantId, otherTenantId]));
  await db
    .delete(libraryTemplatesTable)
    .where(inArray(libraryTemplatesTable.id, Object.values(lib)));
  await db.delete(templateLooksTable).where(inArray(templateLooksTable.slug, LOOKS));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

const api = (method: "get" | "put" | "post", path: string, tenant = tenantId) =>
  request(app)[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenant));

/** A frozen-input slide (saved before its kind moved onto content). */
const slide = (id: string, input: Record<string, unknown>, junior = false) => ({
  id,
  label: id,
  junior,
  sponsorsOn: false,
  warnings: [],
  input: { ...input, ...(junior && !input.carouselPage ? { junior: true } : {}) },
  data: {},
});
const bookend = (page: "title" | "sponsors") =>
  slide(page, { kind: "matchDay", carouselPage: { page, title: "This weekend", sponsors: [] } });

async function queuedCarousel(
  slides = [
    bookend("title"),
    slide("fx-1", { kind: "matchDay", grade: "A Grade" }),
    slide("fx-2", { kind: "matchDay", grade: "B Grade" }),
    bookend("sponsors"),
  ],
) {
  const res = await api("post", "/social-drafts").send({
    caption: "This weekend",
    cardInput: {
      kind: "matchDay",
      weekendCarousel: {
        version: 3,
        templateRef: { libraryTemplateId: lib["l0:matchDay"], version: 1 },
        setType: "matchDay",
        submissionId: randomUUID(),
        size: "square",
        slides,
      },
    },
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("a queued carousel's set design", () => {
  it("is assembled from the carousel's own design until it is saved", async () => {
    const id = await queuedCarousel();
    const res = await api("get", `/social-drafts/${id}/set-design`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      draftId: id,
      setType: "matchDay",
      layout: "carousel",
      size: "square",
      stored: false,
    });
    const doc = res.body.document as SetDocument;
    expect(doc.pages.map((p) => p.id)).toEqual(["cover", "fixture", "sponsors"]);
    // Exactly the carousel's own pages.
    expect(doc.pages[1]!.layers).toEqual([shape("l0-md-fixture")]);
  });

  it("saves reordered and deleted slides, a design page, and a new size", async () => {
    const id = await queuedCarousel();
    const { body } = await api("get", `/social-drafts/${id}/set-design`);
    const doc = body.document as SetDocument;
    const edited: SetDocument = {
      ...doc,
      pages: [
        ...doc.pages,
        {
          id: "extra",
          role: "fixed",
          slot: "page",
          kind: "matchDay",
          page: "title",
          name: "Thanks",
          layers: [shape("x")],
        },
      ],
      arrangement: { order: ["fx-2", "title", "page:extra", "fx-1"], removed: ["sponsors"] },
    };
    const res = await api("put", `/social-drafts/${id}/set-design`).send({
      document: edited,
      size: "portrait",
    });
    expect(res.status).toBe(200);
    const wc = res.body.cardInput.weekendCarousel;
    expect(wc.size).toBe("portrait");
    expect(wc.slides.map((s: { id: string }) => s.id)).toEqual([
      "fx-2",
      "title",
      "page:extra",
      "fx-1",
    ]);
    expect(wc.slides[2]).toMatchObject({ pageId: "extra", input: { kind: "matchDay" }, data: {} });
    expect(readQueuedCarousel(res.body.cardInput)).not.toBeNull();
    // The payload holds the order; the design keeps its pages.
    expect(res.body.adjustments.arrangement).toBeUndefined();
    expect(res.body.adjustments.set).toBe("matchDay");
    expect(res.body.layoutCheckPending).toBe(true);
    const again = await api("get", `/social-drafts/${id}/set-design`);
    expect(again.body.stored).toBe(true);
    expect(again.body.size).toBe("portrait");
  });

  it("switches to another look's set template, keeping the data", async () => {
    const id = await queuedCarousel();
    const other = setOf("matchDay", "l1");
    const res = await api("put", `/social-drafts/${id}/set-design`).send({
      document: other,
      templateRef: { libraryTemplateId: lib["l1:set:matchDay"], version: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.body.templateRef).toEqual({
      libraryTemplateId: lib["l1:set:matchDay"],
      version: 1,
    });
    expect(res.body.cardInput.weekendCarousel.templateRef).toEqual(res.body.templateRef);
    expect(res.body.cardInput.weekendCarousel.slides).toHaveLength(4);
    expect(res.body.adjustments.pages[1].layers).toEqual([shape("l1-md-fixture")]);
  });

  it("keeps a junior set junior: a design page added to it is junior (C4)", async () => {
    const juniorSlides = [
      bookend("title"),
      slide("jr-1", { kind: "matchDay", grade: "Under 13" }, true),
      bookend("sponsors"),
    ].map((s) => ({ ...s, junior: true, input: { ...s.input, junior: true } }));
    const id = await queuedCarousel(juniorSlides);
    const { body } = await api("get", `/social-drafts/${id}/set-design`);
    const doc = body.document as SetDocument;
    const res = await api("put", `/social-drafts/${id}/set-design`).send({
      document: {
        ...doc,
        pages: [
          ...doc.pages,
          {
            id: "p",
            role: "fixed",
            slot: "page",
            kind: "matchDay",
            page: "title",
            layers: [shape("y")],
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    const slides = res.body.cardInput.weekendCarousel.slides as Array<{ junior: boolean }>;
    expect(slides.every((s) => s.junior)).toBe(true);
  });

  it("refuses a document that isn't a valid set, or a template that isn't a set", async () => {
    const id = await queuedCarousel();
    const bad = await api("put", `/social-drafts/${id}/set-design`).send({
      document: { formatVersion: 2, set: "matchDay", pages: [] },
    });
    expect(bad.status).toBe(400);
    const { body } = await api("get", `/social-drafts/${id}/set-design`);
    const wrong = await api("put", `/social-drafts/${id}/set-design`).send({
      document: body.document,
      templateRef: { libraryTemplateId: lib["l1:matchDay"], version: 1 },
    });
    expect(wrong.status).toBe(400);
  });

  it("is another club's draft: not found, and not saved", async () => {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: otherTenantId,
        engine: "teamlists-round",
        status: "awaiting_review",
        cardInput: { kind: "teamListRound", roundLabel: "R1", date: "", teams: [] },
        appPath: "/fixtures",
      })
      .returning();
    expect((await api("get", `/social-drafts/${row!.id}/set-design`)).status).toBe(404);
    const put = await api("put", `/social-drafts/${row!.id}/set-design`).send({
      document: setOf("teamLists", "l0"),
    });
    expect(put.status).toBe(404);
    // A session can't reach another club by naming it.
    expect((await api("get", `/social-drafts/${row!.id}/set-design`, otherTenantId)).status).toBe(
      401,
    );
  });
});

describe("a Round Team Lists draft's set design", () => {
  async function roundDraft(junior = false) {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "teamlists-round",
        status: "awaiting_review",
        cardInput: {
          kind: "teamListRound",
          roundLabel: "Round 5",
          date: "Sat 14 Feb",
          ...(junior ? { junior: true } : {}),
          teams: ["A Grade", "B Grade"].map((grade) => ({
            grade,
            players: [{ surname: "Smith", order: 1 }],
          })),
        },
        appPath: "/fixtures",
        sourceKey: `teamlists-round:${randomUUID()}`,
        packId: "blank",
        adjustments: DOCS("own").teamListRound,
        templateVersion: 1,
        templateRef: { libraryTemplateId: lib["l0:teamListRound"], version: 1 },
      })
      .returning();
    return row!.id;
  }

  it("keeps the draft's own cover and takes the look's team and sponsors pages", async () => {
    const id = await roundDraft();
    const res = await api("get", `/social-drafts/${id}/set-design`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ setType: "teamLists", layout: "list", size: null });
    const doc = res.body.document as SetDocument;
    expect(doc.pages.map((p) => [p.id, p.kind, p.page])).toEqual([
      ["cover", "teamListRound", "card"],
      ["team", "teamList", "team"],
      ["sponsors", "matchDay", "sponsors"],
    ]);
    expect(doc.pages[0]!.layers).toEqual([shape("own-tlr-card")]);
    expect(doc.pages[1]!.layers).toEqual([shape("l0-tl-team")]);
  });

  it("saves its slide order and deletions in the design", async () => {
    const id = await roundDraft();
    const { body } = await api("get", `/social-drafts/${id}/set-design`);
    const arrangement = {
      order: ["detail:senior:B Grade", "page:cover", "detail:senior:A Grade"],
      removed: ["page:sponsors"],
    };
    const res = await api("put", `/social-drafts/${id}/set-design`).send({
      document: { ...body.document, arrangement },
    });
    expect(res.status).toBe(200);
    expect(res.body.adjustments.arrangement).toEqual(arrangement);
    expect(res.body.packId).toBe("blank");
    // The data is untouched.
    expect(res.body.cardInput.teams).toHaveLength(2);
  });

  it("isn't offered for a card that isn't a set", async () => {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "adhoc",
        status: "awaiting_review",
        cardInput: { kind: "milestone", playerName: "Sam" },
        appPath: "/",
      })
      .returning();
    expect((await api("get", `/social-drafts/${row!.id}/set-design`)).status).toBe(409);
  });
});

describe("applying a Match Day template to waiting drafts", () => {
  it("leaves queued carousels and their set designs alone", async () => {
    const id = await queuedCarousel();
    const { body } = await api("get", `/social-drafts/${id}/set-design`);
    await api("put", `/social-drafts/${id}/set-design`).send({ document: body.document });
    const before = (await api("get", `/social-drafts/${id}`)).body.adjustments;
    const copy = await api("post", "/club-templates").send({
      libraryTemplateId: lib["l1:matchDay"],
      version: 1,
    });
    expect(copy.status).toBe(201);
    const applied = await api("post", `/club-templates/${copy.body.id}/apply`).send({
      version: copy.body.version,
    });
    expect(applied.status).toBe(200);
    expect((await api("get", `/social-drafts/${id}`)).body.adjustments).toEqual(before);
  });
});

describe("making a carousel set from one template (part 4)", () => {
  it("puts a Team List design on the team page of its look's set, as the club's own", async () => {
    const res = await api("post", "/club-templates/sets").send({
      setType: "teamLists",
      from: { libraryTemplateId: lib["l1:teamList"], version: 1 },
      name: "Our team lists",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: "set:teamLists",
      name: "Our team lists",
      isDefault: false,
      edited: true,
    });
    const doc = res.body.document as SetDocument;
    expect(doc.pages.map((p) => p.layers[0]!.id)).toEqual([
      "l1-tlr-card",
      "l1-tl-team",
      "l1-md-sponsors",
    ]);
    // It's in the club's designs (asked for with sets), not among its card templates.
    const all = await api("get", "/club-templates?includeSets=true");
    expect(all.body.templates.map((t: { id: number }) => t.id)).toContain(res.body.id);
    const cards = await api("get", "/club-templates");
    expect(cards.body.templates.map((t: { id: number }) => t.id)).not.toContain(res.body.id);
  });

  it("makes a free set from any card template, and refuses a free set from nothing", async () => {
    const free = await api("post", "/club-templates/sets").send({
      setType: "free",
      from: { libraryTemplateId: lib["l0:matchDay"], version: 1 },
    });
    expect(free.status).toBe(201);
    expect((free.body.document as SetDocument).pages).toHaveLength(3);
    expect(free.body.name).toBe("Free set");
    const none = await api("post", "/club-templates/sets").send({ setType: "free" });
    expect(none.status).toBe(400);
  });

  it("takes a look's set as it is, an unedited copy that follows the look", async () => {
    const [look] = await db
      .select({ id: templateLooksTable.id })
      .from(templateLooksTable)
      .where(eq(templateLooksTable.slug, LOOKS[1]!));
    const res = await api("post", "/club-templates/sets").send({
      setType: "matchDay",
      lookId: look!.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.edited).toBe(false);
    expect(res.body.basedOn).toMatchObject({ templateId: lib["l1:set:matchDay"] });
  });

  it("won't start a set from a set", async () => {
    const res = await api("post", "/club-templates/sets").send({
      setType: "matchDay",
      from: { libraryTemplateId: lib["l0:set:matchDay"], version: 1 },
    });
    expect(res.status).toBe(400);
  });
});
