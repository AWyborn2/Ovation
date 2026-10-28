/**
 * Studio editor Uploads (migration 0073): PNG keeps its transparency, an SVG
 * becomes cleaned vector markup, names are searchable, rename and delete, and
 * another club sees none of it. Real-DB integration test (needs DATABASE_URL);
 * object storage is an in-memory store.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import sharp from "sharp";
import app from "../app";
import { db, tenantsTable, adminsTable, clubUploadsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";
import { cleanUploadedSvg, uploadName } from "../lib/club-uploads";

const STAMP = Date.now();
const objects = new Map<string, Buffer>();
let counter = 0;
const memoryStore: PhotoStore = {
  async read(path) {
    const data = objects.get(path);
    if (!data) throw new Error("missing object");
    return data;
  },
  async write(data, _type, prefix = "library") {
    const path = `/objects/${prefix}/test-${STAMP}-${counter++}`;
    objects.set(path, data);
    return path;
  },
  async remove(path) {
    objects.delete(path);
  },
};

let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;

const BUBBLE = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" zoomAndPan="magnify" viewBox="0 0 810 611" version="1.0"><path style="fill:#ffffff;fill-opacity:1" d="M 10 10 L 100 10 L 100 100 Z"/></svg>`;

async function upload(name: string, data: Buffer): Promise<string> {
  const path = `/objects/uploads/${STAMP}-${name}`;
  objects.set(path, data);
  return path;
}

const api = (
  method: "get" | "post" | "patch" | "delete",
  path: string,
  as: "own" | "other" = "own",
) => {
  const agent = request(app);
  return agent[method](`/api${path}`)
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));
};

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-club-uploads";
  setPhotoStore(memoryStore);
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `uploads-${STAMP}`, centralClubId: 9971, name: "Upload Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `uploads-o-${STAMP}`, centralClubId: 9972, name: "Other", plan: "pro" })
    .returning();
  otherTenantId = o.id;
  for (const [tid, key] of [
    [tenantId, "a"],
    [otherTenantId, "b"],
  ] as const) {
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tid,
        username: `uploads_${key}_${STAMP}`,
        displayName: "Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    const c = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    if (tid === tenantId) cookie = c;
    else otherCookie = c;
  }
});

afterAll(async () => {
  setPhotoStore(null);
  await db
    .delete(clubUploadsTable)
    .where(inArray(clubUploadsTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

describe("ingest", () => {
  it("keeps a PNG's transparency and turns an SVG into vector markup, per file", async () => {
    const png = await sharp({
      create: { width: 40, height: 30, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const files = [
      { objectPath: await upload("bubble.png", png), name: "Speech_bubble.png" },
      { objectPath: await upload("bubble.svg", Buffer.from(BUBBLE)), name: "Speech bubble.svg" },
      {
        objectPath: await upload(
          "bad.svg",
          Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>`),
        ),
        name: "bad.svg",
      },
      { objectPath: await upload("text.txt", Buffer.from("hello")), name: "notes.txt" },
    ];
    const res = await api("post", "/club-uploads/ingest").send({ files });
    expect(res.status).toBe(200);
    const [pngRes, svgRes, badRes, txtRes] = res.body.results;

    expect(pngRes.ok).toBe(true);
    expect(pngRes.upload).toMatchObject({
      name: "Speech bubble",
      kind: "image",
      width: 40,
      height: 30,
      svg: null,
    });
    const stored = objects.get(pngRes.upload.url.replace("/api/storage", ""))!;
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);

    expect(svgRes.ok).toBe(true);
    expect(svgRes.upload).toMatchObject({
      name: "Speech bubble",
      kind: "svg",
      url: null,
      width: 810,
      height: 611,
    });
    expect(svgRes.upload.svg).toContain('fill="#ffffff"');
    expect(svgRes.upload.svg).not.toContain("zoomAndPan");

    expect(badRes.ok).toBe(false);
    expect(badRes.error).toMatch(/can't draw/);
    expect(txtRes.ok).toBe(false);
    // The originals are not kept.
    expect(objects.has(files[0]!.objectPath)).toBe(false);
  });
});

describe("the library", () => {
  it("searches by name, renames and deletes, and only for this club", async () => {
    const svgPath = await upload("star.svg", Buffer.from(BUBBLE));
    const added = await api("post", "/club-uploads/ingest").send({
      files: [{ objectPath: svgPath, name: "Gold star.svg" }],
    });
    const id = added.body.results[0].upload.id as number;

    const found = await api("get", "/club-uploads?q=gold%20star");
    expect(found.body.map((u: { id: number }) => u.id)).toEqual([id]);
    expect((await api("get", "/club-uploads?q=zebra")).body).toEqual([]);

    const renamed = await api("patch", `/club-uploads/${id}`).send({ name: "Badge star" });
    expect(renamed.body.name).toBe("Badge star");
    expect((await api("patch", `/club-uploads/${id}`).send({ name: "   " })).status).toBe(400);

    // Another club can't see, rename or delete it.
    expect((await api("get", "/club-uploads", "other")).body).toEqual([]);
    expect((await api("patch", `/club-uploads/${id}`, "other").send({ name: "x" })).status).toBe(
      404,
    );
    expect((await api("delete", `/club-uploads/${id}`, "other")).status).toBe(404);

    expect((await api("delete", `/club-uploads/${id}`)).status).toBe(204);
    const after = await api("get", "/club-uploads");
    expect(after.body.some((u: { id: number }) => u.id === id)).toBe(false);
    expect((await api("delete", `/club-uploads/${id}`)).status).toBe(404);
  });
});

describe("helpers", () => {
  it("cleans design-tool SVG and names uploads from files", () => {
    const out = cleanUploadedSvg(
      `<?xml version="1.0"?><!-- made in a tool --><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="x" inkscape:version="1" viewBox="0 0 10 10"><metadata>m</metadata><rect width="10" height="10" style="fill:red;cursor:pointer"/></svg>`,
    );
    expect(out.svg).toContain('fill="red"');
    expect(out.svg).not.toMatch(/inkscape|cursor|metadata/);
    expect(uploadName("C:\\art\\club_logo_final.png")).toBe("club logo final");
    expect(uploadName(".png")).toBe("Upload");
  });
});
