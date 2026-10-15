// Junior PlayHQ sync, capture half (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md,
// U4; KTD1-KTD4, R2, R4-R7, AE1), on a real database.
//
// With junior sync off a club's junior grades are dropped at ingest exactly as before; once
// the platform admin switches it on, the next ingest keeps them in `playhq.*` (is_junior =
// true) without any reaching `public.fixtures`, the plans endpoint asks the harness for
// junior grades, and grades no classifier recognises are left to the senior "can't place this
// competition" report (platform Competitions screen, PlayHQ grade decisions) — the ingest opens
// no incident for them and that report never lists a junior grade. Same setup as internal-playhq-ingest.test.ts: the
// playhq schema and the playhq_ingest role are applied to the central database, and ingest
// connects as that role. CI only (needs Postgres).
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  fixturesTable,
  juniorFixturesTable,
  notificationsTable,
  platformAdminsTable,
  playhqSyncIncidentsTable,
  socialDraftsTable,
  tenantsTable,
} from "@workspace/db";
import { closePlayhqIngestPool } from "@workspace/db/playhq-ingest";
import { hashPassword } from "../lib/auth";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const SECRET = "test-playhq-junior-capture-secret";
const STAMP = Date.now();

const ORG = randomUUID(); // the club, juniors under its senior organisation
const JUNIOR_ORG = randomUUID(); // a second club's separate junior organisation
const SECOND_ORG = randomUUID(); // that second club's senior organisation
const OPP = randomUUID();
const ASSOC = randomUUID();
const SEASON = randomUUID();
const SENIOR_GRADE = randomUUID();
const JUNIOR_GRADE = randomUUID();
const GIRLS_GRADE = randomUUID();
const ODD_GRADE = randomUUID();
const SENIOR_MATCH = randomUUID();
const JUNIOR_MATCH = randomUUID();
const GIRLS_MATCH = randomUUID();
const GRADES = [SENIOR_GRADE, JUNIOR_GRADE, GIRLS_GRADE, ODD_GRADE];
const MATCHES = [SENIOR_MATCH, JUNIOR_MATCH, GIRLS_MATCH];
const KID = randomUUID();
const ADMIN_LOGIN = `super-junior-capture+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

const admin = { query: (text: string, params?: unknown[]) => db.$client.query(text, params) };
let tenantId: number;
let secondTenantId: number;
let platformCookie: string;

function ingestRoleUrl(): string {
  const u = new URL(process.env.CENTRAL_DATABASE_URL!);
  u.username = "playhq_ingest";
  u.password = "test";
  return u.toString();
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const START = inDays(5);

function match(id: string) {
  return {
    id,
    status: "UPCOMING",
    statusId: 0,
    matchType: "One Day",
    matchTypeId: 2,
    round: { id: randomUUID(), name: "Round 1", shortName: "R1" },
    matchSchedule: [{ matchDay: 1, startDateTime: START }],
    venue: { name: "Stan Twight Reserve", playingSurface: { name: "Oval 1" } },
    teams: [
      {
        id: randomUUID(),
        displayName: "Test CC",
        isHome: true,
        owningOrganisation: { id: ORG, name: "Test Cricket Club" },
      },
      {
        id: randomUUID(),
        displayName: "Opposition CC",
        isHome: false,
        owningOrganisation: { id: OPP, name: "Opposition Cricket Club" },
      },
    ],
  };
}

/** A weekly-plan dump: senior, junior, Girls League and an unclassifiable grade. */
function dump() {
  const at = new Date().toISOString();
  const grades: [string, string, string | null][] = [
    [SENIOR_GRADE, "A Grade Wyllie Cup", SENIOR_MATCH],
    [JUNIOR_GRADE, "Year 7 Gold", JUNIOR_MATCH],
    [GIRLS_GRADE, "Peel Girls League", GIRLS_MATCH],
    [ODD_GRADE, "Mixed Social Twilight", null],
  ];
  return {
    version: "2.0.0",
    exportedAt: at,
    origin: "https://play.cricket.com.au",
    records: [
      {
        key: "plan|1",
        kind: "plan",
        id: at,
        meta: {},
        fetchedAt: at,
        data: { orgId: ORG, seasons: "current", kinds: ["matches", "batting"] },
      },
      ...grades.map(([id, name]) => ({
        key: `grade|${id}`,
        kind: "grade",
        id,
        meta: {},
        fetchedAt: at,
        data: {
          gradeId: id,
          gradeName: name,
          seasonId: SEASON,
          seasonName: "Summer 2026/27",
          ownerOrgId: ASSOC,
          sourceOrgId: ORG,
          teamIds: [],
          teamNames: [],
        },
      })),
      ...grades
        .filter(([, , m]) => m)
        .map(([id, , m]) => ({
          key: `matches|${id}`,
          kind: "matches",
          id,
          meta: { gradeId: id },
          fetchedAt: at,
          data: { matches: [match(m!)] },
        })),
      {
        key: `batting|${JUNIOR_GRADE}`,
        kind: "batting",
        id: JUNIOR_GRADE,
        meta: { gradeId: JUNIOR_GRADE },
        fetchedAt: at,
        data: [
          {
            id: KID,
            name: "Junior, Kid",
            shortName: "K Junior",
            organisation: { id: ORG, name: "Test Cricket Club" },
            statistics: { matches: 1 },
          },
        ],
      },
    ],
  };
}

const ingest = () =>
  request(app)
    .post("/api/internal/playhq/ingest")
    .set("x-sync-secret", SECRET)
    .send({ collector: "manual", planName: "weekly", dump: dump() });

const setJuniorSync = (on: boolean) =>
  db.update(tenantsTable).set({ juniorSyncEnabled: on }).where(eq(tenantsTable.id, tenantId));

beforeAll(async () => {
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-ingest-role.sql"), "utf8"));
  await admin.query(`alter role playhq_ingest with password 'test'`);
  process.env.PLAYHQ_INGEST_DATABASE_URL = ingestRoleUrl();
  process.env.PLAYHQ_SYNC_SECRET = SECRET;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-junior-capture";
  await closePlayhqIngestPool();

  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `playhq-junior-${STAMP}`,
      centralClubId: 9943,
      name: "Junior Capture Test Club",
      plan: "pro",
      playhqOrgId: ORG,
      playhqSyncEnabled: true,
    })
    .returning();
  tenantId = t.id;
  const [t2] = await db
    .insert(tenantsTable)
    .values({
      slug: `playhq-junior2-${STAMP}`,
      centralClubId: 9944,
      name: "Junior Org Test Club",
      plan: "pro",
      playhqOrgId: SECOND_ORG,
      playhqSyncEnabled: true,
      juniorSyncEnabled: true,
      playhqJuniorOrgId: JUNIOR_ORG,
    })
    .returning();
  secondTenantId = t2.id;

  await db.insert(platformAdminsTable).values({
    email: ADMIN_LOGIN,
    displayName: "Super",
    passwordHash: await hashPassword(PASSWORD),
  });
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: ADMIN_LOGIN, password: PASSWORD });
  platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];
});

afterAll(async () => {
  await closePlayhqIngestPool();
  for (const id of [tenantId, secondTenantId]) {
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, id));
    await db.delete(juniorFixturesTable).where(eq(juniorFixturesTable.tenantId, id));
    await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, id));
    await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
  for (const org of [ORG, JUNIOR_ORG, SECOND_ORG])
    await db.delete(playhqSyncIncidentsTable).where(eq(playhqSyncIncidentsTable.orgId, org));
  await admin.query(`delete from playhq.fixture_changes where match_id = any($1::uuid[])`, [
    MATCHES,
  ]);
  await admin.query(`delete from playhq.matches where id = any($1::uuid[])`, [MATCHES]);
  await admin.query(`delete from playhq.player_grade_stats where grade_id = any($1::uuid[])`, [
    GRADES,
  ]);
  await admin.query(`delete from playhq.players where participant_id = $1`, [KID]);
  await admin.query(`delete from playhq.teams where grade_id = any($1::uuid[])`, [GRADES]);
  await admin.query(`delete from playhq.grades where id = any($1::uuid[])`, [GRADES]);
  await admin.query(`delete from playhq.scrape_runs where org_id = $1`, [ORG]);
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, ADMIN_LOGIN));
  delete process.env.PLAYHQ_SYNC_SECRET;
  delete process.env.PLAYHQ_INGEST_DATABASE_URL;
});

const storedGrades = async () =>
  (
    await admin.query(
      `select id::text as id, is_junior from playhq.grades where id = any($1::uuid[]) order by name`,
      [GRADES],
    )
  ).rows as { id: string; is_junior: boolean }[];

const juniorFixtureMatches = async (id: number) =>
  (
    await db
      .select({ matchId: juniorFixturesTable.playhqMatchId })
      .from(juniorFixturesTable)
      .where(eq(juniorFixturesTable.tenantId, id))
  )
    .map((r) => r.matchId)
    .sort();

/** Any sync incident for the club's organisation (the ingest itself opens none). */
const clubIncidents = () =>
  db.select().from(playhqSyncIncidentsTable).where(eq(playhqSyncIncidentsTable.orgId, ORG));

describe("junior capture — junior sync off (AE1, R2)", () => {
  it("drops the club's junior grades exactly as before and reports nothing", async () => {
    const res = await ingest();
    expect(res.status).toBe(200);
    expect(res.body.juniorGradesDropped).toBe(2); // Year 7 Gold + Peel Girls League
    const stored = await storedGrades();
    expect(stored.map((g) => g.id).sort()).toEqual([SENIOR_GRADE, ODD_GRADE].sort());
    expect(stored.every((g) => g.is_junior === false)).toBe(true);
    const m = await admin.query(`select id::text as id from playhq.matches where id = any($1)`, [
      MATCHES,
    ]);
    expect(m.rows.map((r) => r.id)).toEqual([SENIOR_MATCH]);
    const kid = await admin.query(`select 1 from playhq.players where participant_id = $1`, [KID]);
    expect(kid.rowCount).toBe(0);
    expect(await clubIncidents()).toEqual([]);
    // Nothing reaches the junior tables of a club without junior sync.
    expect(await juniorFixtureMatches(tenantId)).toEqual([]);
  });

  it("plans the club without asking the harness for junior grades", async () => {
    const res = await request(app).get("/api/internal/playhq/plans").set("x-sync-secret", SECRET);
    expect(res.status).toBe(200);
    for (const p of res.body.plans.filter((x: { orgId: string }) => x.orgId === ORG))
      expect(p.plan).not.toHaveProperty("includeJuniors");
  });
});

describe("junior capture — junior sync on (AE1, R4-R7)", () => {
  beforeAll(async () => {
    await setJuniorSync(true);
  });

  it("keeps the club's junior grades, flagged junior, with their matches and players", async () => {
    const res = await ingest();
    expect(res.status).toBe(200);
    expect(res.body.juniorGradesDropped).toBe(0);
    const stored = new Map((await storedGrades()).map((g) => [g.id, g.is_junior]));
    expect(stored.get(JUNIOR_GRADE)).toBe(true);
    expect(stored.get(GIRLS_GRADE)).toBe(true);
    expect(stored.get(SENIOR_GRADE)).toBe(false);
    expect(stored.get(ODD_GRADE)).toBe(false); // unclassified: senior handling unchanged
    const m = await admin.query(`select id::text as id from playhq.matches where id = any($1)`, [
      MATCHES,
    ]);
    expect(m.rows.map((r) => r.id).sort()).toEqual([...MATCHES].sort());
    const kid = await admin.query(`select 1 from playhq.players where participant_id = $1`, [KID]);
    expect(kid.rowCount).toBe(1);
  });

  it("projects the kept junior matches into the club's junior fixtures (AE1, ingest → projection)", async () => {
    // The ingest builds the enabled set from tenants, passes its kept junior grades and
    // runs the junior projection: both upcoming junior matches become junior fixtures.
    expect(await juniorFixtureMatches(tenantId)).toEqual(
      [JUNIOR_MATCH, GIRLS_MATCH].map((m) => m.toLowerCase()).sort(),
    );
    // The other enabled club (its own junior organisation, not in this dump) gets none.
    expect(await juniorFixtureMatches(secondTenantId)).toEqual([]);
  });

  it("never lets a junior match (incl. Peel Girls League) reach public.fixtures", async () => {
    const rows = await db
      .select({ matchId: fixturesTable.playhqMatchId })
      .from(fixturesTable)
      .where(eq(fixturesTable.tenantId, tenantId));
    expect(rows.map((r) => r.matchId)).toEqual([SENIOR_MATCH]);
  });

  it("opens no incident for the unclassified grade (the Competitions screen reports it)", async () => {
    await ingest(); // a second sync changes nothing
    expect(await clubIncidents()).toEqual([]);
  });

  it("never lists the club's junior grades among the competitions Ovation can't place", async () => {
    const res = await request(app)
      .get("/api/platform/admin/grade-decisions")
      .set("Cookie", platformCookie);
    expect(res.status).toBe(200);
    const names = (res.body.pending as { gradeName: string }[]).map((p) => p.gradeName);
    expect(names).not.toContain("Year 7 Gold");
    expect(names).not.toContain("Peel Girls League");
  });

  it("asks the harness for junior grades on the club's plans, and plans a separate junior organisation", async () => {
    const res = await request(app).get("/api/internal/playhq/plans").set("x-sync-secret", SECRET);
    expect(res.status).toBe(200);
    const plans = res.body.plans as { orgId: string; plan: Record<string, unknown> }[];
    const mine = plans.filter((p) => p.orgId === ORG);
    for (const p of mine) expect(p.plan).toMatchObject({ includeJuniors: true });
    const juniorOrg = plans.filter((p) => p.orgId === JUNIOR_ORG);
    expect(juniorOrg.length).toBeGreaterThan(0);
    for (const p of juniorOrg) expect(p.plan).toMatchObject({ includeJuniors: true });
    for (const p of plans.filter((x) => x.orgId === SECOND_ORG))
      expect(p.plan).not.toHaveProperty("includeJuniors");
  });

  it("drops junior grades again once junior sync is switched off", async () => {
    await setJuniorSync(false);
    const res = await ingest();
    expect(res.status).toBe(200);
    // Already known junior in playhq: dropped from this dump, and never re-flagged senior.
    expect(res.body.juniorGradesDropped).toBe(2);
  });

  it("projects nothing junior for a club once its junior sync is off", async () => {
    await db.delete(juniorFixturesTable).where(eq(juniorFixturesTable.tenantId, tenantId));
    const res = await ingest();
    expect(res.status).toBe(200);
    expect(await juniorFixtureMatches(tenantId)).toEqual([]);
  });
});

describe("junior capture — a grade stored as senior before the classifier knew it (adversarial P2)", () => {
  it("flips it to junior at the next ingest and reports what was projected as senior, deleting nothing", async () => {
    // As stored before the classifier learned the loader's age banding, with a senior
    // fixture already projected from it.
    await admin.query(`update playhq.grades set is_junior = false where id = $1`, [GIRLS_GRADE]);
    const [planted] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "Peel Girls League",
        opponentName: "Opposition CC",
        startAt: new Date(START),
        source: "playhq",
        playhqMatchId: GIRLS_MATCH,
      })
      .returning();
    const res = await ingest(); // junior sync is off: the dump's Girls League grade is dropped
    expect(res.status).toBe(200);
    const stored = new Map((await storedGrades()).map((g) => [g.id, g.is_junior]));
    expect(stored.get(GIRLS_GRADE)).toBe(true);
    expect(stored.get(SENIOR_GRADE)).toBe(false);
    const warnings = (res.body.warnings ?? []) as string[];
    expect(warnings.some((w) => /reclassified as junior \(Peel Girls League\)/.test(w))).toBe(true);
    expect(JSON.stringify(warnings)).not.toMatch(/Kid|Junior,/);
    // Left in place for the operator to review.
    const still = await db.select().from(fixturesTable).where(eq(fixturesTable.id, planted!.id));
    expect(still).toHaveLength(1);
  });
});
