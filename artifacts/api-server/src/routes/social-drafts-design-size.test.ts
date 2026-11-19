/**
 * Portrait and Story sizes plan, Stage 2 ("Save the size", round 7): a draft
 * remembers the size it is designed at. Create saves `designSize`, PATCH saves
 * it at the top level (not inside the design), revisions record and restore
 * it, and an older size (Square, Landscape) is refused unless the draft's
 * design already has it. Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  socialDraftsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { documentCoverage } from "../lib/template-library/coverage";
import { listDraftRevisions } from "../lib/draft-revisions";

const STAMP = Date.now();
const LOOK = `dsz-${STAMP}`;
let tenantId: number;
let adminId: number;
let cookie: string;
const lib: Record<string, number> = {};

const box = { x: 5, y: 5, w: 90, h: 20 };
/** A new design's layer: Portrait and Story only. */
const newShape = (id: string) => ({
  id,
  kind: "shape",
  sizes: ["portrait", "story"],
  geometry: { portrait: box, story: box },
});
/** An older design's layer: on every size. */
const allShape = (id: string) => ({
  id,
  kind: "shape",
  geometry: { square: box, portrait: box, story: box, landscape: box },
});

async function libraryTemplate(name: string, kind: string, document: unknown): Promise<number> {
  const [look] = await db
    .insert(templateLooksTable)
    .values({ slug: LOOK, name: LOOK, origin: "bundle" })
    .onConflictDoUpdate({ target: templateLooksTable.slug, set: { name: LOOK } })
    .returning();
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      slug: `${LOOK}/${name}`,
      lookId: look!.id,
      kind,
      name: `${name} (test)`,
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
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-design-size";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `dsz-${STAMP}`,
      centralClubId: 4_100_000 + (STAMP % 100_000),
      name: "Size Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  const [a] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `dsz_${STAMP}`, displayName: "Sizer", passwordHash: "x" })
    .returning();
  adminId = a!.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  lib.fourSize = await libraryTemplate("four-size", "milestone", placeholderDocument("milestone"));
  lib.portraitStory = await libraryTemplate("portrait-story", "milestone", {
    layers: [newShape("ps-1")],
  });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db
    .delete(libraryTemplatesTable)
    .where(inArray(libraryTemplatesTable.id, Object.values(lib)));
  await db.delete(templateLooksTable).where(eq(templateLooksTable.slug, LOOK));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const send = (method: "post" | "patch" | "get", path: string, body?: object) => {
  const agent = request(app);
  const r = agent[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));
  return body ? r.send(body) : r;
};

const milestone = { kind: "milestone", playerName: "Sam", value: 100 };

/** A templated draft whose design has Portrait and Story layers only (a new design). */
async function newDesignDraft(designSize: "portrait" | "story" = "story") {
  const res = await send("post", "/social-drafts", {
    cardInput: milestone,
    templateRef: { libraryTemplateId: lib.portraitStory, version: 1 },
    designSize,
  });
  expect(res.status).toBe(201);
  return res.body as { id: number; designSize: string | null };
}

describe("Create saves the size the design is started at", () => {
  it("saves designSize, and reads it back on the draft and in the queue list", async () => {
    const res = await send("post", "/social-drafts", {
      cardInput: milestone,
      templateRef: { libraryTemplateId: lib.fourSize, version: 1 },
      designSize: "story",
    });
    expect(res.status).toBe(201);
    expect(res.body.designSize).toBe("story");
    const [row] = await db
      .select({ designSize: socialDraftsTable.designSize })
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, res.body.id));
    expect(row!.designSize).toBe("story");
    const one = await send("get", `/social-drafts/${res.body.id}`);
    expect(one.body.designSize).toBe("story");
  });

  it("leaves it null when Create names no size (an older client), as drafts were before", async () => {
    const res = await send("post", "/social-drafts", {
      cardInput: { kind: "announcement", title: "Hello" },
      packId: "blank",
    });
    expect(res.status).toBe(201);
    expect(res.body.designSize).toBeNull();
  });

  it("starts a blank design or a four-size template at an older size (its design has it)", async () => {
    const blank = await send("post", "/social-drafts", {
      cardInput: { kind: "announcement", title: "Hello" },
      packId: "blank",
      designSize: "landscape",
    });
    expect(blank.status).toBe(201);
    expect(blank.body.designSize).toBe("landscape");
    const four = await send("post", "/social-drafts", {
      cardInput: milestone,
      templateRef: { libraryTemplateId: lib.fourSize, version: 1 },
      designSize: "square",
    });
    expect(four.status).toBe(201);
    expect(four.body.designSize).toBe("square");
  });

  it("refuses an older size for a design that has no layers on it", async () => {
    for (const size of ["square", "landscape"]) {
      const res = await send("post", "/social-drafts", {
        cardInput: milestone,
        templateRef: { libraryTemplateId: lib.portraitStory, version: 1 },
        designSize: size,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/older size/);
    }
  });

  it("refuses a size that isn't a card size", async () => {
    const res = await send("post", "/social-drafts", {
      cardInput: milestone,
      packId: "blank",
      designSize: "banner",
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH saves Format at the top level", () => {
  it("saves a Format change alone without recording an edit or touching the design", async () => {
    const draft = await newDesignDraft("portrait");
    const [before] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, draft.id));
    const res = await send("patch", `/social-drafts/${draft.id}`, { designSize: "story" });
    expect(res.status).toBe(200);
    expect(res.body.designSize).toBe("story");
    const [after] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, draft.id));
    expect(after!.designSize).toBe("story");
    // The size is not part of the design, and switching it is not an edit.
    expect(after!.adjustments).toEqual(before!.adjustments);
    expect(after!.adjustments).not.toHaveProperty("designSize");
    expect(after!.designEditedAt).toEqual(before!.designEditedAt);
    expect(after!.layoutCheckPending).toBe(before!.layoutCheckPending);
    expect(await listDraftRevisions(tenantId, draft.id)).toHaveLength(0);
  });

  it("keeps a designSize sent inside adjustments out of the column (top level only)", async () => {
    const draft = await newDesignDraft("portrait");
    const res = await send("patch", `/social-drafts/${draft.id}`, {
      adjustments: { layers: [newShape("ps-2")], designSize: "story" },
    });
    expect(res.status).toBe(200);
    expect(res.body.designSize).toBe("portrait");
  });

  it("saves it with a design edit in the same request", async () => {
    const draft = await newDesignDraft("portrait");
    const res = await send("patch", `/social-drafts/${draft.id}`, {
      adjustments: { layers: [newShape("ps-3")] },
      designSize: "story",
    });
    expect(res.status).toBe(200);
    expect(res.body.designSize).toBe("story");
    expect(res.body.adjustments).toEqual({ layers: [newShape("ps-3")] });
  });

  it("a new design can't save Square or Landscape", async () => {
    const draft = await newDesignDraft("story");
    for (const size of ["square", "landscape"]) {
      const res = await send("patch", `/social-drafts/${draft.id}`, { designSize: size });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        `${size === "square" ? "Square" : "Landscape"} is an older size this design doesn't have. Design it at Portrait or Story.`,
      );
    }
    const [row] = await db
      .select({ designSize: socialDraftsTable.designSize })
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, draft.id));
    expect(row!.designSize).toBe("story");
  });

  it("a landscape draft (its design has landscape layers) can save Landscape and Square", async () => {
    const res = await send("post", "/social-drafts", {
      cardInput: milestone,
      templateRef: { libraryTemplateId: lib.fourSize, version: 1 },
    });
    const id = res.body.id as number;
    const landscape = await send("patch", `/social-drafts/${id}`, { designSize: "landscape" });
    expect(landscape.status).toBe(200);
    expect(landscape.body.designSize).toBe("landscape");
    const square = await send("patch", `/social-drafts/${id}`, { designSize: "square" });
    expect(square.status).toBe(200);
    expect(square.body.designSize).toBe("square");
  });

  it("a pack-based draft (before the template library) can save every size", async () => {
    const res = await send("post", "/social-drafts", {
      cardInput: { kind: "announcement", title: "Old style" },
      packId: "club-kit-v1",
    });
    expect(res.status).toBe(201);
    for (const size of ["square", "landscape", "portrait", "story"]) {
      const saved = await send("patch", `/social-drafts/${res.body.id}`, { designSize: size });
      expect(saved.status).toBe(200);
      expect(saved.body.designSize).toBe(size);
    }
  });

  it("judges an older size against the design as the same request leaves it", async () => {
    const draft = await newDesignDraft("story");
    const res = await send("patch", `/social-drafts/${draft.id}`, {
      adjustments: { layers: [allShape("all-1")] },
      designSize: "square",
    });
    expect(res.status).toBe(200);
    expect(res.body.designSize).toBe("square");
  });
});

describe("Revisions record the size and restore it", () => {
  it("restores the size a revision was taken at", async () => {
    const draft = await newDesignDraft("story");
    // An edit records a revision of the Story design, then moves it to Portrait.
    const edited = await send("patch", `/social-drafts/${draft.id}`, {
      adjustments: { layers: [newShape("ps-4")] },
      designSize: "portrait",
    });
    expect(edited.body.designSize).toBe("portrait");
    const revs = await listDraftRevisions(tenantId, draft.id);
    expect(revs).toHaveLength(1);
    expect(revs[0]!.designSize).toBe("story");
    const listed = await send("get", `/social-drafts/${draft.id}/revisions`);
    expect(listed.body[0].designSize).toBe("story");
    const reverted = await send(
      "post",
      `/social-drafts/${draft.id}/revisions/${revs[0]!.id}/revert`,
    );
    expect(reverted.status).toBe(200);
    expect(reverted.body.designSize).toBe("story");
    // The revert itself recorded the Portrait state, so it can be undone.
    const after = await listDraftRevisions(tenantId, draft.id);
    expect(after[0]!.reason).toBe("revert");
    expect(after[0]!.designSize).toBe("portrait");
  });

  it("an older revision with no size restores as null (the draft opens at Square, as then)", async () => {
    const res = await send("post", "/social-drafts", {
      cardInput: milestone,
      templateRef: { libraryTemplateId: lib.fourSize, version: 1 },
    });
    const id = res.body.id as number;
    // A caption edit records a revision of the draft before any size was saved.
    await send("patch", `/social-drafts/${id}`, { caption: "First" });
    await send("patch", `/social-drafts/${id}`, { designSize: "story" });
    const revs = await listDraftRevisions(tenantId, id);
    expect(revs).toHaveLength(1);
    expect(revs[0]!.designSize).toBeNull();
    const reverted = await send("post", `/social-drafts/${id}/revisions/${revs[0]!.id}/revert`);
    expect(reverted.body.designSize).toBeNull();
  });
});
