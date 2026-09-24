/**
 * Social Studio automation U1 — draft model v2: normalised states, transition
 * guards, send back / reopen, and revision history with revert. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, socialDraftsTable, trackedLinksTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { MAX_DRAFT_REVISIONS, draftRevisionIds, recordDraftRevision } from "../lib/draft-revisions";

const STAMP = Date.now();

let tenantId: number;
let otherTenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-drafts-v2";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `drafts-v2-${STAMP}`,
      centralClubId: 9911,
      name: "Drafts V2 Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `drafts-v2-other-${STAMP}`,
      centralClubId: 9912,
      name: "Other Club",
      plan: "pro",
    })
    .returning();
  otherTenantId = o.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId,
      username: `drafts_v2_${STAMP}`,
      displayName: "Drafts Admin",
      passwordHash: "x",
    })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  // Approving a draft mints a tracked link for the tenant.
  await db
    .delete(trackedLinksTable)
    .where(inArray(trackedLinksTable.tenantId, [tenantId, otherTenantId]));
  await db
    .delete(socialDraftsTable)
    .where(inArray(socialDraftsTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

const api = (method: "get" | "post", path: string) =>
  request(app)[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));

async function makeDraft(status: string, tenant = tenantId) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId: tenant,
      engine: "ondemand",
      status,
      cardInput: { kind: "record", title: `Card ${status} ${Math.random()}` },
      appPath: "/records",
    })
    .returning();
  return row;
}

const CONTRACT_SQL = readFileSync(
  path.resolve(__dirname, "../../../../lib/db/migrations/0013_social_drafts_status_contract.sql"),
  "utf8",
);

describe("draft states", () => {
  it("the database refuses the retired pending/approved values (U25)", async () => {
    await expect(makeDraft("pending")).rejects.toThrow();
    await expect(makeDraft("approved")).rejects.toThrow();
    const d = await makeDraft("awaiting_review");
    expect(d.status).toBe("awaiting_review");
  });

  it("the contract migration rewrites legacy rows, so the queue lists the same drafts", async () => {
    class Rollback extends Error {}
    const seen: Record<string, string> = {};
    await db
      .transaction(async (tx) => {
        // Recreate the pre-contract table state inside a transaction.
        await tx.execute(
          sql.raw(`ALTER TABLE "social_drafts" DROP CONSTRAINT "social_drafts_status_check"`),
        );
        const rows = await tx
          .insert(socialDraftsTable)
          .values(
            ["pending", "approved", "awaiting_review", "ready"].map((status) => ({
              tenantId,
              engine: "ondemand",
              status,
              cardInput: { kind: "record", title: `Contract ${status}` },
              appPath: "/records",
            })),
          )
          .returning();
        for (const stmt of CONTRACT_SQL.split("--> statement-breakpoint")) {
          if (stmt.trim()) await tx.execute(sql.raw(stmt));
        }
        const after = await tx
          .select()
          .from(socialDraftsTable)
          .where(
            inArray(
              socialDraftsTable.id,
              rows.map((row) => row.id),
            ),
          );
        for (const row of after) {
          seen[(row.cardInput as { title: string }).title] = row.status;
        }
        const legacy = await tx.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM social_drafts WHERE status IN ('pending', 'approved')`,
        );
        expect(Number(legacy.rows[0].n)).toBe(0);
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
    // What the queue showed for each legacy row is what it now stores.
    expect(seen).toEqual({
      "Contract pending": "awaiting_review",
      "Contract approved": "ready",
      "Contract awaiting_review": "awaiting_review",
      "Contract ready": "ready",
    });
  });

  it("filters by status", async () => {
    const current = await makeDraft("awaiting_review");
    const ready = await makeDraft("ready");
    const res = await api("get", "/social-drafts?status=awaiting_review");
    const ids = res.body.map((d: { id: number }) => d.id);
    expect(ids).toContain(current.id);
    expect(ids).not.toContain(ready.id);
    expect((await api("get", "/social-drafts?status=bogus")).status).toBe(400);
  });

  it("new drafts carry no auto-ready time", async () => {
    const d = await makeDraft("awaiting_review");
    expect(d.autoReadyAt).toBeNull();
  });

  it("counts awaiting-review drafts", async () => {
    const before = (await api("get", "/social-drafts/pending-count")).body.count;
    await makeDraft("awaiting_review");
    await makeDraft("awaiting_review");
    const after = (await api("get", "/social-drafts/pending-count")).body.count;
    expect(after - before).toBe(2);
  });
});

describe("transitions", () => {
  it("awaiting review → ready → sent back → ready → posted", async () => {
    const d = await makeDraft("awaiting_review");
    await db
      .update(socialDraftsTable)
      .set({ autoReadyAt: new Date(Date.now() - 60_000) })
      .where(eq(socialDraftsTable.id, d.id));

    const ready = await api("post", `/social-drafts/${d.id}/approve`);
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");

    const back = await api("post", `/social-drafts/${d.id}/send-back`);
    expect(back.status).toBe(200);
    expect(back.body.status).toBe("awaiting_review");
    expect(back.body.autoReadyAt).toBeNull();

    expect((await api("post", `/social-drafts/${d.id}/send-back`)).status).toBe(409);

    await api("post", `/social-drafts/${d.id}/approve`);
    const posted = await api("post", `/social-drafts/${d.id}/posted`);
    expect(posted.body.status).toBe("posted");
    expect((await api("post", `/social-drafts/${d.id}/approve`)).status).toBe(409);
  });

  it("dismiss → reopen returns to review; reopen elsewhere is 409", async () => {
    const d = await makeDraft("ready");
    expect((await api("post", `/social-drafts/${d.id}/reopen`)).status).toBe(409);
    expect((await api("post", `/social-drafts/${d.id}/dismiss`)).status).toBe(204);
    expect((await api("post", `/social-drafts/${d.id}/posted`)).status).toBe(409);
    const reopened = await api("post", `/social-drafts/${d.id}/reopen`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("awaiting_review");
    expect(reopened.body.autoReadyAt).toBeNull();
  });

  it("returns 404 for another tenant's draft on every route", async () => {
    const foreign = await makeDraft("awaiting_review", otherTenantId);
    for (const path of ["approve", "send-back", "posted", "dismiss", "reopen"]) {
      expect((await api("post", `/social-drafts/${foreign.id}/${path}`)).status).toBe(404);
    }
    expect((await api("get", `/social-drafts/${foreign.id}/revisions`)).status).toBe(404);
  });
});

describe("revisions", () => {
  it("revert restores content and keeps the replaced version as a revision", async () => {
    const d = await makeDraft("awaiting_review");
    await recordDraftRevision(d, "refresh");
    const [edited] = await db
      .update(socialDraftsTable)
      .set({ cardInput: { kind: "record", title: "Corrected" }, caption: "new caption" })
      .where(eq(socialDraftsTable.id, d.id))
      .returning();

    const list = await api("get", `/social-drafts/${d.id}/revisions`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const res = await api("post", `/social-drafts/${d.id}/revisions/${list.body[0].id}/revert`);
    expect(res.status).toBe(200);
    expect(res.body.cardInput).toEqual(d.cardInput);
    expect(res.body.caption).toBeNull();

    const after = await api("get", `/social-drafts/${d.id}/revisions`);
    expect(after.body).toHaveLength(2);
    expect(after.body[0].reason).toBe("revert");
    expect(after.body[0].cardInput).toEqual(edited.cardInput);
  });

  it(`keeps only the newest ${MAX_DRAFT_REVISIONS} revisions`, async () => {
    const d = await makeDraft("awaiting_review");
    for (let i = 0; i < MAX_DRAFT_REVISIONS + 1; i++) await recordDraftRevision(d, "edit");
    const ids = await draftRevisionIds(d.id);
    expect(ids).toHaveLength(MAX_DRAFT_REVISIONS);
  });

  it("a revision id from another draft is 404", async () => {
    const a = await makeDraft("awaiting_review");
    const b = await makeDraft("awaiting_review");
    await recordDraftRevision(a, "edit");
    const [revA] = await draftRevisionIds(a.id);
    expect((await api("post", `/social-drafts/${b.id}/revisions/${revA}/revert`)).status).toBe(404);
  });
});
