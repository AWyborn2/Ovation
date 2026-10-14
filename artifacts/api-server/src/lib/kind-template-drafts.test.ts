/**
 * Templated drafts (plan 2026-10-07-002, U7; ADR-002, ADR-003): automated
 * drafts copy their kind's template when the switch is on, render on the blank
 * base with lists split by row capacity, owe a layout check before automation
 * can touch them, and an automatic post that now needs a look is stopped.
 * Real-DB integration test (needs DATABASE_URL); the still renderer and object
 * store are swapped for in-memory fakes.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  captionTemplatesTable,
  cardTemplatesTable,
  socialDraftRevisionsTable,
  socialDraftsTable,
  socialSettingsTable,
  tenantsTable,
  type SocialDraftRow,
} from "@workspace/db";
import type { LayoutWarning } from "@workspace/scorecard/kind-templates";
import { upsertDraftByKey } from "./draft-upsert";
import {
  checkDraftLayout,
  renderDraftSlides,
  runPendingLayoutChecks,
  setStillRenderer,
} from "./draft-render";
import { effectiveDraftStatus, persistDueDrafts } from "./effective-draft-state";
import { autoPublishCandidates } from "./publishing/auto-publish";
import { prepareMedia } from "./publishing/prepare-media";
import { DestinationError } from "./publishing/destination";
import { recordDraftRevision, revertDraftToRevision } from "./draft-revisions";
import { setPhotoStore, type PhotoStore } from "./photo-store";
import { logger } from "./logger";

const STAMP = Date.now();
const saved = { ...process.env };
let tenantId: number;

/** A square rows layer holding five 10%-high rows of `matches`. */
const ROWS_DOC = {
  layers: [
    {
      id: "results",
      kind: "rows",
      geometry: { square: { x: 0, y: 0, w: 100, h: 50 } },
      rows: { repeat: "matches", rowHeight: 10, cells: [] },
    },
  ],
};

const matches = (n: number) => Array.from({ length: n }, (_, i) => ({ grade: `G${i + 1}` }));

// What the fake renderer reports back, keyed by size; empty means clean.
let renderWarnings: Partial<Record<string, LayoutWarning[]>> = {};
const renders: { size: string; packId: unknown; rows: number | null }[] = [];
async function fakeRender(input: unknown, options: unknown) {
  const o = options as { size: string; packId: unknown };
  const list = (input as { matches?: unknown[] }).matches;
  renders.push({ size: o.size, packId: o.packId, rows: Array.isArray(list) ? list.length : null });
  const buffer = await sharp({
    create: { width: 20, height: 20, channels: 4, background: "#123456" },
  })
    .png()
    .toBuffer();
  return { buffer, contentType: "image/png", warnings: renderWarnings[o.size] ?? [] };
}

const objects = new Map<string, Buffer>();
const memoryStore: PhotoStore = {
  async read(p) {
    return objects.get(p)!;
  },
  async write(data) {
    const p = `/objects/library/${Math.random().toString(36).slice(2)}`;
    objects.set(p, data);
    return p;
  },
  async remove(p) {
    objects.delete(p);
  },
};

async function draft(
  over: Partial<typeof socialDraftsTable.$inferInsert> = {},
): Promise<SocialDraftRow> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "roundup",
      status: "awaiting_review",
      cardInput: { kind: "weekendWrap", matches: matches(3) },
      packId: "blank",
      adjustments: ROWS_DOC,
      templateVersion: 1,
      layoutCheckPending: false,
      layoutWarnings: { square: [] },
      autoReadyAt: new Date(Date.now() - 60_000),
      sourceImportedAt: new Date(),
      ...over,
    })
    .returning();
  return row;
}

const reload = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `kind-drafts-${STAMP}`, centralClubId: 9971, name: "Layout Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId, sizePortrait: false, sizeStory: false });
});

beforeEach(() => {
  process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
  delete process.env.RENDER_HARNESS_URL;
  delete process.env.RENDER_HARNESS_ORIGIN;
  setStillRenderer(fakeRender);
  setPhotoStore(memoryStore);
  renderWarnings = {};
  renders.length = 0;
});

afterEach(async () => {
  setStillRenderer(null);
  setPhotoStore(null);
  process.env = { ...saved };
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
});

afterAll(async () => {
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const upsert = (key: string, cardInput: Record<string, unknown>) =>
  upsertDraftByKey({
    tenantId,
    engine: "roundup",
    family: "roundup",
    sourceKey: `kt:${STAMP}:${key}`,
    cardInput,
    appPath: "/results",
  });

describe("automated drafts copy the kind template (T7.1)", () => {
  it("with the switch off, a new draft keeps its pack", async () => {
    delete process.env.KIND_TEMPLATES;
    const { draft: d } = await upsert("off", { kind: "milestone", playerName: "Sam", value: 100 });
    expect(d.templateVersion).toBeNull();
    expect(d.packId).not.toBe("blank");
    expect(d.layoutCheckPending).toBe(false);
  });

  it("with the switch on, a new draft copies the template and owes a layout check", async () => {
    process.env.KIND_TEMPLATES = String(tenantId);
    const { action, draft: d } = await upsert("on", {
      kind: "milestone",
      playerName: "Sam",
      value: 100,
    });
    expect(action).toBe("inserted");
    expect(d.packId).toBe("blank");
    expect(d.templateVersion).toBe(1);
    expect(d.layoutCheckPending).toBe(true);
    const [template] = await db
      .select()
      .from(cardTemplatesTable)
      .where(and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, "kind")));
    expect(template.baseKind).toBe("milestone");
    expect(d.adjustments).toEqual(template.adjustments);
  });

  it("a data refresh keeps the copy and asks for a new layout check", async () => {
    process.env.KIND_TEMPLATES = "all";
    const first = await upsert("refresh", { kind: "milestone", playerName: "Sam", value: 100 });
    await db
      .update(socialDraftsTable)
      .set({ layoutCheckPending: false, adjustments: ROWS_DOC })
      .where(eq(socialDraftsTable.id, first.draft.id));
    const second = await upsert("refresh", { kind: "milestone", playerName: "Sam", value: 150 });
    expect(second.action).toBe("refreshed");
    expect(second.draft.layoutCheckPending).toBe(true);
    expect(second.draft.adjustments).toEqual(ROWS_DOC);
  });

  it("a kind with no template keeps its pack even with the switch on", async () => {
    process.env.KIND_TEMPLATES = "all";
    const { draft: d } = await upsert("unknown", { kind: "notAKind" });
    expect(d.templateVersion).toBeNull();
  });
});

describe("templated rendering (T7.2, T7.3)", () => {
  it("renders on the blank base and spills nine rows onto two even slides", async () => {
    const d = await draft({ cardInput: { kind: "weekendWrap", matches: matches(9) } });
    const slides = await renderDraftSlides(d, ["square"], null, logger);
    expect(renders.map((r) => [r.packId, r.rows])).toEqual([
      ["blank", 5],
      ["blank", 4],
    ]);
    expect(slides.map((s) => [s.page, s.of])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("caps at ten slides and carries the slides warning on the first", async () => {
    const d = await draft({ cardInput: { kind: "weekendWrap", matches: matches(56) } });
    const slides = await renderDraftSlides(d, ["square"], null, logger);
    expect(slides).toHaveLength(10);
    expect(slides[0].warnings).toEqual([expect.objectContaining({ reason: "slides" })]);
    expect(slides[1].warnings).toEqual([]);
  });
});

describe("layout checks (KTD10)", () => {
  it("store per-size warnings and clear the pending flag", async () => {
    const d = await draft({ layoutCheckPending: true, layoutWarnings: null });
    renderWarnings = { square: [{ reason: "overflow", size: "square", layerId: "results" }] };
    await checkDraftLayout(d, logger);
    const after = await reload(d.id);
    expect(after.layoutCheckPending).toBe(false);
    expect(after.layoutWarnings).toEqual({
      square: [{ reason: "overflow", size: "square", layerId: "results" }],
    });
  });

  it("drops warnings for a size the club has turned off", async () => {
    const d = await draft({
      layoutCheckPending: true,
      layoutWarnings: { story: [{ reason: "overflow", size: "story" }] },
    });
    await checkDraftLayout(d, logger);
    expect((await reload(d.id)).layoutWarnings).toEqual({ square: [] });
  });

  it("never stores a result for a design that changed while it rendered", async () => {
    const d = await draft({ layoutCheckPending: true, layoutWarnings: null });
    // An apply lands while the render is running.
    setStillRenderer(async (input, options) => {
      await db
        .update(socialDraftsTable)
        .set({ adjustments: { layers: [] }, templateVersion: 4, layoutCheckPending: true })
        .where(eq(socialDraftsTable.id, d.id));
      return fakeRender(input, options);
    });
    const result = await checkDraftLayout(d, logger);
    expect(result.stored).toBe(false);
    const after = await reload(d.id);
    expect(after.layoutCheckPending).toBe(true);
    expect(after.layoutWarnings).toBeNull();
  });

  it("stops a club's checks at its render budget", async () => {
    for (let i = 0; i < 3; i += 1) await draft({ layoutCheckPending: true, layoutWarnings: null });
    expect(await runPendingLayoutChecks(tenantId, logger, 20, 2)).toBe(2);
    expect(renders).toHaveLength(2);
  });

  it("run for pending drafts only, and leave them pending without a render harness", async () => {
    const pending = await draft({ layoutCheckPending: true, layoutWarnings: null });
    const done = await draft();
    expect(await runPendingLayoutChecks(tenantId, logger)).toBe(1);
    expect((await reload(pending.id)).layoutCheckPending).toBe(false);
    expect(renders).toHaveLength(1);

    const another = await draft({ layoutCheckPending: true, layoutWarnings: null });
    setStillRenderer(null);
    expect(await runPendingLayoutChecks(tenantId, logger)).toBe(0);
    expect((await reload(another.id)).layoutCheckPending).toBe(true);
    expect((await reload(done.id)).layoutCheckPending).toBe(false);
  });
});

describe("automation leaves a card that needs a look alone (T7.4)", () => {
  it("promotes a clean templated draft and pack drafts, never a pending or warned one", async () => {
    const clean = await draft();
    const pending = await draft({ layoutCheckPending: true });
    const warned = await draft({
      layoutWarnings: { square: [], story: [{ reason: "overflow", size: "story" }] },
    });
    const pack = await draft({
      packId: "club-kit",
      adjustments: null,
      templateVersion: null,
      layoutCheckPending: true,
      layoutWarnings: null,
    });
    const promoted = await persistDueDrafts(tenantId);
    expect(promoted.sort()).toEqual([clean.id, pack.id].sort());

    const autoPost = { enabled: true };
    expect(effectiveDraftStatus(pending, autoPost)).toBe("awaiting_review");
    expect(effectiveDraftStatus(warned, autoPost)).toBe("awaiting_review");
    expect(effectiveDraftStatus(clean, autoPost)).toBe("ready");
  });

  it("auto-publish skips a ready templated draft that needs a look", async () => {
    const clean = await draft({ status: "ready" });
    await draft({
      status: "ready",
      layoutWarnings: { square: [{ reason: "font", size: "square" }] },
    });
    await draft({ status: "ready", layoutCheckPending: true });
    expect(await autoPublishCandidates(tenantId, 48, new Date())).toEqual([clean.id]);
  });
});

describe("publish-time check (T7.5)", () => {
  it("stops an automatic post whose render now warns, and stores the warning", async () => {
    const d = await draft({ status: "ready" });
    renderWarnings = { square: [{ reason: "overflow", size: "square" }] };
    await expect(
      prepareMedia(d, "facebook", "feed", logger, { abortOnWarnings: true }),
    ).rejects.toBeInstanceOf(DestinationError);
    expect((await reload(d.id)).layoutWarnings).toEqual({
      square: [{ reason: "overflow", size: "square" }],
    });
  });

  it("lets a post an admin scheduled go ahead", async () => {
    const d = await draft({ status: "ready" });
    renderWarnings = { square: [{ reason: "overflow", size: "square" }] };
    const media = await prepareMedia(d, "facebook", "feed", logger);
    expect(media.post.imageUrls).toHaveLength(1);
  });
});

describe("revisions restore the design base", () => {
  it("reverting a template apply puts the pack back", async () => {
    const d = await draft({
      packId: "club-kit",
      adjustments: null,
      templateVersion: null,
      layoutWarnings: null,
    });
    await recordDraftRevision(d, "template");
    const [rev] = await db
      .select()
      .from(socialDraftRevisionsTable)
      .where(eq(socialDraftRevisionsTable.draftId, d.id));
    expect(rev.packId).toBe("club-kit");
    await db
      .update(socialDraftsTable)
      .set({ packId: "blank", adjustments: ROWS_DOC, templateVersion: 3 })
      .where(eq(socialDraftsTable.id, d.id));
    const reverted = await revertDraftToRevision(tenantId, d.id, rev.id);
    expect(reverted?.packId).toBe("club-kit");
    expect(reverted?.templateVersion).toBeNull();
    await db
      .delete(socialDraftRevisionsTable)
      .where(inArray(socialDraftRevisionsTable.draftId, [d.id]));
  });
});
