/**
 * Portrait and Story sizes plan, Stage 4 ("Templates and the library"): KTD15
 * relaxed. A club template needs layers on Portrait and Story, and on any older
 * size (Square, Landscape) the version it replaces had layers on. So a new
 * Portrait and Story template saves, lists and drafts, while an existing
 * four-size template still can't lose Square or Landscape by accident. The
 * library keeps filtering by size, so a four-size template still lists under
 * Portrait and Story. Real-DB integration test (needs DATABASE_URL).
 */
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
import { OFFERED_SIZES, placeholderDocument } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { createDocumentCopy } from "../lib/template-library/copies";
import { documentCoverage } from "../lib/template-library/coverage";

const STAMP = Date.now();
const LOOK = `tsz-${STAMP}`;
const KIND = "milestone";
let tenantId: number;
let adminId: number;
let cookie: string;
const lib: Record<string, number> = {};

type Layer = { id: string; sizes?: string[]; geometry: Record<string, unknown> };
type Doc = { layers: Layer[] };

/** A new design: the kind's placeholder on Portrait and Story only. */
const portraitStory = (): Doc => placeholderDocument(KIND, OFFERED_SIZES) as unknown as Doc;
/** An older design: the kind's placeholder on every size. */
const fourSize = (): Doc => placeholderDocument(KIND) as unknown as Doc;

/** `doc` with every layer taken off `size` (an edit that empties it). */
function without(doc: Doc, size: string): Doc {
  return {
    layers: doc.layers.map((l) => {
      const sizes = (l.sizes ?? ["square", "portrait", "story", "landscape"]).filter(
        (s) => s !== size,
      );
      const geometry = { ...l.geometry };
      delete geometry[size];
      return { ...l, sizes, geometry };
    }),
  };
}

async function libraryTemplate(name: string, document: unknown): Promise<number> {
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
      kind: KIND,
      name: `${name} (test)`,
      origin: "bundle",
      listed: true,
    })
    .returning();
  await db.insert(libraryTemplateVersionsTable).values({
    templateId: t!.id,
    version: 1,
    document,
    coverage: documentCoverage(document, KIND),
    fitStatus: "pass",
  });
  return t!.id;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-template-sizes";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `tsz-${STAMP}`,
      centralClubId: 4_300_000 + (STAMP % 100_000),
      name: "Template Size Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  const [a] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `tsz_${STAMP}`, displayName: "Sizer", passwordHash: "x" })
    .returning();
  adminId = a!.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  lib.fourSize = await libraryTemplate("four-size", fourSize());
  lib.portraitStory = await libraryTemplate("portrait-story", portraitStory());
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

const send = (method: "post" | "put" | "get", path: string, body?: object) => {
  const agent = request(app);
  const r = agent[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));
  return body ? r.send(body) : r;
};

/** The club's copy of a library template, at version 1. */
async function copyOf(libraryTemplateId: number): Promise<{ id: number; version: number }> {
  const res = await send("post", "/club-templates", { libraryTemplateId });
  expect(res.status).toBe(201);
  return res.body as { id: number; version: number };
}

describe("a Portrait and Story template", () => {
  it("saves, lists and drafts", async () => {
    const copy = await copyOf(lib.portraitStory!);
    const edited = portraitStory();
    edited.layers[0]!.geometry.portrait = { x: 10, y: 10, w: 80, h: 12 };
    const saved = await send("put", `/club-templates/${copy.id}`, {
      baseVersion: copy.version,
      document: edited,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.coverage.sizes).toEqual(["portrait", "story"]);

    const listed = await send("get", `/club-templates?kind=${KIND}`);
    expect(listed.status).toBe(200);
    const mine = (listed.body.templates as Array<{ id: number; coverage: { sizes: string[] } }>)
      .filter((t) => t.id === copy.id)
      .map((t) => t.coverage.sizes);
    expect(mine).toEqual([["portrait", "story"]]);

    const draft = await send("post", "/social-drafts", {
      cardInput: { kind: KIND, playerName: "Sam", value: 100 },
      templateRef: { copyId: copy.id, version: saved.body.version },
      designSize: "portrait",
    });
    expect(draft.status).toBe(201);
    expect(draft.body.designSize).toBe("portrait");
  });

  it("is made as a new club copy needing only Portrait and Story", async () => {
    const row = await createDocumentCopy(
      tenantId,
      { kind: KIND, name: "Imported", document: portraitStory() },
      adminId,
    );
    expect(row.adjustments).toEqual(portraitStory());
  });

  it("can't lose Portrait or Story, and the error names the empty size", async () => {
    const copy = await copyOf(lib.portraitStory!);
    const res = await send("put", `/club-templates/${copy.id}`, {
      baseVersion: copy.version,
      document: without(portraitStory(), "story"),
    });
    expect(res.status).toBe(400);
    expect(res.body.emptySizes).toEqual(["story"]);
    expect(res.body.error).toBe("Add at least one element to Story before saving.");
  });
});

describe("an existing four-size template keeps its strictness", () => {
  it("refuses an edit that empties Square", async () => {
    const copy = await copyOf(lib.fourSize!);
    const res = await send("put", `/club-templates/${copy.id}`, {
      baseVersion: copy.version,
      document: without(fourSize(), "square"),
    });
    expect(res.status).toBe(400);
    expect(res.body.emptySizes).toEqual(["square"]);
  });

  it("refuses dropping both older sizes at once, naming both", async () => {
    const copy = await copyOf(lib.fourSize!);
    const res = await send("put", `/club-templates/${copy.id}`, {
      baseVersion: copy.version,
      document: portraitStory(),
    });
    expect(res.status).toBe(400);
    expect(res.body.emptySizes).toEqual(["square", "landscape"]);
    expect(res.body.error).toBe("Add at least one element to Square and Landscape before saving.");
  });

  it("still saves at all four sizes", async () => {
    const copy = await copyOf(lib.fourSize!);
    const res = await send("put", `/club-templates/${copy.id}`, {
      baseVersion: copy.version,
      document: fourSize(),
    });
    expect(res.status).toBe(200);
    expect(res.body.coverage.sizes).toEqual(["square", "portrait", "story", "landscape"]);
  });
});

describe("the library keeps filtering by size", () => {
  const ids = async (size: string) => {
    const res = await send("get", `/template-library?kind=${KIND}&size=${size}&q=${LOOK}`);
    expect(res.status).toBe(200);
    return (res.body.templates as Array<{ id: number }>).map((t) => t.id).sort();
  };

  it("lists a four-size template under Portrait and Story, and only it under Square", async () => {
    const both = [lib.fourSize!, lib.portraitStory!].sort();
    expect(await ids("portrait")).toEqual(both);
    expect(await ids("story")).toEqual(both);
    expect(await ids("square")).toEqual([lib.fourSize]);
    expect(await ids("landscape")).toEqual([lib.fourSize]);
  });
});
