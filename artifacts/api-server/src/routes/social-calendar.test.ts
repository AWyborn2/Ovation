/**
 * Posting calendar U5 — the calendar read, moving and unscheduling cards, the
 * settings switch-over and the draft actions that reset timing. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  socialSettingsTable,
  socialDraftsTable,
  socialPublicationsTable,
  notificationsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { clubDate } from "../lib/posting-schedule";

const STAMP = Date.now();
const DAY = 24 * 60 * 60 * 1000;
let tenantId: number;
let otherTenantId: number;
let adminId: number;
let cookie: string;

// Every kind posts on Sunday and Wednesday at 6pm; one card per slot for milestones.
const slots = [
  { day: 0, time: "18:00" },
  { day: 3, time: "18:00" },
];
const SCHEDULE = {
  enabled: true,
  dailyCap: 2,
  minGapMinutes: 45,
  ageLimitDays: 7,
  kinds: Object.fromEntries(
    ["results", "roundResults", "teamLists", "gameDay", "milestones", "debuts", "achievements", "roundUp", "other"].map(
      (k) => [k, { slots, collision: k === "milestones" ? "roll" : "space" }],
    ),
  ),
};

const api = (method: "get" | "put" | "post" | "patch", path: string) =>
  request(app)[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));

/** A future time on a whole quarter hour, `days` from now, club time 10:00. */
function future(days: number, hour = 10): Date {
  const key = clubDate(new Date(Date.now() + days * DAY)).key;
  return new Date(`${key}T${String(hour).padStart(2, "0")}:00:00+08:00`);
}

async function card(over: Partial<typeof socialDraftsTable.$inferInsert> = {}) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "milestone",
      family: "achievements",
      status: "ready",
      cardInput: { kind: "milestone" },
      sourceImportedAt: new Date(),
      ...over,
    })
    .returning();
  return row;
}

const load = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

async function setSchedule(schedule: object | null) {
  await db
    .update(socialSettingsTable)
    .set({ postingSchedule: schedule })
    .where(eq(socialSettingsTable.tenantId, tenantId));
}

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `calendar-${STAMP}`, centralClubId: 98607, name: "Calendar", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `calendar-o-${STAMP}`, centralClubId: 98608, name: "Other", plan: "pro" })
    .returning();
  otherTenantId = o.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `calendar_${STAMP}`, displayName: "C", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values([
    { tenantId, postingSchedule: SCHEDULE },
    { tenantId: otherTenantId, postingSchedule: SCHEDULE },
  ]);
});

afterAll(async () => {
  const ids = [tenantId, otherTenantId];
  await db.delete(notificationsTable).where(inArray(notificationsTable.tenantId, ids));
  await db.delete(socialPublicationsTable).where(inArray(socialPublicationsTable.tenantId, ids));
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, ids));
  await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, ids));
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, ids));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, ids));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
});

beforeEach(async () => {
  await setSchedule(SCHEDULE);
  await db
    .update(socialSettingsTable)
    .set({ autoPostEnabled: false, autoPublishEnabled: false, roundSchedules: null })
    .where(eq(socialSettingsTable.tenantId, tenantId));
  await db
    .delete(socialPublicationsTable)
    .where(inArray(socialPublicationsTable.tenantId, [tenantId, otherTenantId]));
  await db
    .delete(socialDraftsTable)
    .where(inArray(socialDraftsTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
});

describe("GET /social-calendar", () => {
  it("lists planned cards, the tray and the day's count, never another club's", async () => {
    const at = future(2);
    const planned = await card({ plannedAt: at, plannedBy: "auto" });
    const tray = await card({ status: "awaiting_review" });
    await db.insert(socialDraftsTable).values({
      tenantId: otherTenantId,
      engine: "milestone",
      status: "ready",
      cardInput: { kind: "milestone" },
      plannedAt: at,
      plannedBy: "auto",
    });
    const day = clubDate(at).key;
    const res = await api("get", `/social-calendar?from=${day}&to=${day}`).expect(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.cards.map((c: { draft: { id: number } }) => c.draft.id)).toEqual([planned.id]);
    expect(res.body.cards[0].slotKind).toBe("milestones");
    expect(res.body.unscheduled.map((c: { draft: { id: number } }) => c.draft.id)).toEqual([
      tray.id,
    ]);
    expect(res.body.days).toEqual([{ date: day, count: 1, overCap: false, gapWarnings: [] }]);
  });

  it("shows a placeholder for a round card not drafted yet (AE7)", async () => {
    // A fixture five days out; team lists post on a Sunday or Wednesday slot before it.
    await db.insert(fixturesTable).values({
      tenantId,
      grade: "A Grade",
      startAt: new Date(Date.now() + 5 * DAY),
      opponentName: "Rivals",
    });
    const from = clubDate(new Date()).key;
    const to = clubDate(new Date(Date.now() + 6 * DAY)).key;
    const res = await api("get", `/social-calendar?from=${from}&to=${to}`).expect(200);
    const kinds = res.body.placeholders.map((p: { slotKind: string }) => p.slotKind);
    expect(kinds).toContain("teamLists");
  });

  it("rejects a range longer than 14 days", async () => {
    await api("get", "/social-calendar?from=2026-10-01&to=2026-10-20").expect(400);
  });
});

describe("PUT /social-drafts/:id/planned-time", () => {
  it("pins the card at the new time, snapped to 15 minutes", async () => {
    const c = await card({ plannedAt: future(2), plannedBy: "auto", autoReadyAt: future(2) });
    const target = new Date(future(3, 14).getTime() + 7 * 60_000); // 14:07
    const res = await api("put", `/social-drafts/${c.id}/planned-time`)
      .send({ plannedAt: target.toISOString(), expectedPlannedAt: c.plannedAt?.toISOString() })
      .expect(200);
    const after = await load(c.id);
    expect(after.plannedBy).toBe("admin");
    expect(after.plannedAt?.getTime()).toBe(future(3, 14).getTime());
    expect(after.autoReadyAt?.getTime()).toBe(future(3, 14).getTime());
    expect(res.body.draft.id).toBe(c.id);
  });

  it("allows a move past the cap and says so (AE4)", async () => {
    const day = future(4, 9);
    await card({ plannedAt: day, plannedBy: "auto" });
    await card({ plannedAt: new Date(day.getTime() + 2 * 3_600_000), plannedBy: "auto" });
    const mover = await card({ plannedAt: future(5), plannedBy: "auto" });
    const res = await api("put", `/social-drafts/${mover.id}/planned-time`)
      .send({
        plannedAt: new Date(day.getTime() + 5 * 3_600_000).toISOString(),
        expectedPlannedAt: mover.plannedAt?.toISOString(),
      })
      .expect(200);
    expect(res.body.warning).toMatch(/over the club's cap of 2/);
  });

  it("refuses a stale move with 409 and the card's current place", async () => {
    const c = await card({ plannedAt: future(2), plannedBy: "auto" });
    const res = await api("put", `/social-drafts/${c.id}/planned-time`)
      .send({ plannedAt: future(3).toISOString(), expectedPlannedAt: future(6).toISOString() })
      .expect(409);
    expect(res.body.card.draft.plannedAt).toBe(c.plannedAt?.toISOString());
  });

  it("refuses a card that is already going out", async () => {
    const c = await card({ plannedAt: future(2), plannedBy: "auto" });
    await db.insert(socialPublicationsTable).values({
      tenantId,
      draftId: c.id,
      platform: "facebook",
      postType: "feed",
      origin: "auto",
      status: "publishing",
      scheduledFor: future(2),
      nextAttemptAt: future(2),
    });
    await api("put", `/social-drafts/${c.id}/planned-time`)
      .send({ plannedAt: future(3).toISOString(), expectedPlannedAt: c.plannedAt?.toISOString() })
      .expect(409);
  });

  it("refuses a time that has passed", async () => {
    const c = await card({ plannedAt: future(2), plannedBy: "auto" });
    await api("put", `/social-drafts/${c.id}/planned-time`)
      .send({
        plannedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        expectedPlannedAt: c.plannedAt?.toISOString(),
      })
      .expect(400);
  });

  it("moves the card's scheduled posts with it", async () => {
    const c = await card({ plannedAt: future(2), plannedBy: "admin", dispatchedAt: new Date() });
    await db.insert(socialPublicationsTable).values({
      tenantId,
      draftId: c.id,
      platform: "facebook",
      postType: "feed",
      origin: "manual",
      status: "scheduled",
      scheduledFor: future(2),
      nextAttemptAt: future(2),
    });
    await api("put", `/social-drafts/${c.id}/planned-time`)
      .send({ plannedAt: future(3).toISOString(), expectedPlannedAt: c.plannedAt?.toISOString() })
      .expect(200);
    const [pub] = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.draftId, c.id));
    expect(pub.scheduledFor.getTime()).toBe(future(3).getTime());
    expect(pub.nextAttemptAt.getTime()).toBe(future(3).getTime());
  });

  it("revives an expired card as a pin", async () => {
    const c = await card({ plannedAt: null, plannedBy: null, expiredAt: new Date() });
    await api("post", `/social-drafts/${c.id}/approve`).expect(409);
    await api("put", `/social-drafts/${c.id}/planned-time`)
      .send({ plannedAt: future(2).toISOString(), expectedPlannedAt: null })
      .expect(200);
    const after = await load(c.id);
    expect(after.expiredAt).toBeNull();
    expect(after.plannedBy).toBe("admin");
  });

  it("404s another club's card", async () => {
    const [theirs] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: otherTenantId,
        engine: "milestone",
        status: "ready",
        cardInput: { kind: "milestone" },
      })
      .returning();
    await api("put", `/social-drafts/${theirs.id}/planned-time`)
      .send({ plannedAt: future(2).toISOString(), expectedPlannedAt: null })
      .expect(404);
  });
});

describe("POST /social-drafts/:id/unschedule", () => {
  it("puts the card in the tray, cancels its posts, and the sweep leaves it there", async () => {
    const c = await card({ plannedAt: future(2), plannedBy: "auto" });
    const other = await card({ plannedAt: future(3), plannedBy: "auto" });
    await db.insert(socialPublicationsTable).values({
      tenantId,
      draftId: c.id,
      platform: "facebook",
      postType: "feed",
      origin: "manual",
      status: "scheduled",
      scheduledFor: future(2),
      nextAttemptAt: future(2),
    });
    await api("post", `/social-drafts/${c.id}/unschedule`)
      .send({ expectedPlannedAt: c.plannedAt?.toISOString() })
      .expect(200);
    const after = await load(c.id);
    expect(after.plannedAt).toBeNull();
    expect(after.plannedBy).toBe("admin");
    const [pub] = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.draftId, c.id));
    expect(pub.status).toBe("cancelled");
    expect((await load(other.id)).plannedAt?.getTime()).toBe(other.plannedAt?.getTime());

    const { runPostingSlots } = await import("../lib/posting-slots");
    const { logger } = await import("../lib/logger");
    await runPostingSlots(tenantId, new Date(), logger);
    expect((await load(c.id)).plannedAt).toBeNull();
  });
});

describe("settings switch-over", () => {
  it("places open cards when the calendar is turned on, pinning scheduled ones", async () => {
    await setSchedule(null);
    const open = await card({ status: "awaiting_review", autoReadyAt: new Date() });
    const scheduled = await card({ status: "ready" });
    await db.insert(socialPublicationsTable).values({
      tenantId,
      draftId: scheduled.id,
      platform: "facebook",
      postType: "feed",
      origin: "auto",
      status: "scheduled",
      scheduledFor: future(1),
      nextAttemptAt: future(1),
    });
    const handMade = await card({ engine: "adhoc", status: "awaiting_review" });

    const before = await api("get", "/social-calendar?from=2026-10-15&to=2026-10-16").expect(200);
    expect(before.body.openCards).toBe(2);

    const res = await api("patch", "/social-settings")
      .send({ postingSchedule: { enabled: true } })
      .expect(200);
    expect(res.body.postingSchedule.enabled).toBe(true);
    expect(res.body.postingSwitchover).toEqual({ placed: 1, pinned: 1, unscheduled: 0, restored: 0 });
    const o = await load(open.id);
    expect(o.plannedBy).toBe("auto");
    expect(o.autoReadyAt?.getTime()).toBe(o.plannedAt?.getTime());
    const s = await load(scheduled.id);
    expect(s.plannedBy).toBe("admin");
    expect(s.dispatchedAt).not.toBeNull();
    expect((await load(handMade.id)).plannedAt).toBeNull();
  });

  it("hands automatic cards back to auto-post when it is turned off", async () => {
    const owned = await card({ status: "awaiting_review", plannedAt: future(2), plannedBy: "auto", autoReadyAt: future(2) });
    const sentBack = await card({ status: "awaiting_review", plannedAt: future(3), plannedBy: "auto", autoReadyAt: null });
    const res = await api("patch", "/social-settings")
      .send({ postingSchedule: { enabled: false } })
      .expect(200);
    expect(res.body.postingSwitchover.restored).toBe(1);
    const o = await load(owned.id);
    expect(o.autoReadyAt?.getTime()).toBe(o.sourceImportedAt!.getTime() + 12 * 3_600_000);
    expect((await load(sentBack.id)).autoReadyAt).toBeNull();
  });

  it("starts a first switch-on from the club's round-card times", async () => {
    await setSchedule(null);
    await db
      .update(socialSettingsTable)
      .set({ roundSchedules: { teamLists: { mode: "perRound", day: 5, hour: 9 } } })
      .where(eq(socialSettingsTable.tenantId, tenantId));
    const res = await api("patch", "/social-settings")
      .send({ postingSchedule: { enabled: true } })
      .expect(200);
    expect(res.body.postingSchedule.kinds.teamLists.slots).toEqual([{ day: 5, time: "09:00" }]);
  });

  it("rejects an invalid schedule", async () => {
    await api("patch", "/social-settings")
      .send({ postingSchedule: { dailyCap: 0 } })
      .expect(400);
  });
});

describe("draft actions reset timing", () => {
  it("send-back clears the sent mark and places an automatic card again", async () => {
    const c = await card({
      status: "ready",
      plannedAt: new Date(Date.now() - 3_600_000),
      plannedBy: "auto",
      dispatchedAt: new Date(),
    });
    await api("post", `/social-drafts/${c.id}/send-back`).expect(200);
    const after = await load(c.id);
    expect(after.dispatchedAt).toBeNull();
    expect(after.plannedAt!.getTime()).toBeGreaterThan(Date.now());
    // Sent back: it waits for the admin instead of auto-approving.
    expect(after.autoReadyAt).toBeNull();
  });

  it("excludes expired cards from the pending count", async () => {
    await card({ status: "awaiting_review", expiredAt: new Date() });
    const live = await card({ status: "awaiting_review" });
    const res = await api("get", "/social-drafts/pending-count").expect(200);
    expect(res.body.count).toBe(1);
    expect(live.id).toBeGreaterThan(0);
  });
});
