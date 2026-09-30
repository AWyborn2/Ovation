import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  awardsTable,
  awardWinnersTable,
  centuriesTable,
  clubHistoryBatchesTable,
  clubHistoryCuratedRowsTable,
  clubHistoryRowsTable,
  clubRecordsTable,
  fiveWicketHaulsTable,
  milestoneEventsTable,
  platformAdminsTable,
  playerCurationTable,
  playerIdMapTable,
  socialDraftsTable,
  tenantsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

/**
 * Concierge club history import against real Postgres (hybrid stats plan U11;
 * R13, R14, R18, AE5, KTD3–KTD5, KTD8).
 *
 * Tenant A reads a tiny central club (9841) where "J Smith" (crosswalk id 7)
 * debuts in 2003/04 — A's boundary. Tenant B has no central data. Tenant C's
 * crosswalk already reaches 89999, one below the fill-in range.
 *
 *   - only a platform admin reaches the routes (a club admin is refused);
 *   - AE5: an unconfirmed "John Smith 1995–2003" becomes his own pre-digital
 *     player; a confirmed span link joins the rows to J Smith's id 7 and shows
 *     on the public player page;
 *   - a row at the boundary is refused with its row number and nothing is written;
 *   - honours land in the curated tables and undo removes exactly them;
 *   - undo removes every row of the batch and nothing else;
 *   - A's imports never touch B's rows, and B can't undo A's batch;
 *   - synthetic ids never reach 90000; no draft or milestone event is created;
 *   - missing history tables give a clear 503.
 *
 * Real-DB integration (CI's API job: DATABASE_URL and CENTRAL_DATABASE_URL are
 * the same throwaway Postgres, migrations applied). The central rows are
 * written through the TENANT `db` with raw SQL, only when the database is
 * local — the app itself never writes central.
 */

const isLocalDb = (() => {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    const centralHost = new URL(process.env.CENTRAL_DATABASE_URL ?? "").hostname;
    const local = ["localhost", "127.0.0.1", "::1", "postgres"];
    return local.includes(host) && local.includes(centralHost);
  } catch {
    return false;
  }
})();

const STAMP = Date.now();
const EMAIL = `history-import+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
const CLUB_A = 9841;
const OPP = 9842;
const CLUB_B = 9843;
const CLUB_C = 9844;
const MATCH = 984_101;
const LINE_BASE = 9_841_000;
const J_SMITH = "98410000-0000-4000-8000-000000000007";
const OPP_GUY = "98410000-0000-4000-8000-0000000000ff";
const J_SMITH_ID = 7;

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB_A, "History Import CC"],
    [OPP, "History Opp CC"],
  ] as const) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`H${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name] of [
    [J_SMITH, "J Smith"],
    [OPP_GUY, "Olly Opp"],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, 0, ${CLUB_A}, '2003/04', '2003/04', 1)
    `);
  }
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
      status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${MATCH}, ${`history-import-${MATCH}`}, '2003/04', 'A Grade', 'g', 'One Day', '1', '2003-11-01', 'History Oval',
      'Completed', ${CLUB_A}, ${OPP}, 'History', 'Opp', '5/150', '10/120', ${CLUB_A}, ${CLUB_A}, 'won')
  `);
  await db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
      runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${LINE_BASE}, ${MATCH}, 1, ${CLUB_A}, 'x', 1, ${J_SMITH}, 'x', 50, 50, 0, 0, 100, 'b Bowler', 'bowled', null)
  `);
  await db.execute(sql`
    insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
    values (${LINE_BASE + 1}, ${MATCH}, ${CLUB_A}, 'x', ${J_SMITH}, 'x')
  `);
}

async function cleanCentral(): Promise<void> {
  await db.execute(
    sql`delete from central.match_batting where id >= ${LINE_BASE} and id < ${LINE_BASE + 100}`,
  );
  await db.execute(
    sql`delete from central.match_rosters where id >= ${LINE_BASE} and id < ${LINE_BASE + 100}`,
  );
  await db.execute(sql`delete from central.matches where match_id = ${MATCH}`);
  await db.execute(
    sql`delete from central.players where participant_id in (${J_SMITH}, ${OPP_GUY})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB_A}, ${OPP})`);
}

/** Row counts of everything an import can write, for one tenant. */
async function footprint(tenantId: number): Promise<Record<string, number>> {
  const count = async (table: string) => {
    const res = await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)} where tenant_id = ${tenantId}`,
    );
    return (res.rows[0] as { n: number }).n;
  };
  const tables = [
    "club_history_batches",
    "club_history_batch_coverage",
    "club_history_rows",
    "club_history_curated_rows",
    "player_id_map",
    "player_curation",
    "awards",
    "award_winners",
    "centuries",
    "five_wicket_hauls",
    "club_records",
  ];
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = await count(t);
  return out;
}

describe.skipIf(!isLocalDb)("club history import (platform admin)", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let a: number;
  let b: number;
  let c: number;
  let prevTtl: string | undefined;
  const batches: Record<string, number> = {};
  let draftsBefore = 0;
  let milestonesBefore = 0;

  const base = (tenantId: number) => `/api/platform/admin/tenants/${tenantId}/history-import`;

  const upload = (
    tenantId: number,
    action: "preview" | "commit",
    template: string,
    csv: string,
    fields: Record<string, string> = {},
    cookie = platformCookie,
  ) => {
    let r = request(app)
      .post(`${base(tenantId)}/${action}`)
      .set("Cookie", cookie);
    r = r.field("template", template);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach("file", Buffer.from(csv, "utf8"), "history.csv");
  };

  async function makeTenant(label: string, club: number): Promise<number> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `history-import-${label}-${STAMP}`,
        centralClubId: club,
        name: `History Import ${label}`,
        readsFromCentral: true,
      })
      .returning();
    return row.id;
  }

  const draftCount = async (tenantId: number) =>
    (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId)))
      .length;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-history-import";
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();

    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    a = await makeTenant("a", CLUB_A);
    b = await makeTenant("b", CLUB_B);
    c = await makeTenant("c", CLUB_C);
    await db.insert(playerIdMapTable).values([
      { tenantId: a, participantId: J_SMITH, playerId: J_SMITH_ID },
      { tenantId: a, participantId: OPP_GUY, playerId: 8 },
      { tenantId: c, participantId: "98440000-0000-4000-8000-000000000001", playerId: 89999 },
    ]);

    const [ca] = await db
      .insert(adminsTable)
      .values({ tenantId: a, username: "owner", displayName: "Club", passwordHash })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;

    // A hand-kept award with a hand-added winner: an import may add to it, and
    // undo must leave both alone.
    const [award] = await db
      .insert(awardsTable)
      .values({ tenantId: a, key: "best-clubman", title: "Best Clubman", published: true })
      .returning();
    await db
      .insert(awardWinnersTable)
      .values({ tenantId: a, awardId: award.id, season: 1990, name: "Hand Added" });

    draftsBefore = await draftCount(a);
    milestonesBefore = (
      await db.select().from(milestoneEventsTable).where(eq(milestoneEventsTable.tenantId, a))
    ).length;
  });

  afterAll(async () => {
    process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    await purgeTestTenants([a, b, c]);
    await cleanCentral();
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("refuses anyone but a platform admin, including the club's own admin", async () => {
    for (const cookie of [undefined, clubAdminCookie]) {
      const withCookie = (r: request.Test) => (cookie ? r.set("Cookie", cookie) : r);
      await withCookie(request(app).get(`${base(a)}/batches`)).expect(401);
      await withCookie(request(app).get(`${base(a)}/boundaries`)).expect(401);
      await withCookie(
        request(app)
          .put(`${base(a)}/boundaries`)
          .send({ boundaries: [{ grade: null, startSeason: 2003 }] }),
      ).expect(401);
      await withCookie(request(app).delete(`${base(a)}/batches/1`)).expect(401);
      await withCookie(
        request(app).get("/api/platform/admin/history-import/templates/career"),
      ).expect(401);
      if (cookie) {
        await upload(a, "preview", "career", "x", {}, cookie).expect(401);
        await upload(a, "commit", "career", "x", { label: "x" }, cookie).expect(401);
      }
    }
    const boundaries = await db.execute(
      sql`select count(*)::int as n from club_history_boundaries where tenant_id = ${a}`,
    );
    expect((boundaries.rows[0] as { n: number }).n).toBe(0);
  });

  it("serves the CSV templates", async () => {
    const res = await request(app)
      .get("/api/platform/admin/history-import/templates/honours")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text.split("\r\n")[0]).toBe("type,name,title,season,grade,detail");
  });

  it("sets each club's boundary (senior grades only)", async () => {
    for (const t of [a, b, c]) {
      const res = await request(app)
        .put(`${base(t)}/boundaries`)
        .set("Cookie", platformCookie)
        .send({ boundaries: [{ grade: null, startSeason: 2003 }] })
        .expect(200);
      expect(res.body).toEqual([{ grade: null, startSeason: 2003 }]);
    }
    await request(app)
      .put(`${base(a)}/boundaries`)
      .set("Cookie", platformCookie)
      .send({ boundaries: [{ grade: "Under 15", startSeason: 2003 }] })
      .expect(400);
  });

  const JOHN_CAREER = [
    "player,grade,first_season,last_season,games,runs,wickets",
    "John Smith,A Grade,1995/96,2002/03,120,3150,86",
  ].join("\n");

  it("previews span suggestions without writing anything", async () => {
    const before = await footprint(a);
    const res = await upload(a, "preview", "career", JOHN_CAREER).expect(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].suggestions).toEqual([
      expect.objectContaining({ playerId: J_SMITH_ID, kind: "central", firstSeason: 2003 }),
    ]);
    expect(await footprint(a)).toEqual(before);
  });

  it("AE5: without a confirmed link John Smith becomes a separate pre-digital player", async () => {
    const res = await upload(a, "commit", "career", JOHN_CAREER, {
      label: "Career totals (club book)",
    }).expect(201);
    expect(res.body).toMatchObject({ rows: 1, linkedPlayers: 0, newPlayers: 1 });
    batches.career = res.body.batchId;

    const rows = await db
      .select()
      .from(clubHistoryRowsTable)
      .where(eq(clubHistoryRowsTable.batchId, batches.career));
    expect(rows).toHaveLength(1);
    const johnId = rows[0]!.playerId;
    expect(johnId).not.toBe(J_SMITH_ID);
    expect(johnId).toBeGreaterThan(0);
    expect(johnId).toBeLessThan(90000);
    // Career-totals only: career grain, no season rows.
    expect(rows[0]).toMatchObject({ grain: "career", season: null, runs: 3150, tenantId: a });

    const [map] = await db
      .select()
      .from(playerIdMapTable)
      .where(and(eq(playerIdMapTable.tenantId, a), eq(playerIdMapTable.playerId, johnId)));
    expect(map!.participantId).toMatch(/^club:[0-9a-f-]{36}$/);
    const [cur] = await db
      .select()
      .from(playerCurationTable)
      .where(
        and(
          eq(playerCurationTable.tenantId, a),
          eq(playerCurationTable.participantId, map!.participantId),
        ),
      );
    expect(cur!.overrideDisplayName).toBe("John Smith");
    // J Smith's crosswalk row is untouched.
    const [js] = await db
      .select()
      .from(playerIdMapTable)
      .where(and(eq(playerIdMapTable.tenantId, a), eq(playerIdMapTable.participantId, J_SMITH)));
    expect(js!.playerId).toBe(J_SMITH_ID);
  });

  it("a confirmed span link joins the rows to the central player's id and shows on his page", async () => {
    const csv = [
      "player,grade,first_season,last_season,games,runs",
      "John Smith,B Grade,1999/00,2002/03,40,900",
    ].join("\n");
    const preview = await upload(a, "preview", "career", csv).expect(200);
    const john = preview.body.players[0];
    expect(john.suggestions.map((s: { playerId: number }) => s.playerId)).toContain(J_SMITH_ID);

    const res = await upload(a, "commit", "career", csv, {
      label: "B Grade careers",
      links: JSON.stringify({ [john.key]: J_SMITH_ID }),
    }).expect(201);
    expect(res.body).toMatchObject({ rows: 1, linkedPlayers: 1, newPlayers: 0 });
    batches.linked = res.body.batchId;
    const rows = await db
      .select()
      .from(clubHistoryRowsTable)
      .where(eq(clubHistoryRowsTable.batchId, batches.linked));
    expect(rows.map((r) => r.playerId)).toEqual([J_SMITH_ID]);

    // The public player page combines central (50) and the linked history (900).
    const page = await request(app)
      .get(`/api/players/${J_SMITH_ID}`)
      .set({ "x-tenant-id": String(a) })
      .expect(200);
    expect(page.body).toMatchObject({ id: J_SMITH_ID, totalRuns: 950, totalGames: 41 });
  });

  it("refuses a link to a player that wasn't suggested", async () => {
    const csv = ["player,grade,first_season,last_season,runs", "Zed Zulu,C Grade,1990,1991,5"].join(
      "\n",
    );
    const before = await footprint(a);
    await upload(a, "commit", "career", csv, {
      label: "x",
      links: JSON.stringify({ "zed zulu": 8 }),
    }).expect(400);
    expect(await footprint(a)).toEqual(before);
  });

  it("rejects a row at the boundary with its row number and writes nothing", async () => {
    const csv = [
      "player,grade,season,runs",
      "Ann Able,A Grade,2001/02,100",
      "Ann Able,A Grade,2003/04,200",
    ].join("\n");
    const before = await footprint(a);
    const res = await upload(a, "commit", "season", csv, { label: "Seasons" }).expect(422);
    expect(res.body.preview.errors).toEqual([
      expect.objectContaining({
        row: 3,
        column: "season",
        message: expect.stringMatching(/boundary/),
      }),
    ]);
    expect(await footprint(a)).toEqual(before);
  });

  it("honours land in the club's curated tables, tagged with their batch", async () => {
    const csv = [
      "type,name,title,season,grade,detail",
      "award,John Smith,Club Champion,1999/00,,",
      "award,Ann Able,Best Clubman,1998/99,,",
      "century,Ann Able,,1998/99,A Grade,104*",
      "five_wickets,Ann Able,,1997/98,A Grade,6/12",
      "club_record,Ann Able,Most catches in a season,,A Grade,19",
    ].join("\n");
    const res = await upload(a, "commit", "honours", csv, { label: "Honours book" }).expect(201);
    expect(res.body).toMatchObject({ rows: 0, honours: 5 });
    batches.honours = res.body.batchId;

    const champion = await db
      .select()
      .from(awardsTable)
      .where(and(eq(awardsTable.tenantId, a), eq(awardsTable.key, "club-champion")));
    expect(champion).toHaveLength(1);
    const winners = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.tenantId, a));
    expect(winners.map((w) => w.name).sort()).toEqual(["Ann Able", "Hand Added", "John Smith"]);
    expect(
      await db.select().from(centuriesTable).where(eq(centuriesTable.tenantId, a)),
    ).toMatchObject([{ batsman: "Ann Able", score: "104*", season: "1998/99", grade: "A Grade" }]);
    expect(
      await db.select().from(fiveWicketHaulsTable).where(eq(fiveWicketHaulsTable.tenantId, a)),
    ).toMatchObject([{ bowler: "Ann Able", figures: "6/12", season: "1997/98" }]);
    expect(
      await db.select().from(clubRecordsTable).where(eq(clubRecordsTable.tenantId, a)),
    ).toMatchObject([{ recordType: "Most catches in a season", detail: "Ann Able — 19" }]);
    const tags = await db
      .select()
      .from(clubHistoryCuratedRowsTable)
      .where(eq(clubHistoryCuratedRowsTable.batchId, batches.honours));
    // 5 honours + the award it had to create.
    expect(tags).toHaveLength(6);
  });

  it("KTD8: importing history drafts nothing and emits no milestone events", async () => {
    expect(await draftCount(a)).toBe(draftsBefore);
    const events = await db
      .select()
      .from(milestoneEventsTable)
      .where(eq(milestoneEventsTable.tenantId, a));
    expect(events.length).toBe(milestonesBefore);
  });

  it("one tenant's import never writes another tenant's rows, and B can't undo A's batch", async () => {
    const bBefore = await footprint(b);
    await upload(
      a,
      "commit",
      "career",
      ["player,grade,first_season,last_season,runs", "Bea Bee,C Grade,1990,1992,40"].join("\n"),
      {
        label: "Iso",
      },
    ).expect(201);
    expect(await footprint(b)).toEqual(bBefore);
    await request(app)
      .delete(`${base(b)}/batches/${batches.career}`)
      .set("Cookie", platformCookie)
      .expect(404);
    const listB = await request(app)
      .get(`${base(b)}/batches`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(listB.body).toEqual([]);
    const listA = await request(app)
      .get(`${base(a)}/batches`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(listA.body.map((x: { id: number }) => x.id)).toContain(batches.career);
  });

  it("undo of the honours batch removes exactly its curated rows", async () => {
    const res = await request(app)
      .delete(`${base(a)}/batches/${batches.honours}`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.body).toMatchObject({ honoursRemoved: 5, rowsRemoved: 0 });
    const winners = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.tenantId, a));
    expect(winners.map((w) => w.name)).toEqual(["Hand Added"]);
    const awards = await db.select().from(awardsTable).where(eq(awardsTable.tenantId, a));
    expect(awards.map((x) => x.key)).toEqual(["best-clubman"]);
    for (const t of [centuriesTable, fiveWicketHaulsTable, clubRecordsTable]) {
      expect(await db.select().from(t).where(eq(t.tenantId, a))).toEqual([]);
    }
  });

  it("undo removes every row of the batch and nothing else", async () => {
    const [careerRow] = await db
      .select()
      .from(clubHistoryRowsTable)
      .where(eq(clubHistoryRowsTable.batchId, batches.career));
    const johnId = careerRow!.playerId;
    const otherRows = await db
      .select({ id: clubHistoryRowsTable.id })
      .from(clubHistoryRowsTable)
      .where(
        and(
          eq(clubHistoryRowsTable.tenantId, a),
          sql`${clubHistoryRowsTable.batchId} <> ${batches.career}`,
        ),
      );

    const res = await request(app)
      .delete(`${base(a)}/batches/${batches.career}`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.body).toMatchObject({ rowsRemoved: 1, playersRemoved: 1 });

    expect(
      await db
        .select()
        .from(clubHistoryBatchesTable)
        .where(eq(clubHistoryBatchesTable.id, batches.career)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(clubHistoryRowsTable)
        .where(eq(clubHistoryRowsTable.batchId, batches.career)),
    ).toEqual([]);
    // Every other batch's rows are still there.
    const still = await db
      .select({ id: clubHistoryRowsTable.id })
      .from(clubHistoryRowsTable)
      .where(
        inArray(
          clubHistoryRowsTable.id,
          otherRows.map((r) => r.id),
        ),
      );
    expect(still).toHaveLength(otherRows.length);
    // The synthetic John Smith only this batch used is gone; J Smith stays.
    const ids = (
      await db.select().from(playerIdMapTable).where(eq(playerIdMapTable.tenantId, a))
    ).map((r) => r.playerId);
    expect(ids).not.toContain(johnId);
    expect(ids).toContain(J_SMITH_ID);
  });

  it("never mints a synthetic id at or above 90000", async () => {
    const before = await footprint(c);
    const res = await upload(
      c,
      "commit",
      "career",
      ["player,grade,first_season,last_season,runs", "Cy Ceiling,A Grade,1990,1991,5"].join("\n"),
      { label: "Ceiling" },
    ).expect(409);
    expect(res.body.error).toMatch(/90000/);
    expect(await footprint(c)).toEqual(before);
    const high = await db
      .select()
      .from(playerIdMapTable)
      .where(
        and(
          isNotNull(playerIdMapTable.playerId),
          sql`${playerIdMapTable.playerId} >= 90000`,
          sql`${playerIdMapTable.participantId} like 'club:%'`,
        ),
      );
    expect(high).toEqual([]);
  });

  it("gives a clear error when the history tables are missing", async () => {
    await db.execute(
      sql`alter table club_history_curated_rows rename to club_history_curated_rows_off`,
    );
    try {
      const res = await upload(a, "preview", "career", JOHN_CAREER).expect(503);
      expect(res.body.error).toMatch(/migrations 0021 and 0022/);
      const list = await request(app)
        .get(`${base(a)}/batches`)
        .set("Cookie", platformCookie)
        .expect(503);
      expect(list.body.error).toMatch(/migrations 0021 and 0022/);
    } finally {
      await db.execute(
        sql`alter table club_history_curated_rows_off rename to club_history_curated_rows`,
      );
    }
  });
});
