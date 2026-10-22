/**
 * The element library API (editable-elements plan, D1): shared reads, public
 * club saves with the asset policy, author unlisting and club reports.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  libraryElementReportsTable,
  libraryElementsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const LOOK = `el-${STAMP}`;
let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;
let bundleElementId: number;

const box = { x: 0, y: 80, w: 100, h: 12 };
const fragment = (over: Record<string, unknown> = {}) => ({
  formatVersion: 2,
  layers: [
    {
      id: "band",
      kind: "shape",
      geometry: { square: box },
      style: { fill: "var(--gold)" },
      ...over,
    },
  ],
});

async function makeAdmin(tenant: number, name: string): Promise<string> {
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant,
      username: `${name}_${STAMP}`,
      displayName: name,
      passwordHash: "x",
    })
    .returning();
  adminIds.push(admin!.id);
  return `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-library-elements";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `el-lib-${STAMP}`,
      centralClubId: 3_200_000 + (STAMP % 100_000) * 2,
      name: "Element Club",
      plan: "pro",
    })
    .returning();
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `el-lib-other-${STAMP}`,
      centralClubId: 3_200_001 + (STAMP % 100_000) * 2,
      name: "Other Element Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  otherTenantId = o!.id;
  cookie = await makeAdmin(tenantId, "ElEditor");
  otherCookie = await makeAdmin(otherTenantId, "ElOther");
  const [look] = await db
    .insert(templateLooksTable)
    .values({ slug: LOOK, name: "Element Look", origin: "bundle" })
    .returning();
  const [el] = await db
    .insert(libraryElementsTable)
    .values({
      slug: `${LOOK}/frames/gold-corner`,
      name: `Gold corner ${STAMP}`,
      category: "frames",
      tags: ["corner", "gold"],
      lookId: look!.id,
      origin: "bundle",
      document: fragment(),
    })
    .returning();
  bundleElementId = el!.id;
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db
    .delete(libraryElementsTable)
    .where(inArray(libraryElementsTable.authorTenantId, tenants));
  await db.delete(libraryElementsTable).where(like(libraryElementsTable.slug, `${LOOK}/%`));
  await db.delete(templateLooksTable).where(eq(templateLooksTable.slug, LOOK));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const as = (c: string, tenant: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
});
const me = () => as(cookie, tenantId);
const them = () => as(otherCookie, otherTenantId);

describe("the element library", () => {
  it("is for admins only", async () => {
    expect((await request(app).get("/api/template-library/elements")).status).toBe(401);
    expect((await request(app).post("/api/template-library/elements").send({})).status).toBe(401);
  });

  it("lists bundle elements with their look, credited to Ovation", async () => {
    const res = await me().get(`/template-library/elements?look=${LOOK}`);
    expect(res.status).toBe(200);
    expect(res.body.elements).toHaveLength(1);
    expect(res.body.elements[0]).toMatchObject({
      id: bundleElementId,
      category: "frames",
      tags: ["corner", "gold"],
      origin: "bundle",
      authorName: "Ovation",
      mine: false,
      listed: true,
      look: { slug: LOOK, name: "Element Look" },
      thumbnailUrl: null,
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it("searches names and tags, every word", async () => {
    const hit = async (q: string) =>
      (await me().get(`/template-library/elements?look=${LOOK}&q=${encodeURIComponent(q)}`)).body
        .elements.length;
    expect(await hit("corner")).toBe(1);
    expect(await hit("GOLD")).toBe(1);
    expect(await hit(`gold ${STAMP}`)).toBe(1);
    expect(await hit("gold slash")).toBe(0);
    expect(await hit("%")).toBe(0);
    expect(
      (await me().get(`/template-library/elements?look=${LOOK}&category=bands`)).body.elements,
    ).toHaveLength(0);
  });

  it("rejects an unknown category", async () => {
    expect((await me().get("/template-library/elements?category=stickers")).status).toBe(400);
  });

  it("saves a club's layers publicly, credited to the club", async () => {
    const res = await me().post("/template-library/elements", {
      name: `  Accent band ${STAMP} `,
      category: "bands",
      tags: ["Band", "band", " accent "],
      document: fragment(),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: `Accent band ${STAMP}`,
      category: "bands",
      tags: ["band", "accent"],
      origin: "club",
      authorName: "Element Club",
      mine: true,
      listed: true,
      look: null,
    });
    const seen = await them().get(`/template-library/elements/${res.body.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ authorName: "Element Club", mine: false });
    expect(seen.body.document).toEqual(fragment());
  });

  it("won't publish a club's images, other addresses or invalid layers", async () => {
    const save = (document: unknown) =>
      me().post("/template-library/elements", { name: "Bad", category: "frames", document });
    const upload = await save(
      fragment({ kind: "image", content: "/api/storage/objects/uploads/abc.png" }),
    );
    expect(upload.status).toBe(400);
    expect(upload.body.errors.join(" ")).toMatch(/library images/);
    const remote = await save(fragment({ style: { fill: "url(https://evil.test/x.png)" } }));
    expect(remote.status).toBe(400);
    expect((await save({ formatVersion: 2, layers: [] })).status).toBe(400);
    expect((await save({ layers: fragment().layers })).status).toBe(400);
    const noName = await me().post("/template-library/elements", {
      name: "   ",
      category: "frames",
      document: fragment(),
    });
    expect(noName.status).toBe(400);
  });

  it("lets only the author unlist, and keeps it visible to the author", async () => {
    const saved = await me().post("/template-library/elements", {
      name: `Unlist me ${STAMP}`,
      category: "rules",
      document: fragment(),
    });
    const id = saved.body.id as number;
    expect((await them().post(`/template-library/elements/${id}/unlist`)).status).toBe(404);
    expect((await me().post(`/template-library/elements/${bundleElementId}/unlist`)).status).toBe(
      404,
    );
    const res = await me().post(`/template-library/elements/${id}/unlist`);
    expect(res.status).toBe(200);
    expect(res.body.listed).toBe(false);
    expect((await them().get(`/template-library/elements/${id}`)).status).toBe(404);
    const theirs = await them().get(`/template-library/elements?q=${STAMP}`);
    expect(theirs.body.elements.map((e: { id: number }) => e.id)).not.toContain(id);
    const mine = await me().get("/template-library/elements?mine=true");
    expect(mine.body.elements.map((e: { id: number }) => e.id)).toContain(id);
    expect(mine.body.elements.every((e: { mine: boolean }) => e.mine)).toBe(true);
    const all = await me().get("/template-library/elements?mine=false&look=" + LOOK);
    expect(all.body.elements).toHaveLength(1);
  });

  it("takes one report per club, and not on the club's own element", async () => {
    const saved = await me().post("/template-library/elements", {
      name: `Report me ${STAMP}`,
      category: "badges",
      document: fragment(),
    });
    const id = saved.body.id as number;
    expect(
      (await them().post(`/template-library/elements/${id}/report`, { reason: "Copied art" }))
        .status,
    ).toBe(204);
    expect(
      (await them().post(`/template-library/elements/${id}/report`, { reason: "Offensive" }))
        .status,
    ).toBe(204);
    const reports = await db
      .select()
      .from(libraryElementReportsTable)
      .where(eq(libraryElementReportsTable.elementId, id));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ tenantId: otherTenantId, reason: "Offensive" });
    expect(
      (await me().post(`/template-library/elements/${id}/report`, { reason: "Mine" })).status,
    ).toBe(400);
    expect((await them().post(`/template-library/elements/${id}/report`, {})).status).toBe(400);
    expect(
      (await them().post(`/template-library/elements/999999999/report`, { reason: "x" })).status,
    ).toBe(404);
  });

  it("answers 404 for an id that isn't one", async () => {
    expect((await me().get("/template-library/elements/abc")).status).toBe(404);
    expect((await me().get("/template-library/elements/999999999")).status).toBe(404);
  });
});
