// POST /api/internal/playhq/ingest — the scheduled-sync entry point
// (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md, U2/U3).
//
// Real database: the playhq landing schema and the playhq_ingest role are applied to the
// central database, and ingest connects as that role — so these tests also prove the role
// can do its job and nothing more. Setup writes go through the tenant `db` pool, which is
// the same local Postgres as CENTRAL_DATABASE_URL in CI (as in draft-sweep.test.ts).
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, like } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, fixturesTable, socialDraftsTable } from "@workspace/db";
import { closePlayhqIngestPool } from "@workspace/db/playhq-ingest";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const SECRET = "test-playhq-sync-secret";

const ORG = randomUUID(); // the tenant's club
const OPP = randomUUID(); // the opposition club
const ASSOC = randomUUID(); // the association that owns the grades
const SEASON = randomUUID();
const SENIOR_GRADE = randomUUID();
const JUNIOR_GRADE = randomUUID();
const SENIOR_MATCH = randomUUID();
const JUNIOR_MATCH = randomUUID();
const TEAM_HOME = randomUUID();
const TEAM_AWAY = randomUUID();
const JUNIOR_TEAM = randomUUID();

const centralUrl = process.env.CENTRAL_DATABASE_URL!;
const admin = {
  query: (text: string, params?: unknown[]) => db.$client.query(text, params),
};
let ingestUrl: string;
let tenantId: number;

function ingestRoleUrl(): string {
  const u = new URL(centralUrl);
  u.username = "playhq_ingest";
  u.password = "test";
  return u.toString();
}

function match(id: string, start: string, teams: [string, string], venue = "Stan Twight Reserve") {
  return {
    id,
    status: "UPCOMING",
    statusId: 0,
    matchType: "One Day",
    matchTypeId: 2,
    round: { id: randomUUID(), name: "Round 1", shortName: "R1" },
    matchSchedule: [{ matchDay: 1, startDateTime: start }],
    venue: { name: venue, playingSurface: { name: `${venue} - Oval 1` } },
    teams: [
      {
        id: teams[0],
        displayName: "Test CC A Grade",
        isHome: true,
        owningOrganisation: { id: ORG, name: "Test Cricket Club" },
      },
      {
        id: teams[1],
        displayName: "Opposition CC A Grade",
        isHome: false,
        owningOrganisation: { id: OPP, name: "Opposition Cricket Club" },
      },
    ],
  };
}

/** A harness export with one senior and one junior grade, one upcoming match in each. */
function dump(start: string, venue?: string) {
  const at = new Date().toISOString();
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
        data: { orgId: ORG, seasons: "current", kinds: ["matches"] },
      },
      ...[
        [SENIOR_GRADE, "A Grade Wyllie Cup", TEAM_HOME],
        [JUNIOR_GRADE, "Year 8 Boys", JUNIOR_TEAM],
      ].map(([id, name, team]) => ({
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
          ownerOrgName: "Test Association",
          sourceOrgId: ORG,
          teamIds: [team],
          teamNames: [name],
        },
      })),
      {
        key: `matches|${SENIOR_GRADE}`,
        kind: "matches",
        id: SENIOR_GRADE,
        meta: { gradeId: SENIOR_GRADE },
        fetchedAt: at,
        data: { matches: [match(SENIOR_MATCH, start, [TEAM_HOME, TEAM_AWAY], venue)] },
      },
      {
        key: `matches|${JUNIOR_GRADE}`,
        kind: "matches",
        id: JUNIOR_GRADE,
        meta: { gradeId: JUNIOR_GRADE },
        fetchedAt: at,
        data: { matches: [match(JUNIOR_MATCH, start, [JUNIOR_TEAM, randomUUID()])] },
      },
    ],
  };
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const START = inDays(5);

const post = (body: unknown) =>
  request(app)
    .post("/api/internal/playhq/ingest")
    .set("x-sync-secret", SECRET)
    .send(body as object);

beforeAll(async () => {
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-ingest-role.sql"), "utf8"));
  await admin.query(`alter role playhq_ingest with password 'test'`);
  ingestUrl = ingestRoleUrl();

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      slug: `playhq-ingest-${Date.now()}`,
      centralClubId: 9902,
      name: "PlayHQ Ingest Test Club",
      plan: "pro",
      playhqOrgId: ORG,
      playhqSyncEnabled: true,
    })
    .returning();
  tenantId = tenant.id;

  process.env.PLAYHQ_SYNC_SECRET = SECRET;
});

afterAll(async () => {
  await closePlayhqIngestPool();
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  const matches = [SENIOR_MATCH, JUNIOR_MATCH];
  await admin.query(`delete from playhq.fixture_changes where match_id = any($1::uuid[])`, [
    matches,
  ]);
  await admin.query(`delete from playhq.matches where id = any($1::uuid[])`, [matches]);
  await admin.query(`delete from playhq.teams where grade_id = any($1::uuid[])`, [
    [SENIOR_GRADE, JUNIOR_GRADE],
  ]);
  await admin.query(`delete from playhq.grades where id = any($1::uuid[])`, [
    [SENIOR_GRADE, JUNIOR_GRADE],
  ]);
  await admin.query(`delete from playhq.scrape_runs where org_id = $1`, [ORG]);
  delete process.env.PLAYHQ_SYNC_SECRET;
  delete process.env.PLAYHQ_INGEST_DATABASE_URL;
});

describe("POST /api/internal/playhq/ingest — access", () => {
  it("401s without the sync secret", async () => {
    const res = await request(app)
      .post("/api/internal/playhq/ingest")
      .send({ collector: "manual", dump: dump(START) });
    expect(res.status).toBe(401);
  });

  it("401s with the wrong secret", async () => {
    const res = await request(app)
      .post("/api/internal/playhq/ingest")
      .set("x-sync-secret", "nope")
      .send({ collector: "manual", dump: dump(START) });
    expect(res.status).toBe(401);
  });

  it("rejects an oversized body unauthenticated without parsing it", async () => {
    // 200 KB > the global 100kb parser, < the route's own ceiling: a wrong secret must still
    // be a plain 401 (the route only parses after the secret matches).
    const res = await request(app)
      .post("/api/internal/playhq/ingest")
      .set("x-sync-secret", "nope")
      .send({ collector: "manual", pad: "x".repeat(200_000), dump: dump(START) });
    expect(res.status).toBe(401);
  });

  it("checks the secret before parsing the body", async () => {
    // Parsing first would answer this malformed JSON with a 400; the route must reject the
    // caller before it inflates or parses anything (its body ceiling is 50mb).
    const res = await request(app)
      .post("/api/internal/playhq/ingest")
      .set("x-sync-secret", "nope")
      .set("content-type", "application/json")
      .send('{"collector": "manual", "dump": ');
    expect(res.status).toBe(401);
  });

  it("400s on a body that is not a harness dump", async () => {
    const res = await post({ collector: "manual", dump: { version: "2.0.0" } });
    expect(res.status).toBe(400);
  });

  it("503s while PLAYHQ_INGEST_DATABASE_URL is unset", async () => {
    delete process.env.PLAYHQ_INGEST_DATABASE_URL;
    await closePlayhqIngestPool();
    const res = await post({ collector: "manual", dump: dump(START) });
    expect(res.status).toBe(503);
  });

  it("503s when the ingest URL's role can write outside playhq (a superuser)", async () => {
    process.env.PLAYHQ_INGEST_DATABASE_URL = centralUrl;
    await closePlayhqIngestPool();
    const res = await post({ collector: "manual", dump: dump(START) });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/outside playhq/);
    const runs = await admin.query(`select 1 from playhq.scrape_runs where org_id = $1`, [ORG]);
    expect(runs.rowCount).toBe(0);
  });
});

describe("POST /api/internal/playhq/ingest — load, project, sweep", () => {
  beforeAll(async () => {
    process.env.PLAYHQ_INGEST_DATABASE_URL = ingestUrl;
    await closePlayhqIngestPool();
  });

  it("loads the senior grade, drops the junior one, and projects the tenant's fixture", async () => {
    const res = await post({
      collector: "gha-headless",
      planName: "weekly",
      durationMs: 8276,
      dump: dump(START),
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.juniorGradesDropped).toBe(1);
    expect(res.body.runIds).toHaveLength(1);
    expect(res.body.tenants).toEqual([
      expect.objectContaining({ tenantId, matches: 1, inserted: 1, updated: 0 }),
    ]);

    const m = await admin.query(`select id from playhq.matches where id = any($1::uuid[])`, [
      [SENIOR_MATCH, JUNIOR_MATCH],
    ]);
    expect(m.rows.map((r) => r.id)).toEqual([SENIOR_MATCH]);
    const g = await admin.query(`select id from playhq.grades where id = $1`, [JUNIOR_GRADE]);
    expect(g.rowCount).toBe(0);

    const run = await admin.query(
      `select collector, plan_name, harness_version, status, duration_ms
         from playhq.scrape_runs where id = $1`,
      [res.body.runIds[0]],
    );
    expect(run.rows[0]).toEqual({
      collector: "gha-headless",
      plan_name: "weekly",
      harness_version: "2.0.0",
      status: "ok",
      duration_ms: 8276,
    });

    const [fx] = await db
      .select()
      .from(fixturesTable)
      .where(
        and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.playhqMatchId, SENIOR_MATCH)),
      );
    expect(fx).toMatchObject({
      source: "playhq",
      isHome: true,
      opponentName: "Opposition Cricket Club",
    });
    expect(fx.startAt.toISOString()).toBe(START);
  });

  it("is idempotent: the same dump again changes nothing", async () => {
    const res = await post({ collector: "gha-headless", planName: "weekly", dump: dump(START) });
    expect(res.status).toBe(200);
    expect(res.body.fixtureChanges).toBe(0);
    expect(res.body.tenants).toEqual([
      expect.objectContaining({ tenantId, inserted: 0, updated: 1 }),
    ]);
    const n = await db
      .select({ id: fixturesTable.id })
      .from(fixturesTable)
      .where(eq(fixturesTable.tenantId, tenantId));
    expect(n).toHaveLength(1);
  });

  it("does not project fixtures for a tenant with scheduled sync switched off", async () => {
    await db
      .update(tenantsTable)
      .set({ playhqSyncEnabled: false })
      .where(eq(tenantsTable.id, tenantId));
    try {
      const res = await post({ collector: "manual", dump: dump(START) });
      expect(res.status).toBe(200);
      expect(res.body.tenants).toEqual([]);
      // The load itself still lands (playhq.* is association data, not the tenant's).
      expect(res.body.runIds).toHaveLength(1);
    } finally {
      await db
        .update(tenantsTable)
        .set({ playhqSyncEnabled: true })
        .where(eq(tenantsTable.id, tenantId));
    }
  });

  it("records a moved start, refreshes the fixture, and keeps the admin's notes", async () => {
    await db
      .update(fixturesTable)
      .set({ notes: "Bring the new ball" })
      .where(
        and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.playhqMatchId, SENIOR_MATCH)),
      );
    const moved = inDays(6);

    const res = await post({
      collector: "gha-headless",
      planName: "preweekend",
      dump: dump(moved),
    });
    expect(res.status).toBe(200);
    expect(res.body.fixtureChanges).toBeGreaterThanOrEqual(1);

    const changes = await admin.query(
      `select field from playhq.fixture_changes where match_id = $1`,
      [SENIOR_MATCH],
    );
    expect(changes.rows.map((r) => r.field)).toContain("start_at");
    const [fx] = await db
      .select()
      .from(fixturesTable)
      .where(
        and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.playhqMatchId, SENIOR_MATCH)),
      );
    expect(fx.startAt.toISOString()).toBe(moved);
    expect(fx.notes).toBe("Bring the new ball");
  });

  it("accepts a gzip-encoded body", async () => {
    const body = gzipSync(
      Buffer.from(JSON.stringify({ collector: "manual", dump: dump(inDays(6)) })),
    );
    const res = await request(app)
      .post("/api/internal/playhq/ingest")
      .set("x-sync-secret", SECRET)
      .set("content-type", "application/json")
      .set("content-encoding", "gzip")
      // superagent would JSON-encode a Buffer under a JSON content type; send the bytes as-is.
      .serialize((b: unknown) => b as string)
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("stamps the collector's own partial status on the run", async () => {
    const res = await post({
      collector: "gha-headless",
      planName: "matchday",
      status: "partial",
      errors: [{ path: "/scores/matches/x", error: "HTTP 500" }],
      dump: dump(inDays(6)),
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("partial");
    const run = await admin.query(`select status, errors from playhq.scrape_runs where id = $1`, [
      res.body.runIds[0],
    ]);
    expect(run.rows[0].status).toBe("partial");
    expect(run.rows[0].errors).toEqual([{ path: "/scores/matches/x", error: "HTTP 500" }]);
  });
});

describe("GET /api/internal/playhq/plans — what the runner should collect", () => {
  const ORG2 = randomUUID(); // linked, never synced
  const ORG3 = randomUUID(); // linked, but its tenant is suspended
  const ORG5 = randomUUID(); // linked and active, but scheduled sync switched off (U4)
  const extra: number[] = [];

  beforeAll(async () => {
    process.env.PLAYHQ_INGEST_DATABASE_URL = ingestUrl;
    await closePlayhqIngestPool();
    // Leftovers from an interrupted run would collide on the unique central_club_id.
    await db.delete(tenantsTable).where(like(tenantsTable.slug, "playhq-plans-%"));
    for (const [orgId, suspended, clubId, syncOn] of [
      [ORG2, false, 9903, true],
      [ORG3, true, 9904, true],
      [ORG5, false, 9906, false],
    ] as const) {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `playhq-plans-${randomUUID().slice(0, 8)}`,
          centralClubId: clubId,
          name: "PlayHQ Plans Test Club",
          plan: "pro",
          playhqOrgId: orgId,
          playhqSyncEnabled: syncOn,
          suspendedAt: suspended ? new Date() : null,
        })
        .returning();
      extra.push(t.id);
    }
  });

  afterAll(async () => {
    for (const id of extra) await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  });

  const getPlans = () =>
    request(app).get("/api/internal/playhq/plans").set("x-sync-secret", SECRET);

  it("401s without the sync secret", async () => {
    const res = await request(app).get("/api/internal/playhq/plans");
    expect(res.status).toBe(401);
  });

  it("lists the weekly plan for a linked org that has never synced", async () => {
    const res = await getPlans();
    expect(res.status).toBe(200);
    const weekly = res.body.plans.find(
      (p: { orgId: string; planName: string }) => p.orgId === ORG2 && p.planName === "weekly",
    );
    expect(weekly).toMatchObject({
      plan: { orgId: ORG2, seasons: "current", scorecards: "none" },
    });
    expect(Date.parse(weekly.slot)).toBeLessThanOrEqual(Date.parse(res.body.now));
  });

  it("does not list weekly for an org whose weekly run has loaded since the slot", async () => {
    // The ingest tests above loaded `weekly` runs for ORG moments ago.
    const res = await getPlans();
    const mine = res.body.plans.filter((p: { orgId: string }) => p.orgId === ORG);
    expect(mine.map((p: { planName: string }) => p.planName)).not.toContain("weekly");
  });

  it("skips organisations whose tenant has scheduled sync switched off", async () => {
    const res = await getPlans();
    expect(res.body.plans.some((p: { orgId: string }) => p.orgId === ORG5)).toBe(false);
  });

  it("skips organisations whose only tenant is suspended", async () => {
    const res = await getPlans();
    expect(res.body.plans.some((p: { orgId: string }) => p.orgId === ORG3)).toBe(false);
  });

  it("503s when the ingest database is not configured", async () => {
    delete process.env.PLAYHQ_INGEST_DATABASE_URL;
    await closePlayhqIngestPool();
    const res = await getPlans();
    expect(res.status).toBe(503);
    process.env.PLAYHQ_INGEST_DATABASE_URL = ingestUrl;
  });
});

describe("scheduled runner → plans → ingest (round trip)", () => {
  // The real runner (scripts/playhq-sync/runner.mjs) against the real app over HTTP; only the
  // browser is faked, returning a harness dump. Proves the runner's request shapes (secret
  // header, gzip body, collector/planName fields) are what the endpoints accept.
  const ORG4 = randomUUID();
  let server: Server;
  let base: string;
  let tenant4: number;

  beforeAll(async () => {
    process.env.PLAYHQ_INGEST_DATABASE_URL = ingestUrl;
    await closePlayhqIngestPool();
    await db.delete(tenantsTable).where(like(tenantsTable.slug, "playhq-runner-%"));
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `playhq-runner-${randomUUID().slice(0, 8)}`,
        centralClubId: 9905,
        name: "PlayHQ Runner Test Club",
        plan: "pro",
        playhqOrgId: ORG4,
        playhqSyncEnabled: true,
      })
      .returning();
    tenant4 = t.id;
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}/api`;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await admin.query(`delete from playhq.scrape_runs where org_id = $1`, [ORG4]);
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant4));
  });

  it("collects the due weekly plan for a new org and marks it done", async () => {
    const runnerPath = path.resolve(__dirname, "../../../../scripts/playhq-sync/runner.mjs");
    const { run } = (await import(runnerPath as string)) as {
      run: (o: Record<string, unknown>) => Promise<{
        due: number;
        uploaded: { orgId: string; planName: string; ingest: string }[];
        failures: string[];
      }>;
    };
    const at = new Date().toISOString();
    const page = {
      goto: async () => {},
      close: async () => {},
      evaluate: async (fn: unknown) => {
        const src = String(fn);
        if (src.includes("__ov.status"))
          return { phase: "done", finishedAt: at, errorCount: 0, errors: [], stats: { failed: 0 } };
        if (src.includes("__ov.dump"))
          return {
            version: "2.0.0",
            exportedAt: at,
            records: [
              {
                key: "plan|1",
                kind: "plan",
                id: at,
                meta: {},
                fetchedAt: at,
                data: { orgId: ORG4 },
              },
            ],
          };
        return undefined;
      },
    };
    const result = await run({
      env: {
        OVATION_API_URL: base,
        PLAYHQ_SYNC_SECRET: SECRET,
        HARNESS_PATH: "unused",
        ONLY_ORG: ORG4,
      },
      launch: async () => ({ newPage: async () => page, close: async () => {} }),
      readHarness: async () => "",
      sleep: async () => {},
      log: () => {},
    });
    expect(result.failures).toEqual([]);
    expect(result.uploaded).toEqual([
      expect.objectContaining({ orgId: ORG4, planName: "weekly", ingest: "ok" }),
    ]);

    const runs = await admin.query(
      `select collector, plan_name, status from playhq.scrape_runs where org_id = $1`,
      [ORG4],
    );
    expect(runs.rows).toEqual([{ collector: "gha-headless", plan_name: "weekly", status: "ok" }]);

    // Marked done: the next tick has nothing for this org.
    const again = await run({
      env: { OVATION_API_URL: base, PLAYHQ_SYNC_SECRET: SECRET, ONLY_ORG: ORG4 },
      launch: async () => {
        throw new Error("should not launch");
      },
      log: () => {},
    });
    expect(again.due).toBe(0);
  });
});
