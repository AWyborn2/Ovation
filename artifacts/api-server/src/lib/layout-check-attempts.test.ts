/**
 * Layout checks that never finish (retest 7). The sweep counts each draft's
 * tries, gives up after LAYOUT_CHECK_MAX_ATTEMPTS failed tries ("check failed,
 * needs a look") while keeping the draft out of automation, never lets a
 * failing draft starve newer ones, and an edit, apply, revert or data refresh
 * starts the count again. Layout checks draw whatever images load (a missing
 * photo can't fail them) with one try and longer waits; posts stay strict.
 * Real-DB integration test (needs DATABASE_URL); the still renderer is fake.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  captionTemplatesTable,
  cardTemplatesTable,
  socialDraftRevisionsTable,
  socialDraftsTable,
  socialSettingsTable,
  tenantsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { layoutBlocksAutomation } from "@workspace/scorecard/kind-templates";
import {
  checkDraftLayout,
  LAYOUT_CHECK_STILL_LIMITS,
  renderDraftSlides,
  runPendingLayoutChecks,
  setStillRenderer,
} from "./draft-render";
import { LAYOUT_CHECK_MAX_ATTEMPTS, layoutCheckErrorText } from "./layout-check-state";
import { effectiveDraftStatus, persistDueDrafts } from "./effective-draft-state";
import { autoPublishCandidates } from "./publishing/auto-publish";
import { upsertDraftByKey } from "./draft-upsert";
import { recordDraftRevision, revertDraftToRevision } from "./draft-revisions";
import { encodeSession, SESSION_COOKIE } from "./auth";
import { logger } from "./logger";

const STAMP = Date.now();
const saved = { ...process.env };
let tenantId: number;
let adminId: number;
let cookie: string;

const DOC = {
  layers: [
    {
      id: "title",
      kind: "text",
      geometry: { square: { x: 0, y: 0, w: 100, h: 20 } },
      text: "Round 7",
    },
  ],
};

type Call = { input: unknown; options: Record<string, unknown>; limits: unknown };
const calls: Call[] = [];
/** Draft ids whose renders throw, as a harness that times out would. */
const failing = new Set<number>();

async function fakeRender(input: unknown, options: unknown, _origin?: unknown, limits?: unknown) {
  calls.push({ input, options: options as Record<string, unknown>, limits });
  const id = (input as { draftId?: number }).draftId;
  if (id !== undefined && failing.has(id)) {
    throw new Error("Waiting failed: 30000ms exceeded\n    at stack line");
  }
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#123456" },
  })
    .png()
    .toBuffer();
  return { buffer, contentType: "image/png", warnings: [] };
}

/** A templated draft that owes a layout check; its card input names it for the fake. */
async function draft(
  over: Partial<typeof socialDraftsTable.$inferInsert> = {},
  minutesOld = 0,
): Promise<SocialDraftRow> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "milestone",
      status: "awaiting_review",
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      packId: "blank",
      adjustments: DOC,
      templateVersion: 1,
      layoutCheckPending: true,
      layoutWarnings: null,
      autoReadyAt: new Date(Date.now() - 60_000),
      sourceImportedAt: new Date(),
      createdAt: new Date(Date.now() - minutesOld * 60_000),
      ...over,
    })
    .returning();
  // The fake renderer reads the id from the card input.
  const [named] = await db
    .update(socialDraftsTable)
    .set({ cardInput: { ...(row.cardInput as object), draftId: row.id } })
    .where(eq(socialDraftsTable.id, row.id))
    .returning();
  return named;
}

const reload = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

/** One sweep's layout checks. */
const sweep = (limit?: number) => runPendingLayoutChecks(tenantId, logger, limit);

/** Fail a draft's check until it gives up. */
async function failUntilGivenUp(d: SocialDraftRow): Promise<void> {
  failing.add(d.id);
  for (let i = 0; i < LAYOUT_CHECK_MAX_ATTEMPTS; i += 1) await sweep();
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-layout-attempts";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `layout-attempts-${STAMP}`,
      centralClubId: 9971,
      name: "Attempts Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId, sizePortrait: false, sizeStory: false });
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `attempts_${STAMP}`, displayName: "Checker", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

beforeEach(() => {
  delete process.env.RENDER_HARNESS_URL;
  delete process.env.RENDER_HARNESS_ORIGIN;
  setStillRenderer(fakeRender);
  calls.length = 0;
  failing.clear();
});

afterEach(async () => {
  setStillRenderer(null);
  process.env = { ...saved };
  const ids = (
    await db
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, tenantId))
  ).map((r) => r.id);
  if (ids.length)
    await db
      .delete(socialDraftRevisionsTable)
      .where(inArray(socialDraftRevisionsTable.draftId, ids));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
});

afterAll(async () => {
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("layout check tries", () => {
  it("counts each failed try, keeps the draft pending, then gives up after the last", async () => {
    const d = await draft();
    failing.add(d.id);

    for (let attempt = 1; attempt < LAYOUT_CHECK_MAX_ATTEMPTS; attempt += 1) {
      const run = await sweep();
      expect(run).toEqual({ checked: 0, failed: 1, gaveUp: 0 });
      const after = await reload(d.id);
      expect(after.layoutCheckAttempts).toBe(attempt);
      expect(after.layoutCheckPending).toBe(true);
      expect(after.layoutCheckFailed).toBe(false);
      expect(after.layoutCheckLastTriedAt).toBeInstanceOf(Date);
      // Only the first line of the harness's message is kept.
      expect(after.layoutCheckError).toBe("Waiting failed: 30000ms exceeded");
    }

    expect(await sweep()).toEqual({ checked: 0, failed: 1, gaveUp: 1 });
    const gaveUp = await reload(d.id);
    expect(gaveUp.layoutCheckAttempts).toBe(LAYOUT_CHECK_MAX_ATTEMPTS);
    expect(gaveUp.layoutCheckFailed).toBe(true);
    expect(gaveUp.layoutCheckPending).toBe(true);

    // A draft that gave up isn't tried again by later sweeps.
    const rendersBefore = calls.length;
    expect(await sweep()).toEqual({ checked: 0, failed: 0, gaveUp: 0 });
    expect(calls.length).toBe(rendersBefore);
    expect((await reload(d.id)).layoutCheckAttempts).toBe(LAYOUT_CHECK_MAX_ATTEMPTS);
  });

  it("a check that works after a failed try stores its result and clears the error", async () => {
    const d = await draft();
    failing.add(d.id);
    await sweep();
    failing.clear();
    expect((await sweep()).checked).toBe(1);
    const after = await reload(d.id);
    expect(after.layoutCheckPending).toBe(false);
    expect(after.layoutCheckFailed).toBe(false);
    expect(after.layoutCheckError).toBeNull();
    expect(after.layoutCheckAttempts).toBe(2);
    expect(after.layoutWarnings).toEqual({ square: [] });
  });

  it("a failing draft can't starve newer ones: the least recently tried go first", async () => {
    const old = await draft({}, 60);
    const newer = await draft({}, 30);
    const newest = await draft({}, 0);
    failing.add(old.id);

    // One check a sweep: the oldest fails first, then the never-tried go before it.
    await sweep(1);
    expect((await reload(old.id)).layoutCheckAttempts).toBe(1);
    await sweep(1);
    expect((await reload(newer.id)).layoutCheckPending).toBe(false);
    await sweep(1);
    expect((await reload(newest.id)).layoutCheckPending).toBe(false);
    expect((await reload(old.id)).layoutCheckAttempts).toBe(1);
  });

  it("stops starting checks once the sweep's time is spent", async () => {
    const d = await draft();
    const run = await runPendingLayoutChecks(tenantId, logger, 20, 60, 0);
    expect(run).toEqual({ checked: 0, failed: 0, gaveUp: 0 });
    expect(calls).toHaveLength(0);
    expect((await reload(d.id)).layoutCheckAttempts).toBe(0);
  });

  it("counts nothing without a render harness (fail closed)", async () => {
    const d = await draft();
    setStillRenderer(null);
    expect(await sweep()).toEqual({ checked: 0, failed: 0, gaveUp: 0 });
    const after = await reload(d.id);
    expect(after.layoutCheckAttempts).toBe(0);
    expect(after.layoutCheckLastTriedAt).toBeNull();
    expect(after.layoutCheckPending).toBe(true);
  });

  it("keeps the error short", () => {
    expect(layoutCheckErrorText(new Error("x".repeat(500))).length).toBeLessThanOrEqual(300);
    expect(layoutCheckErrorText("")).toBe("The card could not be drawn.");
  });
});

describe("a failed check stays out of automation (fail closed)", () => {
  it("is never promoted, auto-published or read as ready", async () => {
    const failed = await draft();
    await failUntilGivenUp(failed);
    const ready = await draft({ status: "ready" });
    await failUntilGivenUp(ready);
    const clean = await draft({ layoutCheckPending: false, layoutWarnings: { square: [] } });

    const row = await reload(failed.id);
    expect(row.layoutCheckFailed).toBe(true);
    expect(layoutBlocksAutomation(row)).toBe(true);
    expect(effectiveDraftStatus(row, { enabled: true })).toBe("awaiting_review");
    expect(await persistDueDrafts(tenantId)).toEqual([clean.id]);
    expect((await reload(failed.id)).status).toBe("awaiting_review");
    expect(await autoPublishCandidates(tenantId, 48, new Date())).not.toContain(ready.id);
  });
});

describe("an edit, apply, revert or data refresh starts the check again", () => {
  it("a data refresh resets the tries", async () => {
    const first = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `attempts:${STAMP}:refresh`,
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      appPath: "/results",
    });
    expect(first.draft.templateVersion).not.toBeNull();
    await db
      .update(socialDraftsTable)
      .set({
        layoutCheckAttempts: LAYOUT_CHECK_MAX_ATTEMPTS,
        layoutCheckFailed: true,
        layoutCheckLastTriedAt: new Date(),
        layoutCheckError: "boom",
      })
      .where(eq(socialDraftsTable.id, first.draft.id));
    const second = await upsertDraftByKey({
      tenantId,
      engine: "roundup",
      family: "roundup",
      sourceKey: `attempts:${STAMP}:refresh`,
      cardInput: { kind: "milestone", playerName: "Sam", value: 150 },
      appPath: "/results",
    });
    expect(second.action).toBe("refreshed");
    expect(second.draft).toMatchObject({
      layoutCheckPending: true,
      layoutCheckAttempts: 0,
      layoutCheckFailed: false,
      layoutCheckLastTriedAt: null,
      layoutCheckError: null,
    });
  });

  it("a revert resets the tries", async () => {
    const d = await draft();
    await recordDraftRevision(d, "template");
    const [rev] = await db
      .select()
      .from(socialDraftRevisionsTable)
      .where(eq(socialDraftRevisionsTable.draftId, d.id));
    await failUntilGivenUp(d);
    const reverted = await revertDraftToRevision(tenantId, d.id, rev.id);
    expect(reverted).toMatchObject({
      layoutCheckPending: true,
      layoutCheckAttempts: 0,
      layoutCheckFailed: false,
    });
  });
});

describe("what a layout check draws", () => {
  it("draws whatever images load, with one try and longer waits; a post stays strict", async () => {
    const d = await draft();
    await checkDraftLayout(d, logger);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options.strictImages).toBe(false);
    expect(calls[0]!.limits).toEqual(LAYOUT_CHECK_STILL_LIMITS);
    expect(LAYOUT_CHECK_STILL_LIMITS.attempts).toBe(1);
    expect(LAYOUT_CHECK_STILL_LIMITS.bootTimeoutMs).toBeGreaterThan(30_000);

    calls.length = 0;
    await renderDraftSlides(d, ["square"], null, logger);
    expect(calls[0]!.options.strictImages).toBe(true);
    expect(calls[0]!.limits).toBeUndefined();
  });
});

describe("the queue API", () => {
  const get = () =>
    request(app)
      .get("/api/social-drafts")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));

  it("lists the tries, when it was last tried, and that the check failed", async () => {
    const d = await draft();
    await failUntilGivenUp(d);
    const res = await get();
    expect(res.status).toBe(200);
    const row = (res.body as Record<string, unknown>[]).find((r) => r.id === d.id)!;
    expect(row).toMatchObject({
      layoutCheckPending: true,
      layoutCheckAttempts: LAYOUT_CHECK_MAX_ATTEMPTS,
      layoutCheckFailed: true,
      layoutCheckError: "Waiting failed: 30000ms exceeded",
      status: "awaiting_review",
    });
    expect(typeof row.layoutCheckLastTriedAt).toBe("string");
  });

  it("an edit to the design through the API resets a failed check", async () => {
    const d = await draft();
    await failUntilGivenUp(d);
    const res = await request(app)
      .patch(`/api/social-drafts/${d.id}`)
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send({ adjustments: { layers: [] } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      layoutCheckPending: true,
      layoutCheckAttempts: 0,
      layoutCheckFailed: false,
      layoutCheckLastTriedAt: null,
      layoutCheckError: null,
    });
    // The next sweep tries it again from the first try.
    failing.clear();
    expect((await sweep()).checked).toBe(1);
    expect((await reload(d.id)).layoutCheckPending).toBe(false);
  });
});
