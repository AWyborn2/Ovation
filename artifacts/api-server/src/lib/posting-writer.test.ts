/**
 * Posting calendar U3 — placing cards when they're drafted, under the tenant
 * lock. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  socialDraftsTable,
  socialPublicationsTable,
  socialSettingsTable,
} from "@workspace/db";
import type * as WriterModule from "./posting-writer";
import { upsertDraftByKey, withdrawDraft } from "./draft-upsert";
import { clubDate } from "./posting-schedule";
import { placeDraft } from "./posting-writer";
import { schedulePublications } from "./publishing/publications";

const failPlacement = vi.hoisted(() => ({ on: false }));
vi.mock("./posting-writer", async (importOriginal) => {
  const actual = await importOriginal<typeof WriterModule>();
  return {
    ...actual,
    placeDraft: async (...args: Parameters<typeof actual.placeDraft>) => {
      if (failPlacement.on) throw new Error("placement down (test)");
      return actual.placeDraft(...args);
    },
  };
});

const STAMP = Date.now();
const perth = (local: string) => new Date(`${local}:00+08:00`);
let calendarTenant: number;
let plainTenant: number;
let otherTenant: number;
let seq = 0;

const SCHEDULE = {
  enabled: true,
  dailyCap: 4,
  minGapMinutes: 45,
  ageLimitDays: 7,
  kinds: {
    milestones: { slots: [{ day: 0, time: "18:00" }], collision: "space" as const },
    debuts: {
      slots: [
        { day: 0, time: "18:00" },
        { day: 3, time: "18:00" },
      ],
      collision: "roll" as const,
    },
  },
};

async function makeTenant(slug: string, schedule: object | null): Promise<number> {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `${slug}-${STAMP}`, centralClubId: 9800 + seq++, name: slug, plan: "pro" })
    .returning();
  await db.insert(socialSettingsTable).values({ tenantId: t.id, postingSchedule: schedule });
  return t.id;
}

function draftFor(tenantId: number, kind: string, key: string, extra: object = {}) {
  return upsertDraftByKey({
    tenantId,
    engine: "milestone",
    family: "achievements",
    sourceKey: `${kind}:${key}:${STAMP}`,
    cardInput: { kind, playerName: `Player ${key}`, ...extra },
    appPath: `/players/${key}`,
  });
}

/** A bare draft row (no enrichment), for placement-only tests. */
async function rawDraft(tenantId: number, kind: string, importedAt: Date): Promise<number> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "milestone",
      family: "achievements",
      status: "awaiting_review",
      cardInput: { kind },
      sourceImportedAt: importedAt,
      autoReadyAt: importedAt,
    })
    .returning();
  return row.id;
}

const loadDraft = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

beforeAll(async () => {
  calendarTenant = await makeTenant("cal", SCHEDULE);
  plainTenant = await makeTenant("plain", null);
  otherTenant = await makeTenant("other", SCHEDULE);
});

afterAll(async () => {
  const ids = [calendarTenant, plainTenant, otherTenant];
  await db.delete(socialPublicationsTable).where(inArray(socialPublicationsTable.tenantId, ids));
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, ids));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, ids));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
});

describe("placing new drafts", () => {
  it("gives a calendar club's new milestone its Sunday 6pm slot", async () => {
    const { action, draft } = await draftFor(calendarTenant, "milestone", "a");
    expect(action).toBe("inserted");
    expect(draft.plannedBy).toBe("auto");
    expect(draft.plannedAt).not.toBeNull();
    const local = clubDate(draft.plannedAt as Date);
    expect(local.weekday).toBe(0);
    expect(local.minutes).toBeGreaterThanOrEqual(18 * 60);
    // The slot is the one clock: auto-approval follows the planned time.
    expect(draft.autoReadyAt?.getTime()).toBe(draft.plannedAt?.getTime());
  });

  it("leaves a club without the calendar exactly as before (AE11)", async () => {
    const { draft } = await draftFor(plainTenant, "milestone", "b");
    expect(draft.plannedAt).toBeNull();
    expect(draft.plannedBy).toBeNull();
    expect(draft.autoReadyAt).not.toBeNull();
  });

  it("keeps the planned time when a refresh changes the card's data", async () => {
    const { draft } = await draftFor(calendarTenant, "milestone", "c");
    const pinned = perth("2026-10-21T09:00");
    await db
      .update(socialDraftsTable)
      .set({ plannedAt: pinned, plannedBy: "admin" })
      .where(eq(socialDraftsTable.id, draft.id));
    const again = await draftFor(calendarTenant, "milestone", "c", { value: 1001 });
    expect(again.action).toBe("refreshed");
    expect(again.draft.plannedAt?.getTime()).toBe(pinned.getTime());
    expect(again.draft.plannedBy).toBe("admin");
  });

  it("leaves the draft created and unscheduled when placement fails", async () => {
    failPlacement.on = true;
    try {
      const { action, draft } = await draftFor(calendarTenant, "milestone", "d");
      expect(action).toBe("inserted");
      expect(draft.plannedAt).toBeNull();
      expect((await loadDraft(draft.id)).status).toBe("awaiting_review");
    } finally {
      failPlacement.on = false;
    }
  });
});

describe("placeDraft", () => {
  it("puts two debuts drafted at once in different 'roll' slots", async () => {
    // A week no other test uses: Saturday 5 Dec, so Sunday 6 and Wednesday 9.
    const now = perth("2026-12-05T12:00");
    const a = await rawDraft(calendarTenant, "debut", now);
    const b = await rawDraft(calendarTenant, "debut", now);
    const [pa, pb] = await Promise.all([
      placeDraft(calendarTenant, a, now),
      placeDraft(calendarTenant, b, now),
    ]);
    const times = [pa?.getTime(), pb?.getTime()].sort();
    expect(times).toEqual(
      [perth("2026-12-06T18:00").getTime(), perth("2026-12-09T18:00").getTime()].sort(),
    );
  });

  it("never counts another club's cards toward the cap", async () => {
    const now = perth("2026-11-14T12:00"); // a Saturday; Sunday is the 15th
    for (const t of ["10:00", "12:00", "14:00", "16:00"]) {
      const id = await rawDraft(otherTenant, "milestone", now);
      await db
        .update(socialDraftsTable)
        .set({ plannedAt: perth(`2026-11-15T${t}`), plannedBy: "auto" })
        .where(eq(socialDraftsTable.id, id));
    }
    const mine = await rawDraft(calendarTenant, "milestone", now);
    expect(await placeDraft(calendarTenant, mine, now)).toEqual(perth("2026-11-15T18:00"));
  });

  it("returns null for a club without the calendar", async () => {
    const id = await rawDraft(plainTenant, "milestone", new Date());
    expect(await placeDraft(plainTenant, id)).toBeNull();
    expect((await loadDraft(id)).plannedAt).toBeNull();
  });
});

describe("withdrawing a planned draft", () => {
  it("cancels its scheduled posts", async () => {
    const { draft } = await draftFor(calendarTenant, "milestone", "w");
    await schedulePublications({
      tenantId: calendarTenant,
      draftId: draft.id,
      platforms: ["facebook"],
      postTypes: ["feed"],
      at: perth("2026-12-20T18:00"),
      origin: "auto",
    });
    expect(await withdrawDraft(draft)).toBe("dismissed");
    const pubs = await db
      .select()
      .from(socialPublicationsTable)
      .where(
        and(
          eq(socialPublicationsTable.tenantId, calendarTenant),
          eq(socialPublicationsTable.draftId, draft.id),
        ),
      );
    expect(pubs.map((p) => p.status)).toEqual(["cancelled"]);
  });
});
