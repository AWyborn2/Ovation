/**
 * Social Studio U9 — auto-post deadlines, the sweep that stores them, and the
 * notifications they raise (R9, KTD4, KTD5; AE1, AE5, AE6). Real-DB
 * integration test (needs DATABASE_URL); email goes through a stub transport.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialSettingsTable,
  socialDraftsTable,
  notificationsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "./auth";
import { upsertDraftByKey } from "./draft-upsert";
import { effectiveDraftStatus } from "./effective-draft-state";
import { runDraftSweep } from "./draft-sweep";
import { setEmailTransport, type EmailMessage } from "./integrations/email";

const STAMP = Date.now();
const log = { error: () => {}, warn: () => {}, info: () => {} };
let tenantId: number;
let adminId: number;
let cookie: string;
let sent: EmailMessage[] = [];

const api = (method: "get" | "post" | "patch", path: string) => {
  const agent = request(app);
  const req =
    method === "get"
      ? agent.get(`/api${path}`)
      : method === "post"
        ? agent.post(`/api${path}`)
        : agent.patch(`/api${path}`);
  return req.set("Cookie", cookie).set("x-tenant-id", String(tenantId));
};

async function setAutoPost(enabled: boolean) {
  await db
    .update(socialSettingsTable)
    .set({ autoPostEnabled: enabled })
    .where(eq(socialSettingsTable.tenantId, tenantId));
}

async function draftAt(key: string, importedAt: Date) {
  const { draft } = await upsertDraftByKey({
    tenantId,
    engine: "roundup",
    family: "roundup",
    sourceKey: `auto:${STAMP}:${key}`,
    cardInput: { kind: "gradeLeader", playerName: key, value: 1, grade: "A Grade" },
    appPath: "/records",
    sourceImportedAt: importedAt,
  });
  return draft;
}

async function stored(id: number) {
  const [row] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id));
  return row;
}

async function clearNotifications() {
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-auto-post";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `auto-post-${STAMP}`, centralClubId: 9981, name: "Auto Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `auto_${STAMP}`, displayName: "Auto", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values({
    tenantId,
    autoPostEnabled: true,
    autoPostWindowHours: 12,
    notificationEmail: "studio@club.example",
  });
  setEmailTransport(async (m) => {
    sent.push(m);
  });
});

afterEach(() => {
  sent = [];
});

afterAll(async () => {
  setEmailTransport(null);
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("AE1 — the posting window", () => {
  it("imported at 18:00 with a 12h window: awaiting at 05:59, ready at 06:00 by read and sweep, one notice and one email", async () => {
    await clearNotifications();
    const draft = await draftAt("ae1", new Date("2030-03-02T18:00:00Z"));
    expect(new Date(draft.autoReadyAt!).toISOString()).toBe("2030-03-03T06:00:00.000Z");

    const on = { enabled: true };
    expect(effectiveDraftStatus(draft, on, new Date("2030-03-03T05:59:00Z"))).toBe(
      "awaiting_review",
    );
    expect(effectiveDraftStatus(draft, on, new Date("2030-03-03T06:00:00Z"))).toBe("ready");

    await runDraftSweep(
      tenantId,
      { kind: "scheduled", now: new Date("2030-03-03T05:59:00Z") },
      log,
    );
    expect((await stored(draft.id)).status).toBe("awaiting_review");

    const summary = await runDraftSweep(
      tenantId,
      { kind: "scheduled", now: new Date("2030-03-03T06:00:00Z") },
      log,
    );
    expect(summary.promoted).toBeGreaterThanOrEqual(1);
    expect((await stored(draft.id)).status).toBe("ready");
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.tenantId, tenantId));
    expect(notes).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("studio@club.example");
  });

  it("an ad-hoc draft (no import deadline) stays awaiting review past any window", async () => {
    const [adhoc] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "ondemand",
        status: "awaiting_review",
        cardInput: { kind: "record", title: "Hand made" },
        appPath: "/records",
      })
      .returning();
    await runDraftSweep(
      tenantId,
      { kind: "scheduled", now: new Date("2040-01-01T00:00:00Z") },
      log,
    );
    expect((await stored(adhoc.id)).status).toBe("awaiting_review");
  });
});

describe("AE5 — switching auto-post", () => {
  it("on: overdue drafts read as ready at once; off: every draft reading ready is stored as ready", async () => {
    await setAutoPost(false);
    const past = new Date(Date.now() - 48 * 3600_000);
    const drafts = await Promise.all(["a", "b", "c"].map((k) => draftAt(`ae5-${k}`, past)));
    const ids = drafts.map((d) => d.id);
    const statuses = async () =>
      ((await api("get", "/social-drafts")).body as Array<{ id: number; status: string }>)
        .filter((d) => ids.includes(d.id))
        .map((d) => d.status);

    expect(await statuses()).toEqual(["awaiting_review", "awaiting_review", "awaiting_review"]);
    expect((await api("patch", "/social-settings").send({ autoPostEnabled: true })).status).toBe(
      200,
    );
    expect(await statuses()).toEqual(["ready", "ready", "ready"]);
    // Still only read as ready until something stores them.
    expect((await stored(ids[0])).status).toBe("awaiting_review");

    await api("patch", "/social-settings").send({ autoPostEnabled: false });
    for (const id of ids) expect((await stored(id)).status).toBe("ready");
    expect(await statuses()).toEqual(["ready", "ready", "ready"]);
    await setAutoPost(true);
  });
});

describe("AE6 and transitions", () => {
  it("a draft sent back after its deadline stays awaiting review on read and after a sweep", async () => {
    const draft = await draftAt("ae6", new Date(Date.now() - 48 * 3600_000));
    const back = await api("post", `/social-drafts/${draft.id}/send-back`);
    expect(back.status).toBe(200);
    expect(back.body.status).toBe("awaiting_review");
    await runDraftSweep(tenantId, { kind: "scheduled" }, log);
    expect((await stored(draft.id)).status).toBe("awaiting_review");
    const listed = (await api("get", "/social-drafts")).body.find(
      (d: { id: number }) => d.id === draft.id,
    );
    expect(listed.status).toBe("awaiting_review");
  });

  it("marking posted a draft that reads as ready (stored awaiting) succeeds", async () => {
    const draft = await draftAt("post-effective", new Date(Date.now() - 48 * 3600_000));
    const res = await api("post", `/social-drafts/${draft.id}/posted`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("posted");
  });
});

describe("the sweep", () => {
  it("two concurrent sweeps promote each draft once and send one email", async () => {
    await clearNotifications();
    const past = new Date(Date.now() - 48 * 3600_000);
    const drafts = await Promise.all(["x", "y"].map((k) => draftAt(`race-${k}`, past)));
    const [a, b] = await Promise.all([
      runDraftSweep(tenantId, { kind: "scheduled" }, log),
      runDraftSweep(tenantId, { kind: "scheduled" }, log),
    ]);
    expect(a.promoted + b.promoted).toBe(2);
    for (const d of drafts) expect((await stored(d.id)).status).toBe("ready");
    expect(sent).toHaveLength(1);
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.tenantId, tenantId));
    expect(notes).toHaveLength(1);
  });

  it("email failing twice still leaves the drafts ready and the in-app notice present", async () => {
    await clearNotifications();
    let attempts = 0;
    setEmailTransport(async () => {
      attempts++;
      throw new Error("smtp down");
    });
    const draft = await draftAt("email-fail", new Date(Date.now() - 48 * 3600_000));
    await runDraftSweep(tenantId, { kind: "scheduled" }, log);
    expect(attempts).toBe(2);
    expect((await stored(draft.id)).status).toBe("ready");
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(
        and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.kind, "drafts_ready")),
      );
    expect(notes).toHaveLength(1);
    setEmailTransport(async (m) => {
      sent.push(m);
    });
  });
});

describe("notifications API", () => {
  it("shows the unread count, and opening marks them read", async () => {
    const before = await api("get", "/notifications");
    expect(before.status).toBe(200);
    expect(before.body.unreadCount).toBeGreaterThan(0);
    expect(before.body.items[0].link).toMatch(/^\/admin\/social\/queue\?ids=/);

    const after = await api("post", "/notifications/read");
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.items.every((n: { readAt: string | null }) => n.readAt != null)).toBe(true);

    const ids = after.body.items.map((n: { id: number }) => n.id);
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(inArray(notificationsTable.id, ids));
    expect(rows.every((r) => r.readAt != null)).toBe(true);
  });
});
