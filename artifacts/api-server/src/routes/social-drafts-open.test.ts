/**
 * GET /social-drafts?open=true (retest 9, Your designs): only the queue's open
 * drafts come back, awaiting review and ready (including one auto-post reads
 * as ready), never posted or dismissed ones, and only the tenant's own. Without
 * the flag the list is unchanged. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialDraftsTable,
  socialSettingsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];

async function makeTenant(n: number) {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `open-drafts-${n}-${STAMP}`,
      centralClubId: 9940 + n,
      name: "Open Drafts Club",
      plan: "pro",
    })
    .returning();
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: t.id,
      username: `opendr${n}_${STAMP}`,
      displayName: "A",
      passwordHash: "x",
    })
    .returning();
  tenantIds.push(t.id);
  adminIds.push(admin.id);
  cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
}

const draft = (tenantId: number, status: string, tag: string, extra: object = {}) => ({
  tenantId,
  engine: "milestone",
  status,
  cardInput: { kind: "milestone", tag },
  ...extra,
});

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-open-drafts";
  await makeTenant(1);
  await makeTenant(2);
  await db.insert(socialSettingsTable).values({ tenantId: tenantIds[0], autoPostEnabled: true });
  await db.insert(socialDraftsTable).values([
    draft(tenantIds[0], "awaiting_review", "waiting"),
    draft(tenantIds[0], "ready", "ready"),
    // Past its auto-post deadline: reads as ready.
    draft(tenantIds[0], "awaiting_review", "auto-ready", {
      autoReadyAt: new Date(Date.now() - 60_000),
    }),
    draft(tenantIds[0], "posted", "posted"),
    draft(tenantIds[0], "dismissed", "dismissed"),
    draft(tenantIds[1], "awaiting_review", "other-club"),
  ]);
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenantIds));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
});

const list = (query: string) =>
  request(app)
    .get(`/api/social-drafts${query}`)
    .set("Cookie", cookies[0])
    .set("x-tenant-id", String(tenantIds[0]));

const tags = (body: { cardInput: { tag: string } }[]) => body.map((d) => d.cardInput.tag).sort();

describe("GET /social-drafts?open=true", () => {
  it("returns only awaiting review and ready drafts, the tenant's own", async () => {
    const res = await list("?open=true");
    expect(res.status).toBe(200);
    expect(tags(res.body)).toEqual(["auto-ready", "ready", "waiting"]);
    const byTag = new Map(
      (res.body as { cardInput: { tag: string }; status: string }[]).map((d) => [
        d.cardInput.tag,
        d.status,
      ]),
    );
    expect(byTag.get("auto-ready")).toBe("ready");
  });

  it("combines with a status filter", async () => {
    const res = await list("?open=true&status=ready");
    expect(res.status).toBe(200);
    expect(tags(res.body)).toEqual(["auto-ready", "ready"]);
    const none = await list("?open=true&status=posted");
    expect(none.body).toEqual([]);
  });

  it("leaves the full list as it was without the flag, or with open=false", async () => {
    const all = ["auto-ready", "dismissed", "posted", "ready", "waiting"];
    expect(tags((await list("")).body)).toEqual(all);
    expect(tags((await list("?open=false")).body)).toEqual(all);
  });

  it("refuses an open value that isn't true or false", async () => {
    const res = await list("?open=yes");
    expect(res.status).toBe(400);
  });
});
