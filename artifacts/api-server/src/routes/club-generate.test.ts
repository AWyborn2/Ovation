/**
 * Club Generate (ADR-012 R2-D, TD.6), with a stub provider: the gate (503
 * until configured, above the quality bar and switched on), the monthly cap
 * (19 → 20 → 429, provider errors and refusals not counted, the Perth month),
 * tenant isolation, the private club template a design saves as, stored
 * errors, the round-robin queue, and the console switch. Real-DB integration
 * test (needs DATABASE_URL).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import app from "../app";
import {
  adminsTable,
  cardTemplatesTable,
  db,
  libraryTemplatesTable,
  platformAdminsTable,
  platformSettingsTable,
  templateGenerationsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, hashPassword, SESSION_COOKIE } from "../lib/auth";
import {
  CLUB_GENERATE_LIMIT,
  generationsSettled,
  generationsUsed,
  setGenerationFitCheck,
} from "../lib/template-ai/jobs";
import {
  NO_USAGE,
  setTemplateAiProvider,
  type TemplateAiProvider,
  type TemplateAiRequest,
} from "../lib/template-ai/provider";

const STAMP = Date.now();
const QUALITY_EPOCH = new Date("2000-01-01T00:00:00Z");
const tenants: Record<"a" | "b" | "cap", number> = { a: 0, b: 0, cap: 0 };
const cookies: Record<"a" | "b" | "cap", string> = { a: "", b: "", cap: "" };
const adminIds: number[] = [];
let platformAdminId: number;
let platformCookie: string;
let savedSwitch: boolean | null = null;

const box = { x: 10, y: 10, w: 80, h: 20 };
const geometry = { square: box, portrait: box, story: box, landscape: box };
const DESIGN = {
  formatVersion: 2,
  pages: { card: { layers: [{ id: "name", kind: "text", content: "{{playerName}}", geometry }] } },
};

const requests: TemplateAiRequest[] = [];
const reply = (text = JSON.stringify(DESIGN)) => ({
  text,
  content: [{ type: "text" as const, text }],
  stopReason: "end_turn",
  model: "claude-opus-5-5",
  fellBack: false,
  usage: { ...NO_USAGE, inputTokens: 100, outputTokens: 900, costMicros: 20_000 },
});
function useStub(generate?: TemplateAiProvider["generate"]) {
  setTemplateAiProvider({
    generate:
      generate ??
      (async (req) => {
        requests.push(req);
        return reply();
      }),
  });
}
const libraryCount = async () =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(libraryTemplatesTable))[0]!.n;
const briefOf = (req: TemplateAiRequest) => /Brief: (\w+)/.exec(JSON.stringify(req))?.[1];

async function setSwitch(enabled: boolean) {
  await db
    .insert(platformSettingsTable)
    .values({ id: 1, clubGenerateEnabled: enabled })
    .onConflictDoUpdate({
      target: platformSettingsTable.id,
      set: { clubGenerateEnabled: enabled },
    });
}

const as = (key: "a" | "b" | "cap") => ({
  get: (p: string) =>
    request(app)
      .get(`/api${p}`)
      .set("Cookie", cookies[key])
      .set("x-tenant-id", String(tenants[key])),
  post: (p: string) =>
    request(app)
      .post(`/api${p}`)
      .set("Cookie", cookies[key])
      .set("x-tenant-id", String(tenants[key])),
});

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-club-generate";
  let n = 0;
  for (const key of ["a", "b", "cap"] as const) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `club-gen-${key}-${STAMP}`,
        centralClubId: 4_000_000 + (STAMP % 100_000) * 3 + n++,
        name: `Generate Club ${key.toUpperCase()}`,
        plan: "pro",
      })
      .returning();
    tenants[key] = t!.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t!.id,
        username: `gen_${key}_${STAMP}`,
        displayName: `Gen ${key}`,
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin!.id);
    cookies[key] =
      `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
  }
  const email = `club-gen-${STAMP}@example.test`;
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email, displayName: "Gen", passwordHash: await hashPassword("club-gen-password") })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email, password: "club-gen-password" });
  platformCookie = String(login.headers["set-cookie"][0]).split(";")[0]!;

  // The quality bar: 50 console designs, 40 fitting first time, older than any real one.
  await db.insert(templateGenerationsTable).values(
    Array.from({ length: 50 }, (_, i) => ({
      tenantId: null,
      kind: "milestone",
      model: "claude-opus-5-5",
      status: "done" as const,
      outcome: "pass",
      attempts: 1,
      firstTryFit: i < 40,
      costMicros: 300_000,
      createdAt: new Date(QUALITY_EPOCH.getTime() + i * 1000),
    })),
  );
  const [settings] = await db
    .select({ enabled: platformSettingsTable.clubGenerateEnabled })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.id, 1));
  savedSwitch = settings?.enabled ?? null;
  setGenerationFitCheck(null);
});

afterEach(async () => {
  await generationsSettled();
  setTemplateAiProvider(null);
  requests.length = 0;
});

afterAll(async () => {
  setGenerationFitCheck(undefined);
  const ids = Object.values(tenants);
  await db.delete(templateGenerationsTable).where(inArray(templateGenerationsTable.tenantId, ids));
  await db
    .delete(templateGenerationsTable)
    .where(
      and(
        isNull(templateGenerationsTable.tenantId),
        lt(templateGenerationsTable.createdAt, new Date("2000-01-02T00:00:00Z")),
      ),
    );
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, ids));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
  if (savedSwitch === null) await setSwitch(false);
  else await setSwitch(savedSwitch);
});

describe("club Generate gate", () => {
  it("answers 503 generate_unavailable while switched off, and the list says unavailable", async () => {
    useStub();
    await setSwitch(false);
    const list = await as("a").get("/club-templates/generations");
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ available: false, limit: CLUB_GENERATE_LIMIT });
    const res = await as("a")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "x");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("generate_unavailable");
    expect(requests).toHaveLength(0);
  });

  it("answers 503 when the designer isn't configured, even switched on", async () => {
    setTemplateAiProvider(null);
    await setSwitch(true);
    const res = await as("a")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "x");
    expect(res.status).toBe(503);
  });

  it("is admin-only", async () => {
    const res = await request(app)
      .get("/api/club-templates/generations")
      .set("x-tenant-id", String(tenants.a));
    expect(res.status).toBe(401);
  });

  it("lets the console switch it and shows the quality bar", async () => {
    useStub();
    expect(
      (await request(app).get("/api/platform/admin/library/designer/club-generate")).status,
    ).toBe(401);
    const off = await request(app)
      .put("/api/platform/admin/library/designer/club-generate")
      .set("Cookie", platformCookie)
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({
      enabled: false,
      configured: true,
      quality: { counted: 50, firstTryFit: 40, meanCostUsd: 0.3 },
      barMet: true,
      available: false,
    });
    const on = await request(app)
      .put("/api/platform/admin/library/designer/club-generate")
      .set("Cookie", platformCookie)
      .send({ enabled: true });
    expect(on.body).toMatchObject({ enabled: true, available: true });
    const bad = await request(app)
      .put("/api/platform/admin/library/designer/club-generate")
      .set("Cookie", platformCookie)
      .send({ enabled: "yes" });
    expect(bad.status).toBe(400);
  });

  it("is unavailable below the quality bar", async () => {
    useStub();
    await setSwitch(true);
    // 34 of 50 is 68%.
    const rows = await db
      .select({ id: templateGenerationsTable.id })
      .from(templateGenerationsTable)
      .where(
        and(
          isNull(templateGenerationsTable.tenantId),
          lt(templateGenerationsTable.createdAt, new Date("2000-01-02T00:00:00Z")),
        ),
      )
      .orderBy(templateGenerationsTable.createdAt)
      .limit(6);
    const ids = rows.map((r) => r.id);
    await db
      .update(templateGenerationsTable)
      .set({ firstTryFit: false })
      .where(inArray(templateGenerationsTable.id, ids));
    const res = await as("a")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "x");
    expect(res.status).toBe(503);
    await db
      .update(templateGenerationsTable)
      .set({ firstTryFit: true })
      .where(inArray(templateGenerationsTable.id, ids));
  });
});

describe("club Generate", () => {
  it("still refuses library photo fields", async () => {
    useStub();
    await setSwitch(true);
    for (const field of ["photoId", "libraryPhotoId", "photoUrl", "imageUrl"]) {
      const res = await as("a")
        .post("/club-templates/generations")
        .field("kind", "milestone")
        .field("brief", "x")
        .field(field, "42");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/library photos can't be sent/);
    }
    expect(requests).toHaveLength(0);
  });

  it("saves a design as a private club template, never in the library", async () => {
    useStub();
    await setSwitch(true);
    const libraryBefore = await libraryCount();
    const before = await as("a").get("/club-templates/generations");
    expect(before.body).toMatchObject({ available: true, remaining: CLUB_GENERATE_LIMIT });

    const res = await as("a")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "Gold numbers on navy");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ kind: "milestone", status: "queued", result: null });
    expect(res.body).not.toHaveProperty("costUsd");
    await generationsSettled();

    const job = await as("a").get(`/club-templates/generations/${res.body.id}`);
    expect(job.status).toBe(200);
    expect(job.body).toMatchObject({ status: "done", outcome: "pass", errors: [] });
    const copyId = job.body.result.copyId as number;
    const [copy] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, copyId));
    expect(copy).toMatchObject({
      tenantId: tenants.a,
      source: "kind",
      baseKind: "milestone",
      isKindDefault: false,
      originTemplateId: null,
      adjustments: DESIGN,
    });
    const libraryAfter = await libraryCount();
    expect(libraryAfter).toBe(libraryBefore);
    // The club's name never reaches the model.
    expect(JSON.stringify(requests)).not.toContain("Generate Club A");

    const after = await as("a").get("/club-templates/generations");
    expect(after.body.remaining).toBe(CLUB_GENERATE_LIMIT - 1);
    expect(after.body.generations.map((g: { id: number }) => g.id)).toContain(res.body.id);
  });

  it("keeps another club out of a design", async () => {
    useStub();
    await setSwitch(true);
    const res = await as("a")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "Mine");
    expect(res.status).toBe(202);
    await generationsSettled();
    expect((await as("b").get(`/club-templates/generations/${res.body.id}`)).status).toBe(404);
    const list = await as("b").get("/club-templates/generations");
    expect(list.body.generations).toEqual([]);
    expect(list.body.remaining).toBe(CLUB_GENERATE_LIMIT);
    // Nor does the console's own route serve a club's design.
    const console = await request(app)
      .get(`/api/platform/admin/library/designer/generations/${res.body.id}`)
      .set("Cookie", platformCookie);
    expect(console.status).toBe(404);
  });

  it("stores a provider error on the row and doesn't count it", async () => {
    useStub(async () => {
      throw new Error("overloaded");
    });
    await setSwitch(true);
    const used = await generationsUsed(tenants.b);
    const res = await as("b")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "x");
    expect(res.status).toBe(202);
    await generationsSettled();
    const [row] = await db
      .select()
      .from(templateGenerationsTable)
      .where(eq(templateGenerationsTable.id, res.body.id));
    expect(row).toMatchObject({ status: "failed", outcome: "provider_error" });
    expect(row!.error).toMatch(/couldn't reach the model: overloaded/);
    const job = await as("b").get(`/club-templates/generations/${res.body.id}`);
    expect(job.body.errors[0]).toMatch(/overloaded/);
    expect(await generationsUsed(tenants.b)).toBe(used);
  });

  it("takes tenants round robin, one job at a time", async () => {
    await setSwitch(true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const order: Array<string | undefined> = [];
    useStub(async (req) => {
      order.push(briefOf(req));
      if (order.length === 1) await gate;
      return reply();
    });
    for (const [key, brief] of [
      ["a", "Afirst"],
      ["a", "Asecond"],
      ["b", "Bfirst"],
    ] as const) {
      const res = await as(key)
        .post("/club-templates/generations")
        .field("kind", "milestone")
        .field("brief", brief);
      expect(res.status).toBe(202);
    }
    // Only the first is running while it is held.
    expect(order).toEqual(["Afirst"]);
    release();
    await generationsSettled();
    expect(order).toEqual(["Afirst", "Bfirst", "Asecond"]);
  });
});

describe("club Generate cap", () => {
  const seed = (count: number, outcome: string | null, createdAt = new Date()) =>
    db.insert(templateGenerationsTable).values(
      Array.from({ length: count }, () => ({
        tenantId: tenants.cap,
        kind: "milestone",
        model: "claude-opus-5-5",
        status: (outcome === null ? "queued" : "done") as "queued" | "done",
        outcome,
        createdAt,
      })),
    );

  it("allows the 20th design of the month and answers 429 after it", async () => {
    useStub();
    await setSwitch(true);
    await seed(19, "pass");
    // Provider errors and refusals don't count.
    await seed(2, "provider_error");
    await seed(1, "refused");
    expect((await as("cap").get("/club-templates/generations")).body.remaining).toBe(1);
    const twentieth = await as("cap")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "Twentieth");
    expect(twentieth.status).toBe(202);
    await generationsSettled();
    expect((await as("cap").get("/club-templates/generations")).body.remaining).toBe(0);
    const over = await as("cap")
      .post("/club-templates/generations")
      .field("kind", "milestone")
      .field("brief", "x");
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ remaining: 0, limit: CLUB_GENERATE_LIMIT });
    expect(requests).toHaveLength(1);
  });

  it("counts a calendar month in Perth", async () => {
    await db
      .delete(templateGenerationsTable)
      .where(eq(templateGenerationsTable.tenantId, tenants.cap));
    // 1 Nov 2026 00:30 in Perth (UTC+8) is 31 Oct 16:30 UTC.
    const now = new Date("2026-10-31T16:30:00Z");
    await seed(1, "pass", new Date("2026-10-31T15:59:00Z")); // 31 Oct 23:59 Perth: last month
    await seed(2, "pass", new Date("2026-10-31T16:00:00Z")); // 1 Nov 00:00 Perth: this month
    await seed(1, "pass", new Date("2026-11-30T15:59:00Z")); // 30 Nov 23:59 Perth: this month
    await seed(1, "pass", new Date("2026-11-30T16:00:00Z")); // 1 Dec 00:00 Perth: next month
    expect(await generationsUsed(tenants.cap, now)).toBe(3);
    // A UTC month would have counted October's row instead.
    expect(await generationsUsed(tenants.cap, new Date("2026-10-31T15:00:00Z"))).toBe(1);
  });
});
