/**
 * Posting calendar U4 — what happens when a card's planned time arrives.
 * Real-DB integration test (needs DATABASE_URL); Meta is never called (the
 * worker isn't run), only publication rows are checked.
 */
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  socialSettingsTable,
  socialDraftsTable,
  socialConnectionsTable,
  socialPublicationsTable,
  notificationsTable,
} from "@workspace/db";
import { seal } from "./secret-box";
import { logger } from "./logger";
import { runPostingSlots, MAX_ROLL_REMINDERS } from "./posting-slots";
import { persistDueDrafts } from "./effective-draft-state";

const STAMP = Date.now();
const perth = (local: string) => new Date(`${local}:00+08:00`);
const saved = { ...process.env };
let tenantId: number;

// Milestones: Sunday and Wednesday 6pm, one per slot, so a roll has somewhere to go.
const SCHEDULE = {
  enabled: true,
  dailyCap: 4,
  minGapMinutes: 45,
  ageLimitDays: 7,
  kinds: {
    milestones: {
      slots: [
        { day: 0, time: "18:00" },
        { day: 3, time: "18:00" },
      ],
      collision: "roll" as const,
    },
  },
};

const SUNDAY_6PM = perth("2026-10-18T18:00");
const SUNDAY_7PM = perth("2026-10-18T19:00");
const WEDNESDAY_6PM = perth("2026-10-21T18:00");

async function settings(set: Partial<typeof socialSettingsTable.$inferInsert>) {
  await db.update(socialSettingsTable).set(set).where(eq(socialSettingsTable.tenantId, tenantId));
}

/** A card planned for Sunday 6pm, imported on Saturday. */
async function plannedCard(
  over: Partial<typeof socialDraftsTable.$inferInsert> = {},
): Promise<typeof socialDraftsTable.$inferSelect> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "milestone",
      family: "achievements",
      status: "awaiting_review",
      cardInput: { kind: "milestone" },
      sourceImportedAt: perth("2026-10-17T20:00"),
      autoReadyAt: SUNDAY_6PM,
      plannedAt: SUNDAY_6PM,
      plannedBy: "auto",
      ...over,
    })
    .returning();
  return row;
}

const load = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];
const pubsFor = (draftId: number) =>
  db.select().from(socialPublicationsTable).where(eq(socialPublicationsTable.draftId, draftId));
const notices = (kind: string) =>
  db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.kind, kind)));

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `slots-${STAMP}`, centralClubId: 98507, name: "Slots", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId, postingSchedule: SCHEDULE });
});

afterAll(async () => {
  process.env = saved;
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

beforeEach(async () => {
  process.env = { ...saved };
  delete process.env.META_PUBLISHING_ENABLED;
  await settings({
    postingSchedule: SCHEDULE,
    autoPostEnabled: false,
    autoPublishEnabled: false,
  });
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
});

async function metaOn() {
  process.env.META_PUBLISHING_ENABLED = "1";
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.SOCIAL_PUBLIC_ORIGIN = "https://platform.test";
  await db.insert(socialConnectionsTable).values({
    tenantId,
    status: "connected",
    pageId: "page-1",
    igUserId: "ig-1",
    pageToken: seal("EAASlotsPageToken123456"),
  });
}

describe("an approved card at its time", () => {
  it("nudges the admin when Meta is off, once (AE6)", async () => {
    const card = await plannedCard({ status: "ready" });
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.nudged).toBe(1);
    expect((await load(card.id)).dispatchedAt).not.toBeNull();
    const due = await notices("posts_due");
    expect(due).toHaveLength(1);
    expect(due[0].payload).toEqual({ draftIds: [card.id] });

    await runPostingSlots(tenantId, new Date(SUNDAY_7PM.getTime() + 3_600_000), logger);
    expect(await notices("posts_due")).toHaveLength(1);
  });

  it("publishes at its time when the club publishes automatically (AE8)", async () => {
    await metaOn();
    await settings({ autoPostEnabled: true, autoPublishEnabled: true });
    // Unreviewed: auto-post approves it at the slot.
    const card = await plannedCard();
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.promoted).toBe(1);
    expect(r.published).toBe(1);
    const pubs = await pubsFor(card.id);
    expect(pubs.map((p) => p.platform).sort()).toEqual(["facebook", "instagram"]);
    expect(pubs.every((p) => p.status === "scheduled" && p.origin === "auto")).toBe(true);
    // Its time has passed, so it goes on the next worker run.
    expect(pubs[0].scheduledFor.getTime()).toBe(SUNDAY_7PM.getTime());
    expect(await notices("posts_due")).toHaveLength(0);
  });

  it("nudges instead when the club's auto-publish opt-in is off", async () => {
    await metaOn();
    const card = await plannedCard({ status: "ready" });
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.nudged).toBe(1);
    expect(await pubsFor(card.id)).toHaveLength(0);
  });

  it("never publishes a junior card through Meta", async () => {
    await metaOn();
    await settings({ autoPostEnabled: true, autoPublishEnabled: true });
    const card = await plannedCard({ status: "ready", sourceMatchIsJunior: true });
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.nudged).toBe(1);
    expect(await pubsFor(card.id)).toHaveLength(0);
  });

  it("treats posts scheduled by hand as already sent", async () => {
    await metaOn();
    await settings({ autoPostEnabled: true, autoPublishEnabled: true });
    const card = await plannedCard({ status: "ready" });
    await db.insert(socialPublicationsTable).values({
      tenantId,
      draftId: card.id,
      platform: "facebook",
      postType: "feed",
      origin: "manual",
      status: "scheduled",
      scheduledFor: SUNDAY_6PM,
      nextAttemptAt: SUNDAY_6PM,
    });
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.published).toBe(0);
    expect(r.nudged).toBe(0);
    expect((await load(card.id)).dispatchedAt).not.toBeNull();
    expect(await pubsFor(card.id)).toHaveLength(1);
  });

  it("never sends a card twice, even after its posts are cancelled", async () => {
    await metaOn();
    await settings({ autoPostEnabled: true, autoPublishEnabled: true });
    const card = await plannedCard({ status: "ready" });
    await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    await db
      .update(socialPublicationsTable)
      .set({ status: "cancelled" })
      .where(eq(socialPublicationsTable.draftId, card.id));
    const again = await runPostingSlots(tenantId, new Date(SUNDAY_7PM.getTime() + 600_000), logger);
    expect(again.published).toBe(0);
    expect((await pubsFor(card.id)).filter((p) => p.status !== "cancelled")).toHaveLength(0);
  });

  it("does it once when two runs overlap", async () => {
    await metaOn();
    await settings({ autoPostEnabled: true, autoPublishEnabled: true });
    const card = await plannedCard({ status: "ready" });
    const [a, b] = await Promise.all([
      runPostingSlots(tenantId, SUNDAY_7PM, logger),
      runPostingSlots(tenantId, SUNDAY_7PM, logger),
    ]);
    expect(a.published + b.published).toBe(1);
    expect(await pubsFor(card.id)).toHaveLength(2);
  });
});

describe("an unapproved card at its time", () => {
  it("rolls to its kind's next slot and reminds the admin, then expires (AE5)", async () => {
    const card = await plannedCard();
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.rolled).toBe(1);
    const after = await load(card.id);
    expect(after.plannedAt?.getTime()).toBe(WEDNESDAY_6PM.getTime());
    expect(after.rollCount).toBe(1);
    expect(after.autoReadyAt?.getTime()).toBe(WEDNESDAY_6PM.getTime());
    const rolled = await notices("cards_rolled");
    expect(rolled).toHaveLength(1);
    expect(rolled[0].payload).toEqual({ rolled: [card.id], overdue: [] });

    // Imported Saturday the 17th; seven days later it's past the age limit.
    const late = await runPostingSlots(tenantId, perth("2026-10-25T09:00"), logger);
    expect(late.expired).toBe(1);
    expect((await load(card.id)).expiredAt).not.toBeNull();
  });

  it("stops reminding after three rolls", async () => {
    const card = await plannedCard({ rollCount: MAX_ROLL_REMINDERS });
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r.rolled).toBe(1);
    expect((await load(card.id)).rollCount).toBe(MAX_ROLL_REMINDERS + 1);
    expect(await notices("cards_rolled")).toHaveLength(0);
  });

  it("leaves a card the admin pinned where it is, overdue, reminded once", async () => {
    const card = await plannedCard({ plannedBy: "admin" });
    const first = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    const second = await runPostingSlots(tenantId, perth("2026-10-18T20:00"), logger);
    expect(first.overdue).toBe(1);
    expect(second.overdue).toBe(0);
    const after = await load(card.id);
    expect(after.plannedAt?.getTime()).toBe(SUNDAY_6PM.getTime());
    expect(after.overdueNotifiedAt).not.toBeNull();
    const rolled = await notices("cards_rolled");
    expect(rolled).toHaveLength(1);
    expect(rolled[0].payload).toEqual({ rolled: [], overdue: [card.id] });
  });

  it("never expires a pinned card", async () => {
    const card = await plannedCard({ plannedBy: "admin", plannedAt: perth("2026-10-30T18:00") });
    const r = await runPostingSlots(tenantId, perth("2026-10-28T09:00"), logger);
    expect(r.expired).toBe(0);
    expect((await load(card.id)).expiredAt).toBeNull();
  });
});

describe("the rest of the calendar", () => {
  it("doesn't move other cards when one is dismissed (AE10)", async () => {
    const keep = await plannedCard({ status: "ready", plannedAt: perth("2026-10-21T18:00") });
    const gone = await plannedCard({ status: "ready", plannedAt: perth("2026-10-18T18:00") });
    await db
      .update(socialDraftsTable)
      .set({ status: "dismissed" })
      .where(eq(socialDraftsTable.id, gone.id));
    await runPostingSlots(tenantId, perth("2026-10-17T21:00"), logger);
    expect((await load(keep.id)).plannedAt?.getTime()).toBe(perth("2026-10-21T18:00").getTime());
  });

  it("places a generated card that has no time yet", async () => {
    const card = await plannedCard({ plannedAt: null, plannedBy: null });
    const r = await runPostingSlots(tenantId, perth("2026-10-17T21:00"), logger);
    expect(r.placed).toBe(1);
    expect((await load(card.id)).plannedAt?.getTime()).toBe(SUNDAY_6PM.getTime());
  });

  it("does nothing for a club without the calendar", async () => {
    await settings({ postingSchedule: null });
    const card = await plannedCard({ status: "ready" });
    const r = await runPostingSlots(tenantId, SUNDAY_7PM, logger);
    expect(r).toEqual({
      placed: 0,
      expired: 0,
      promoted: 0,
      published: 0,
      nudged: 0,
      rolled: 0,
      overdue: 0,
    });
    expect((await load(card.id)).dispatchedAt).toBeNull();
  });

  it("never promotes an expired card through auto-post", async () => {
    await settings({ autoPostEnabled: true });
    const card = await plannedCard({ expiredAt: new Date() });
    expect(await persistDueDrafts(tenantId, SUNDAY_7PM)).not.toContain(card.id);
  });
});
