// The Figma import route (ADR-011 L8-B, T8.8–T8.9), on the recorded L8-A fixture.
//
// Real database; no Figma token. A stub client answers from the fixture, renders come from a stub
// download, and library assets from a stub store, so the test reads exactly what the import does
// with Figma's answers: the template it saves, its report, and how a refused token reads.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import app from "../app";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  platformAdminsTable,
} from "@workspace/db";
import { templateDocumentErrors, flattenLayers } from "@workspace/scorecard/kind-templates";
import { hashPassword } from "../lib/auth";
import { FIGMA_MESSAGES, FigmaError, type FigmaClient } from "../lib/template-import/figma";
import { cleanFigmaSvg, setFigmaImportDeps } from "../lib/template-import/figma-import";
import type { FigmaNode, FigmaNodesResponse } from "../lib/template-import/figma-types";

const STAMP = Date.now();
const EMAIL = `figma+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
const NAME = `Figma ${STAMP}`;
const KEY = "AbCdEfGhIjKlMnOp";

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../lib/template-import/__fixtures__/figma-century.json", import.meta.url),
    "utf8",
  ),
) as FigmaNodesResponse;

const SVG = (extra = "") =>
  `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 2" fill="none"><g filter="url(#f)"><path d="M0 0h10v2z" fill="#E11D48"/></g>${extra}<defs><filter id="f" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1"/></filter></defs></svg>`;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const ASSET = "/api/storage/public-objects/library/0b0c0d0e-0000-4000-8000-0000000000aa.png";

let cookie: string;
let platformAdminId: number;
let svgBody = SVG();
const imageRequests: Array<{ ids: readonly string[]; format: string }> = [];

const fixtureClient = (): FigmaClient => ({
  async getFile() {
    const frames: FigmaNode[] = Object.values(FIXTURE.nodes).map((e) => e!.document);
    return {
      name: FIXTURE.name,
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [{ id: "0:1", name: "Page 1", type: "CANVAS", children: frames }],
      },
    };
  },
  async getNodes() {
    return FIXTURE;
  },
  async getImages(_key, ids, { format }) {
    imageRequests.push({ ids, format });
    return Object.fromEntries(
      ids.map((id) => [id, `https://figma-renders.example/${format}/${id}`]),
    );
  },
});

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-figma-import";
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Designer", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  cookie = String(login.headers["set-cookie"][0]).split(";")[0]!;
});

afterEach(() => {
  setFigmaImportDeps(null);
  imageRequests.length = 0;
  svgBody = SVG();
});

afterAll(async () => {
  const ids = (
    await db
      .select({ id: libraryTemplatesTable.id })
      .from(libraryTemplatesTable)
      .where(like(libraryTemplatesTable.name, `${NAME}%`))
  ).map((r) => r.id);
  if (ids.length) {
    await db
      .delete(libraryTemplateVersionsTable)
      .where(inArray(libraryTemplateVersionsTable.templateId, ids));
    await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, ids));
  }
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

const PATH = "/api/platform/admin/library/import/figma";
const post = (body: object) => request(app).post(PATH).set("Cookie", cookie).send(body);
const useFixture = (over: Partial<Parameters<typeof setFigmaImportDeps>[0] & object> = {}) =>
  setFigmaImportDeps({
    client: fixtureClient(),
    download: async (url) =>
      url.includes("/svg/") ? Buffer.from(svgBody) : url.includes("/png/") ? PNG : null,
    saveAsset: async () => ASSET,
    ...over,
  });

describe("Figma import: access and Figma's answers", () => {
  it("needs a platform admin", async () => {
    expect((await request(app).post(PATH).send({ fileUrl: KEY, kind: "century" })).status).toBe(
      401,
    );
  });

  it("says the import is off when there's no token", async () => {
    delete process.env.FIGMA_ACCESS_TOKEN;
    const res = await post({ fileUrl: KEY, kind: "century" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: FIGMA_MESSAGES.notConfigured, code: "not-configured" });
  });

  it("explains an expired token and how to replace it", async () => {
    useFixture({
      client: {
        ...fixtureClient(),
        async getFile() {
          throw new FigmaError("token", FIGMA_MESSAGES.token, 403);
        },
      },
    });
    const res = await post({ fileUrl: KEY, kind: "century" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("token");
    expect(res.body.error).toMatch(/expired or been revoked/);
    expect(res.body.error).toMatch(/FIGMA_ACCESS_TOKEN/);
  });

  it("refuses a link that isn't a Figma design and a kind that doesn't exist", async () => {
    useFixture();
    expect((await post({ fileUrl: "https://example.com/x", kind: "century" })).status).toBe(400);
    expect((await post({ fileUrl: KEY, kind: "nope" })).status).toBe(400);
  });
});

describe("Figma import: the template", () => {
  it("saves an unlisted console template with the vector rendered and a report", async () => {
    useFixture();
    const res = await post({ fileUrl: KEY, kind: "century", name: `${NAME} century` });
    expect(res.status).toBe(201);
    expect(res.body.template).toMatchObject({
      origin: "console",
      listed: false,
      kind: "century",
      name: `${NAME} century`,
      version: 1,
    });
    expect(res.body.rendered).toEqual({ vectors: 1, images: 0 });
    expect(imageRequests).toEqual([{ ids: ["10:9"], format: "svg" }]);
    const layers = flattenLayers(res.body.template.document.pages.card.layers);
    const swoosh = layers.find((l: { name?: string }) => l.name === "Swoosh") as
      { kind: string; svg: string } | undefined;
    expect(swoosh).toMatchObject({ kind: "vector" });
    // The export's drop-shadow filter is taken out; the drawing stays.
    expect(swoosh!.svg).not.toMatch(/filter/);
    expect(swoosh!.svg).toMatch(/<path/);
    expect(layers.find((l: { kind: string }) => l.kind === "photo")).toBeTruthy();
    expect(templateDocumentErrors(res.body.template.document, "century")).toEqual([]);
    expect(res.body.report.length).toBeGreaterThan(0);
    expect(res.body.frames.map((f: { size: string }) => f.size)).toEqual(["square", "story"]);
  });

  it("reports a vector whose SVG the format can't hold, and imports the rest", async () => {
    useFixture();
    svgBody = SVG("<foreignObject><div>hi</div></foreignObject>");
    const res = await post({ fileUrl: KEY, kind: "century", name: `${NAME} bad svg` });
    expect(res.status).toBe(201);
    expect(res.body.rendered.vectors).toBe(0);
    expect(
      res.body.report.some(
        (l: { layer?: string; message: string }) =>
          l.layer === "Swoosh" && /SVG uses something vectors can't/.test(l.message),
      ),
    ).toBe(true);
  });
});

describe("cleanFigmaSvg", () => {
  it("drops effect filters and the XML declaration, and keeps the allowlist", () => {
    const res = cleanFigmaSvg(SVG());
    expect(res.errors).toEqual([]);
    expect(res.svg).not.toMatch(/filter|<\?xml/);
    expect(
      cleanFigmaSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>').svg,
    ).toBeNull();
  });
});
