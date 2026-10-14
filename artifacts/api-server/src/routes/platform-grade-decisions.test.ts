// Platform-admin decisions about PlayHQ competitions Ovation can't place in a grade.
//
// Real database. A synced club plays in a competition the classifier doesn't recognise, so its
// match is skipped by the central projection. The platform console lists it, a "map" decision
// projects the match under the chosen grade straight away (through the central_projector role —
// the app itself never writes central), an "ignore" decision drops it from the list, and removing
// a decision puts it back.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, platformAdminsTable, playhqGradeDecisionsTable, tenantsTable } from "@workspace/db";
import { closeCentralProjectorPool, closePlayhqIngestPool } from "@workspace/db/playhq-ingest";
import { hashPassword } from "../lib/auth";
import { withoutDecidedGrades } from "../lib/playhq-grade-decisions";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const centralUrl = process.env.CENTRAL_DATABASE_URL!;
const STAMP = Date.now();
const EMAIL = `gradedec+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
const COMP = `Zy Social Cup ${STAMP}`;
const KEY = `zy social cup ${STAMP}`;
const CLUB_A = 9931;
const CLUB_B = 9932;
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const GRADE = randomUUID();
const MATCH = randomUUID();
const TEAM_A = randomUUID();
const TEAM_B = randomUUID();

const admin = {
  query: (text: string, params?: unknown[]) => db.$client.query(text, params),
};
let cookie: string;
let platformAdminId: number;
let tenantId: number;
const saved = {
  projector: process.env.CENTRAL_PROJECTOR_DATABASE_URL,
  projectorSsl: process.env.CENTRAL_PROJECTOR_DB_SSL,
  ingest: process.env.PLAYHQ_INGEST_DATABASE_URL,
};

const roleUrl = (user: string) => {
  const u = new URL(centralUrl);
  u.username = user;
  u.password = "test";
  return u.toString();
};

const centralGrade = async () =>
  (await admin.query(`select grade from central.matches where playhq_match_id = $1`, [MATCH]))
    .rows[0]?.grade as string | undefined;

const get = () => request(app).get("/api/platform/admin/grade-decisions").set("Cookie", cookie);
const put = (body: unknown) =>
  request(app)
    .put("/api/platform/admin/grade-decisions")
    .set("Cookie", cookie)
    .send(body as object);

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-grade-decisions";
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-ingest-role.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "central-projector.sql"), "utf8"));
  await admin.query(`alter role playhq_ingest with password 'test'`);
  await admin.query(`alter role central_projector with password 'test'`);
  process.env.PLAYHQ_INGEST_DATABASE_URL = roleUrl("playhq_ingest");
  process.env.CENTRAL_PROJECTOR_DATABASE_URL = roleUrl("central_projector");
  process.env.CENTRAL_PROJECTOR_DB_SSL = "0";

  await admin.query(
    `insert into central.club_playhq_orgs (playhq_org_id, club_id, source) values ($1, $2, 'manual'), ($3, $4, 'manual')
     on conflict (playhq_org_id) do update set club_id = excluded.club_id`,
    [ORG_A, CLUB_A, ORG_B, CLUB_B],
  );
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      slug: `grade-decisions-${STAMP}`,
      centralClubId: CLUB_A,
      name: "Grade Decisions Test Club",
      plan: "pro",
      playhqOrgId: ORG_A,
      playhqSyncEnabled: true,
    })
    .returning();
  tenantId = tenant!.id;
  await admin.query(
    `insert into playhq.grades (id, name, season_name, is_junior) values ($1, $2, 'Summer 2099/00', false)
     on conflict (id) do nothing`,
    [GRADE, `${COMP} 2099/00`],
  );
  await admin.query(
    `insert into playhq.matches (id, grade_id, status, match_type, round_name, start_at, venue_name,
        surface_name, result_text, home_team_id, away_team_id, home_team_name, away_team_name,
        home_org_id, away_org_id, home_score, away_score, raw)
     values ($1, $2, 'COMPLETED', 'One Day', 'Round 1', '2099-10-03T23:30:00Z', 'Rec Reserve', 'Oval 1',
        'Club A won by 9 wickets', $3, $4, 'Club B Shield', 'Club A Shield', $5, $6, '97', '1-98', '{}')
     on conflict (id) do nothing`,
    [MATCH, GRADE, TEAM_B, TEAM_A, ORG_B, ORG_A],
  );

  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Super", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  cookie = String(login.headers["set-cookie"][0]).split(";")[0]!;
});

afterEach(async () => {
  await db.delete(playhqGradeDecisionsTable).where(eq(playhqGradeDecisionsTable.gradeKey, KEY));
  await admin.query(`delete from central.matches where playhq_match_id = $1`, [MATCH]);
});

afterAll(async () => {
  await closeCentralProjectorPool();
  await closePlayhqIngestPool();
  process.env.CENTRAL_PROJECTOR_DATABASE_URL = saved.projector;
  process.env.CENTRAL_PROJECTOR_DB_SSL = saved.projectorSsl;
  process.env.PLAYHQ_INGEST_DATABASE_URL = saved.ingest;
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  await admin.query(`delete from playhq.matches where id = $1`, [MATCH]);
  await admin.query(`delete from playhq.grades where id = $1`, [GRADE]);
  await admin.query(`delete from central.club_playhq_orgs where playhq_org_id = any($1::text[])`, [
    [ORG_A, ORG_B],
  ]);
});

describe("platform grade decisions", () => {
  it("is platform-admin only", async () => {
    expect((await request(app).get("/api/platform/admin/grade-decisions")).status).toBe(401);
    expect((await request(app).put("/api/platform/admin/grade-decisions").send({})).status).toBe(
      401,
    );
    expect((await request(app).delete(`/api/platform/admin/grade-decisions/${KEY}`)).status).toBe(
      401,
    );
  });

  it("lists an unrecognised competition with the club and matches affected", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.projectorConfigured).toBe(true);
    expect(r.body.mappableGrades).toEqual(expect.arrayContaining(["A Grade", "Over 45s"]));
    const row = r.body.pending.find((p: { gradeKey: string }) => p.gradeKey === KEY);
    expect(row).toMatchObject({
      gradeName: `${COMP} 2099/00`,
      matches: 1,
      seasons: ["Summer 2099/00"],
      tenants: [{ id: tenantId, name: "Grade Decisions Test Club" }],
    });
  });

  it("rejects an invalid decision", async () => {
    for (const body of [
      { gradeName: COMP, action: "map" },
      { gradeName: COMP, action: "map", centralGrade: "Under 15" },
      { gradeName: COMP, action: "ignore", centralGrade: "A Grade" },
      { gradeName: COMP, action: "maybe" },
      { gradeName: "   ", action: "ignore" },
    ]) {
      expect([body, (await put(body)).status]).toEqual([body, 400]);
    }
    expect(await centralGrade()).toBeUndefined();
  });

  it("mapping a competition projects its matches under the chosen grade, straight away", async () => {
    const r = await put({ gradeName: `${COMP} 2099/00`, action: "map", centralGrade: "Over 45s" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      gradeKey: KEY,
      action: "map",
      centralGrade: "Over 45s",
      applied: true,
      created: 1,
    });
    expect(await centralGrade()).toBe("Over 45s");
    const after = await get();
    expect(after.body.pending.some((p: { gradeKey: string }) => p.gradeKey === KEY)).toBe(false);
    expect(after.body.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gradeKey: KEY, action: "map", centralGrade: "Over 45s" }),
      ]),
    );
  });

  it("a later mapping re-projects the same matches under the new grade", async () => {
    await put({ gradeName: COMP, action: "map", centralGrade: "Over 45s" });
    const r = await put({ gradeName: COMP, action: "map", centralGrade: "Over 50s" });
    expect(r.body).toMatchObject({ applied: true, created: 0, updated: 1 });
    expect(await centralGrade()).toBe("Over 50s");
  });

  it("ignoring a competition drops it from the list and projects nothing", async () => {
    const r = await put({ gradeName: COMP, action: "ignore", reason: "one-off" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ action: "ignore", centralGrade: null, applied: false });
    expect(await centralGrade()).toBeUndefined();
    const after = await get();
    expect(after.body.pending.some((p: { gradeKey: string }) => p.gradeKey === KEY)).toBe(false);
  });

  it("removing a decision puts the competition back on the list", async () => {
    await put({ gradeName: COMP, action: "ignore" });
    const del = await request(app)
      .delete(`/api/platform/admin/grade-decisions/${encodeURIComponent(KEY)}`)
      .set("Cookie", cookie);
    expect(del.status).toBe(204);
    const after = await get();
    expect(after.body.pending.some((p: { gradeKey: string }) => p.gradeKey === KEY)).toBe(true);
    const again = await request(app)
      .delete(`/api/platform/admin/grade-decisions/${encodeURIComponent(KEY)}`)
      .set("Cookie", cookie);
    expect(again.status).toBe(404);
  });

  it("a decided competition no longer shows in a club's own notice", async () => {
    const listed = { gradeName: `${COMP} 2099/00`, seasonName: "2099/00", matches: 1, reason: "x" };
    expect(await withoutDecidedGrades([listed])).toEqual([listed]);
    await put({ gradeName: COMP, action: "ignore" });
    expect(await withoutDecidedGrades([listed])).toEqual([]);
  });
});
