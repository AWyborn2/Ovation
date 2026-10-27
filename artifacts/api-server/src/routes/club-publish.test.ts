/**
 * Clubs publishing templates (template library release 2, ADR-012, R2-B):
 * the blank canvas, the publish preview, publish and re-publish with the fit
 * check listing a pass, author unlisting, browse credit, "used by" and the
 * tag filter, and isolation between clubs.
 * Real-DB integration test (needs DATABASE_URL). The fit job is a stub runner.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  sponsorsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { v2Document } from "../lib/template-library/bundles.test-helpers";
import { registerFitRunner, writeFitResult, type FitTarget } from "../lib/template-library/fit";

const STAMP = Date.now();
const CLUB = `Publishers ${STAMP} Cricket Club`;
const SHORT = `Publishers ${STAMP}`;
const SPONSOR = `Acme Widgets ${STAMP}`;
const LOGO = `/api/storage/objects/uploads/crest-${STAMP}.png`;
const SPONSOR_LOGO = `https://cdn.example.com/sponsor-${STAMP}.png`;
const PHOTO = `/api/storage/objects/uploads/photo-${STAMP}.jpg`;

let authorId: number;
let otherId: number;
const adminIds: number[] = [];
let authorCookie: string;
let otherCookie: string;

// The fit job's stand-in: each new version gets `verdict` (null leaves it pending).
let verdict: "pass" | "fail" | null = "pass";
const writes: Promise<void>[] = [];
const settle = async () => {
  await Promise.all(writes.splice(0));
};

async function makeAdmin(tenant: number, name: string): Promise<string> {
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId: tenant, username: `${name}_${STAMP}`, displayName: name, passwordHash: "x" })
    .returning();
  adminIds.push(admin!.id);
  return `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-club-publish";
  registerFitRunner((target: FitTarget) => {
    if (!verdict) return;
    const status = verdict;
    writes.push(
      writeFitResult(target, {
        status,
        report: { kind: "test", status, variants: 4, issues: status === "fail" ? [{}] : [] },
      }),
    );
  });
  const [a] = await db
    .insert(tenantsTable)
    .values({
      slug: `pub-a-${STAMP}`,
      centralClubId: 3_400_000 + (STAMP % 100_000) * 2,
      name: CLUB,
      plan: "pro",
      logoUrl: LOGO,
      primaryColour: "#F5B400",
      backgroundColour: "#0B2A4A",
    })
    .returning();
  const [b] = await db
    .insert(tenantsTable)
    .values({
      slug: `pub-b-${STAMP}`,
      centralClubId: 3_400_001 + (STAMP % 100_000) * 2,
      name: `Borrowers ${STAMP}`,
      plan: "pro",
    })
    .returning();
  authorId = a!.id;
  otherId = b!.id;
  await db.insert(sponsorsTable).values({ tenantId: authorId, name: SPONSOR, logoUrl: SPONSOR_LOGO });
  authorCookie = await makeAdmin(authorId, "PubAuthor");
  otherCookie = await makeAdmin(otherId, "PubOther");
});

beforeEach(() => {
  verdict = "pass";
});

afterAll(async () => {
  registerFitRunner(null);
  const tenants = [authorId, otherId];
  const ids = (
    await db
      .select({ id: libraryTemplatesTable.id })
      .from(libraryTemplatesTable)
      .where(inArray(libraryTemplatesTable.authorTenantId, tenants))
  ).map((r) => r.id);
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  if (ids.length) {
    await db
      .delete(libraryTemplateVersionsTable)
      .where(inArray(libraryTemplateVersionsTable.templateId, ids));
    await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, ids));
  }
  await db.delete(sponsorsTable).where(inArray(sponsorsTable.tenantId, tenants));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const as = (c: string, tenant: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
  put: (p: string, body: object) =>
    request(app).put(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
});
const author = () => as(authorCookie, authorId);
const other = () => as(otherCookie, otherId);

const square = (x: number, y: number, w: number, h: number) => ({ square: { x, y, w, h } });

/** A milestone design holding the club's crest, a sponsor's logo, a photo and some text. */
function clubDesign(opts: { text?: string; background?: string; bigPhoto?: boolean } = {}) {
  const doc = v2Document("milestone") as {
    formatVersion: 2;
    pages: { card: { layers: unknown[]; background?: string } };
  };
  doc.pages.card.layers.push(
    { id: "crest", kind: "image", content: LOGO, geometry: square(80, 2, 16, 16) },
    { id: "sponsor", kind: "image", content: SPONSOR_LOGO, geometry: square(2, 88, 20, 10) },
    {
      id: "hero",
      kind: "image",
      content: PHOTO,
      geometry: opts.bigPhoto ? square(0, 0, 100, 60) : square(40, 40, 20, 20),
    },
    {
      id: "strap",
      kind: "text",
      content: opts.text ?? `Proudly ${SHORT}, with thanks to ${SPONSOR}`,
      style: { fontSize: 4, color: "#F5B400" },
      geometry: square(6, 90, 88, 6),
    },
  );
  if (opts.background) doc.pages.card.background = opts.background;
  return doc;
}

async function blankWith(document: unknown, name = `Design ${STAMP}`): Promise<number> {
  const blank = await author().post("/club-templates/blank", { kind: "milestone", name });
  expect(blank.status).toBe(201);
  const saved = await author().put(`/club-templates/${blank.body.id}`, {
    baseVersion: blank.body.version,
    document,
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  return blank.body.id as number;
}

const publish = (id: number, body: Record<string, unknown> = {}) =>
  author().post(`/club-templates/${id}/publish`, {
    name: `Shared ${STAMP}`,
    tags: [],
    rightsConfirmed: true,
    ...body,
  });

describe("a blank canvas", () => {
  it("is a private template with the kind's pages and no layers", async () => {
    const res = await author().post("/club-templates/blank", { kind: "matchDay" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: "matchDay", isDefault: false, basedOn: null });
    expect(res.body.document).toEqual({
      formatVersion: 2,
      pages: {
        fixture: { layers: [] },
        title: { layers: [] },
        day: { layers: [] },
        sponsors: { layers: [] },
      },
    });
    const [row] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, res.body.id));
    expect(row).toMatchObject({
      tenantId: authorId,
      source: "kind",
      originTemplateId: null,
      isKindDefault: false,
    });
    // Other clubs never see it.
    expect((await other().get(`/club-templates/${res.body.id}`)).status).toBe(404);
  });

  it("refuses a kind templates don't cover", async () => {
    expect((await author().post("/club-templates/blank", { kind: "nope" })).status).toBe(400);
  });
});

describe("publishing", () => {
  let copyId: number;
  let libraryId: number;

  it("previews what other clubs get, flagging text that names the club or a sponsor", async () => {
    copyId = await blankWith(clubDesign());
    const res = await author().get(`/club-templates/${copyId}/publish-preview`);
    expect(res.status).toBe(200);
    const whats = res.body.changes.map((c: { layerId: string; what: string }) => `${c.layerId}:${c.what}`);
    expect(whats).toEqual(
      expect.arrayContaining(["crest:clubLogo", "sponsor:sponsorLogo", "hero:photo", "strap:clubColour"]),
    );
    expect(res.body.flags).toEqual(
      expect.arrayContaining([
        { page: "card", layerId: "strap", kind: "clubName", text: SHORT },
        { page: "card", layerId: "strap", kind: "sponsorName", text: SPONSOR },
      ]),
    );
    expect(res.body.assetErrors).toEqual([]);
    expect(res.body.published).toBeNull();
    expect(res.body.tagChecks.find((c: { tag: string }) => c.tag === "photo-led")).toMatchObject({
      ok: false,
    });
  });

  it("needs the rights confirmed", async () => {
    expect((await publish(copyId, { rightsConfirmed: false })).status).toBe(400);
  });

  it("is blocked while text names the club or a sponsor", async () => {
    const res = await publish(copyId);
    expect(res.status).toBe(422);
    expect(res.body.flags.length).toBeGreaterThanOrEqual(2);
    expect(res.body.assetErrors).toEqual([]);
  });

  it("refuses a style tag the design doesn't match", async () => {
    const [row] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, copyId));
    const fixed = await author().put(`/club-templates/${copyId}`, {
      baseVersion: row!.version,
      document: clubDesign({ text: "{{clubName}} salutes you" }),
    });
    expect(fixed.status).toBe(200);
    const res = await publish(copyId, { tags: ["dark"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dark/);
  });

  it("creates a club library template, pending until the fit check passes", async () => {
    verdict = null;
    const res = await publish(copyId, { tags: ["bold-type"] });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body).toMatchObject({ version: 1, fitStatus: "pending", listed: false });
    libraryId = res.body.libraryTemplateId;
    const [t] = await db
      .select()
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.id, libraryId));
    expect(t).toMatchObject({ origin: "club", authorTenantId: authorId, tags: ["bold-type"] });
    const [v] = await db
      .select()
      .from(libraryTemplateVersionsTable)
      .where(eq(libraryTemplateVersionsTable.templateId, libraryId));
    expect(v).toMatchObject({ publishedByTenantId: authorId, fitStatus: "pending" });
    expect(v!.rightsConfirmedByAdminId).toBe(adminIds[0]);
    expect(v!.rightsConfirmedAt).toBeInstanceOf(Date);
    const [copy] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, copyId));
    expect(copy!.publishedTemplateId).toBe(libraryId);
    // Not in the library yet.
    const browse = await other().get("/template-library?kind=milestone");
    expect(browse.body.templates.map((x: { id: number }) => x.id)).not.toContain(libraryId);
  });

  it("publishes a document holding nothing of the author's", async () => {
    const [v] = await db
      .select()
      .from(libraryTemplateVersionsTable)
      .where(eq(libraryTemplateVersionsTable.templateId, libraryId));
    const text = JSON.stringify(v!.document);
    for (const own of [LOGO, SPONSOR_LOGO, PHOTO, CLUB, SHORT, SPONSOR, "uploads/"]) {
      expect(text).not.toContain(own);
    }
    expect(text).toContain("{{clubLogo}}");
    expect(text).toContain("{{sponsor1}}");
  });

  it("lists it for every club when the check passes, credited to the author", async () => {
    await writeFitResult(
      { kind: "libraryVersion", templateId: libraryId, version: 1 },
      { status: "pass", report: { kind: "test" } },
    );
    const browse = await other().get("/template-library?kind=milestone");
    const listed = browse.body.templates.find((x: { id: number }) => x.id === libraryId);
    expect(listed).toMatchObject({
      origin: "club",
      authorName: CLUB,
      tags: ["bold-type"],
      usedBy: 0,
      ownedByClub: false,
      listed: true,
    });
    const mine = await author().get("/template-library?kind=milestone");
    expect(mine.body.templates.find((x: { id: number }) => x.id === libraryId)).toMatchObject({
      ownedByClub: true,
    });
  });

  it("filters by tag", async () => {
    const hit = await other().get("/template-library?kind=milestone&tags=bold-type");
    expect(hit.body.templates.map((x: { id: number }) => x.id)).toContain(libraryId);
    const miss = await other().get("/template-library?kind=milestone&tags=bold-type,retro");
    expect(miss.body.templates.map((x: { id: number }) => x.id)).not.toContain(libraryId);
  });

  it("counts other clubs' copies, and offers them a re-publish as an update", async () => {
    const took = await other().post("/club-templates", { libraryTemplateId: libraryId });
    expect(took.status).toBe(201);
    const theirCopy = took.body.id as number;
    // The author's own copy doesn't count.
    await author().post("/club-templates", { libraryTemplateId: libraryId });
    const browse = await other().get("/template-library?kind=milestone");
    expect(browse.body.templates.find((x: { id: number }) => x.id === libraryId).usedBy).toBe(1);

    const again = await publish(copyId, { tags: ["bold-type", "minimal"] });
    expect(again.status).toBe(202);
    expect(again.body).toMatchObject({ libraryTemplateId: libraryId, version: 2 });
    await settle();
    const theirs = await other().get(`/club-templates/${theirCopy}`);
    expect(theirs.body.updateAvailable).toEqual({ version: 2 });
    const preview = await author().get(`/club-templates/${copyId}/publish-preview`);
    expect(preview.body.published).toMatchObject({ id: libraryId, version: 2, listed: true });
  });

  it("lets only the author unlist it; publishing again lists it again", async () => {
    expect((await other().post(`/template-library/${libraryId}/unlist`)).status).toBe(404);
    const res = await author().post(`/template-library/${libraryId}/unlist`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: libraryId, listed: false });
    const gone = await other().get("/template-library?kind=milestone");
    expect(gone.body.templates.map((x: { id: number }) => x.id)).not.toContain(libraryId);
    // Copies keep working.
    expect((await other().get(`/template-library/${libraryId}`)).status).toBe(200);

    await publish(copyId);
    await settle();
    const back = await other().get("/template-library?kind=milestone");
    expect(back.body.templates.map((x: { id: number }) => x.id)).toContain(libraryId);
  });

  it("keeps Ovation's unlisting through the author's unlist and re-publish", async () => {
    await db
      .update(libraryTemplatesTable)
      .set({ listed: false, unlistedBy: "ovation" })
      .where(eq(libraryTemplatesTable.id, libraryId));
    await author().post(`/template-library/${libraryId}/unlist`);
    await publish(copyId);
    await settle();
    const [t] = await db
      .select()
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.id, libraryId));
    expect(t).toMatchObject({ listed: false, unlistedBy: "ovation" });
  });

  it("leaves a version that fails the fit check unlisted", async () => {
    verdict = "fail";
    const id = await blankWith(clubDesign({ text: "Big day" }), `Failing ${STAMP}`);
    const res = await publish(id, { name: `Failing ${STAMP}` });
    expect(res.status).toBe(202);
    await settle();
    const [t] = await db
      .select()
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.id, res.body.libraryTemplateId));
    expect(t!.listed).toBe(false);
  });
});

describe("style tag checks", () => {
  it("photo-led needs a photo over 30% of the page; dark and light follow the background", async () => {
    const id = await blankWith(
      clubDesign({ text: "Big day", background: "#101820", bigPhoto: true }),
      `Tagged ${STAMP}`,
    );
    const res = await author().get(`/club-templates/${id}/publish-preview`);
    const check = (tag: string) =>
      res.body.tagChecks.find((c: { tag: string }) => c.tag === tag).ok as boolean;
    expect(check("photo-led")).toBe(true);
    expect(check("dark")).toBe(true);
    expect(check("light")).toBe(false);
    expect(check("retro")).toBe(true);
  });
});

describe("isolation", () => {
  let id: number;
  beforeAll(async () => {
    id = await blankWith(clubDesign({ text: "Big day" }), `Private ${STAMP}`);
  });

  it("another club can't read, preview or publish a club's private template", async () => {
    expect((await other().get(`/club-templates/${id}`)).status).toBe(404);
    expect((await other().get(`/club-templates/${id}/publish-preview`)).status).toBe(404);
    const res = await other().post(`/club-templates/${id}/publish`, {
      name: "Stolen",
      tags: [],
      rightsConfirmed: true,
    });
    expect(res.status).toBe(404);
    const published = await db
      .select()
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.authorTenantId, otherId));
    expect(published).toEqual([]);
  });

  it("an unedited copy of someone else's template can't be published as your own", async () => {
    const [lib] = await db
      .select({ id: libraryTemplatesTable.id })
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.authorTenantId, authorId))
      .limit(1);
    const [theirs] = await db
      .select({ id: cardTemplatesTable.id })
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.tenantId, otherId));
    expect(lib && theirs).toBeTruthy();
    const res = await other().post(`/club-templates/${theirs!.id}/publish`, {
      name: "Not mine",
      tags: [],
      rightsConfirmed: true,
    });
    expect(res.status).toBe(400);
  });
});
