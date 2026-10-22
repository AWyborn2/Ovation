/**
 * The platform console's AI designer routes (ADR-011 §8, L7-B, T7.12), with a
 * stub provider: platform admins only, uploads only (a library photo is
 * refused), not-configured as 503, and a design that is saved as an unlisted
 * console template with its usage recorded. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import app from "../app";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  platformAdminsTable,
  templateGenerationsTable,
} from "@workspace/db";
import { hashPassword } from "../lib/auth";
import { generationsSettled, setGenerationFitCheck } from "../lib/template-ai/jobs";
import {
  NO_USAGE,
  setTemplateAiProvider,
  type TemplateAiRequest,
} from "../lib/template-ai/provider";

const STAMP = Date.now();
const EMAIL = `designer-${STAMP}@example.test`;
const PASSWORD = "designer-test-password";
let platformAdminId: number;
let cookie: string;
const generationIds: number[] = [];

const box = { x: 10, y: 10, w: 80, h: 20 };
const geometry = { square: box, portrait: box, story: box, landscape: box };
const DESIGN = {
  formatVersion: 2,
  pages: { card: { layers: [{ id: "name", kind: "text", content: "{{playerName}}", geometry }] } },
};

const requests: TemplateAiRequest[] = [];
function useStub(text = JSON.stringify(DESIGN)) {
  setTemplateAiProvider({
    async generate(req) {
      requests.push(req);
      return {
        text,
        content: [{ type: "text", text }],
        stopReason: "end_turn",
        model: "claude-opus-5-5",
        fellBack: false,
        usage: {
          ...NO_USAGE,
          inputTokens: 1200,
          outputTokens: 9000,
          cacheWriteTokens: 4000,
          costMicros: 216_800,
        },
      };
    },
  });
}

beforeAll(async () => {
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Designer", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  cookie = String(login.headers["set-cookie"][0]).split(";")[0]!;
  // CI has no Chromium: the designer validates alone.
  setGenerationFitCheck(null);
});

afterEach(() => {
  setTemplateAiProvider(null);
  requests.length = 0;
});

afterAll(async () => {
  setGenerationFitCheck(undefined);
  const rows = generationIds.length
    ? await db
        .select()
        .from(templateGenerationsTable)
        .where(inArray(templateGenerationsTable.id, generationIds))
    : [];
  const libIds = rows
    .map((r) => (r.resultRef as { libraryTemplateId?: number } | null)?.libraryTemplateId)
    .filter((id): id is number => typeof id === "number");
  if (libIds.length)
    await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, libIds));
  if (generationIds.length)
    await db
      .delete(templateGenerationsTable)
      .where(inArray(templateGenerationsTable.id, generationIds));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

describe("AI designer routes", () => {
  it("is for platform admins only", async () => {
    const res = await request(app).get("/api/platform/admin/library/designer");
    expect(res.status).toBe(401);
    const start = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .field("kind", "milestone");
    expect(start.status).toBe(401);
  });

  it("says when it isn't configured, and won't start", async () => {
    setTemplateAiProvider(null);
    const overview = await request(app)
      .get("/api/platform/admin/library/designer")
      .set("Cookie", cookie);
    expect(overview.status).toBe(200);
    // CI sets no ANTHROPIC_API_KEY.
    expect(overview.body.configured).toBe(false);
    const res = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "milestone")
      .field("brief", "A gold card");
    expect(res.status).toBe(503);
  });

  it("refuses a library photo and anything but an uploaded PNG or JPEG", async () => {
    useStub();
    const photo = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "milestone")
      .field("libraryPhotoId", "42");
    expect(photo.status).toBe(400);
    expect(photo.body.error).toMatch(/library photos can't be sent/);
    const gif = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "milestone")
      .attach("image", Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"), "x.gif");
    expect(gif.status).toBe(400);
    const nothing = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "milestone");
    expect(nothing.status).toBe(400);
    const kind = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "chart")
      .field("brief", "x");
    expect(kind.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it("designs from a brief and an image, saving an unlisted console template", async () => {
    useStub();
    const png = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: "#123456" },
    })
      .png()
      .toBuffer();
    const res = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "milestone")
      .field("brief", "A gold foil milestone card")
      .attach("image", png, "reference.png");
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
    generationIds.push(res.body.id);
    await generationsSettled();

    const job = await request(app)
      .get(`/api/platform/admin/library/designer/generations/${res.body.id}`)
      .set("Cookie", cookie);
    expect(job.status).toBe(200);
    expect(job.body).toMatchObject({
      status: "done",
      outcome: "pass",
      attempts: 1,
      firstTryFit: null,
      tokens: { input: 1200, output: 9000, cacheRead: 0, cacheWrite: 4000 },
      costUsd: 0.2168,
    });
    const { libraryTemplateId, version } = job.body.result;
    const [template] = await db
      .select()
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.id, libraryTemplateId));
    expect(template).toMatchObject({ kind: "milestone", origin: "console", listed: false });
    const [stored] = await db
      .select()
      .from(libraryTemplateVersionsTable)
      .where(eq(libraryTemplateVersionsTable.templateId, libraryTemplateId));
    expect(stored).toMatchObject({ version, document: DESIGN, createdByAdminId: platformAdminId });

    // The image went to the model downscaled to a 1,568 px long edge, and nothing else did.
    const content = requests[0]!.messages[0]!.content as Array<{
      type: string;
      source?: { data: string };
    }>;
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
    const sent = await sharp(Buffer.from(content[0]!.source!.data, "base64")).metadata();
    expect([sent.width, sent.height]).toEqual([1568, 784]);

    const overview = await request(app)
      .get("/api/platform/admin/library/designer")
      .set("Cookie", cookie);
    expect(overview.body.generations.some((g: { id: number }) => g.id === res.body.id)).toBe(true);
  });

  it("records an invalid design without saving a template", async () => {
    useStub("not a template");
    const res = await request(app)
      .post("/api/platform/admin/library/designer/generations")
      .set("Cookie", cookie)
      .field("kind", "milestone")
      .field("brief", "x");
    generationIds.push(res.body.id);
    await generationsSettled();
    const job = await request(app)
      .get(`/api/platform/admin/library/designer/generations/${res.body.id}`)
      .set("Cookie", cookie);
    expect(job.body).toMatchObject({
      status: "done",
      outcome: "invalid",
      attempts: 3,
      result: null,
    });
    expect(job.body.errors[0]).toMatch(/no JSON object/);
  });
});
