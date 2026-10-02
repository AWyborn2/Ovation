// PlayHQ sync watchdog, platform health view and club status (sync plan U8/U9).
//
// One incident, end to end, on a real database: a failed run opens it (platform email,
// one tenant notification + the club's email), repeating the watchdog changes nothing, the
// platform and club views show it, and a good run resolves it (one recovery email, the
// tenant notification marked read). `playhq.*` is read through the real playhq_ingest
// role, as in production; setup writes go through the tenant pool (same DB in CI).
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  notificationsTable,
  platformAdminsTable,
  playhqSyncIncidentsTable,
  socialSettingsTable,
  tenantsTable,
} from "@workspace/db";
import { closePlayhqIngestPool } from "@workspace/db/playhq-ingest";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const SECRET = "test-playhq-watchdog-secret";
const ORG = randomUUID();
const STAMP = Date.now();
const PLATFORM_EMAIL = `alerts+${STAMP}@example.com`;
const CLUB_EMAIL = `club+${STAMP}@example.com`;
const ADMIN_LOGIN = `super-sync+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

const admin = { query: (text: string, params?: unknown[]) => db.$client.query(text, params) };
const sent: EmailMessage[] = [];
let tenantId: number;
let platformCookie: string;
let clubCookie: string;

const watchdog = () =>
  request(app).post("/api/internal/playhq/watchdog").set("x-sync-secret", SECRET);
const addRun = (status: string, planName: string) =>
  admin.query(
    `insert into playhq.scrape_runs (source_file, org_id, collector, plan_name, status)
     values ('watchdog-test', $1, 'gha-headless', $2, $3)`,
    [ORG, planName, status],
  );

beforeAll(async () => {
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-ingest-role.sql"), "utf8"));
  await admin.query(`alter role playhq_ingest with password 'test'`);
  const u = new URL(process.env.CENTRAL_DATABASE_URL!);
  u.username = "playhq_ingest";
  u.password = "test";
  process.env.PLAYHQ_INGEST_DATABASE_URL = u.toString();
  process.env.PLAYHQ_SYNC_SECRET = SECRET;
  process.env.PLATFORM_ALERT_EMAIL = PLATFORM_EMAIL;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-watchdog";
  await closePlayhqIngestPool();
  setEmailTransport(async (m) => {
    sent.push(m);
  });

  await db.delete(tenantsTable).where(eq(tenantsTable.slug, `playhq-watchdog-${STAMP}`));
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `playhq-watchdog-${STAMP}`,
      centralClubId: 9907,
      name: "Watchdog Test Club",
      plan: "pro",
      playhqOrgId: ORG,
      playhqSyncEnabled: true,
    })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({ tenantId, notificationEmail: CLUB_EMAIL });

  const passwordHash = await hashPassword(PASSWORD);
  await db
    .insert(platformAdminsTable)
    .values({ email: ADMIN_LOGIN, displayName: "Super", passwordHash });
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: ADMIN_LOGIN, password: PASSWORD });
  platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];
  const [ca] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `owner_${STAMP}`, displayName: "Club", passwordHash })
    .returning();
  clubCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  setEmailTransport(null);
  await closePlayhqIngestPool();
  await admin.query(`delete from playhq.scrape_runs where org_id = $1`, [ORG]);
  await db.delete(playhqSyncIncidentsTable).where(eq(playhqSyncIncidentsTable.orgId, ORG));
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, ADMIN_LOGIN));
  for (const k of ["PLAYHQ_INGEST_DATABASE_URL", "PLAYHQ_SYNC_SECRET", "PLATFORM_ALERT_EMAIL"])
    delete process.env[k];
});

const staleNotices = () =>
  db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.tenantId, tenantId),
        eq(notificationsTable.kind, "playhq_sync_stale"),
      ),
    );

describe("PlayHQ sync watchdog — one incident end to end", () => {
  it("401s without the sync secret", async () => {
    await request(app).post("/api/internal/playhq/watchdog").expect(401);
  });

  it("opens an incident on a failed run: one platform email, one club notice + email", async () => {
    // A good weekly run first, so only the failure (not an overdue weekly) drives the state.
    await addRun("ok", "weekly");
    await addRun("failed", "matchday");
    sent.length = 0;
    const res = await watchdog().expect(200);
    expect(res.body.opened).toEqual([{ orgId: ORG, kind: "failed", tenants: [tenantId] }]);
    expect(sent.map((m) => m.to).sort()).toEqual([CLUB_EMAIL, PLATFORM_EMAIL].sort());
    expect(sent.find((m) => m.to === PLATFORM_EMAIL)!.subject).toMatch(/PlayHQ sync failed/);
    const notices = await staleNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.readAt).toBeNull();
    expect(notices[0]!.link).toBe("/admin/social/fixtures");
  });

  it("stays quiet while the same incident is open", async () => {
    sent.length = 0;
    const res = await watchdog().expect(200);
    expect(res.body.opened).toEqual([]);
    expect(res.body.resolved).toEqual([]);
    expect(sent).toEqual([]);
    expect(await staleNotices()).toHaveLength(1);
  });

  it("shows the incident on the platform console", async () => {
    const res = await request(app)
      .get("/api/platform/admin/playhq-sync")
      .set("Cookie", platformCookie)
      .expect(200);
    const org = res.body.orgs.find((o: { orgId: string }) => o.orgId === ORG);
    expect(org).toMatchObject({
      state: "failed",
      lastRunStatus: "failed",
      tenants: [expect.objectContaining({ id: tenantId })],
      openIncident: expect.objectContaining({ kind: "failed" }),
    });
  });

  it("refuses the platform view to a club admin", async () => {
    await request(app).get("/api/platform/admin/playhq-sync").set("Cookie", clubCookie).expect(401);
  });

  it("tells the club its fixtures are stale", async () => {
    const res = await request(app)
      .get("/api/admin/playhq-sync/status")
      .set("Cookie", clubCookie)
      .set("x-tenant-id", String(tenantId))
      .expect(200);
    expect(res.body).toMatchObject({ linked: true, syncEnabled: true, stale: true });
    expect(res.body.lastRefreshedAt).not.toBeNull();
  });

  it("resolves on a good run: one recovery email, the club notice marked read", async () => {
    await addRun("ok", "matchday");
    sent.length = 0;
    const res = await watchdog().expect(200);
    expect(res.body.resolved).toEqual([{ orgId: ORG, tenants: [tenantId] }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: PLATFORM_EMAIL });
    expect(sent[0]!.subject).toMatch(/recovered/);
    const notices = await staleNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.readAt).not.toBeNull();

    const status = await request(app)
      .get("/api/admin/playhq-sync/status")
      .set("Cookie", clubCookie)
      .set("x-tenant-id", String(tenantId))
      .expect(200);
    expect(status.body.stale).toBe(false);
  });

  it("ignores a tenant whose sync is switched off", async () => {
    await db
      .update(tenantsTable)
      .set({ playhqSyncEnabled: false })
      .where(eq(tenantsTable.id, tenantId));
    await addRun("failed", "matchday");
    sent.length = 0;
    const res = await watchdog().expect(200);
    expect(res.body.opened.some((o: { orgId: string }) => o.orgId === ORG)).toBe(false);
    expect(sent).toEqual([]);
  });
});
