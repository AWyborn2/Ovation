import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  playerIdMapTable,
  playerCurationTable,
} from "@workspace/db";
import { clearMilestonesCache } from "../lib/milestones-cache";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * An admin of a club that reads central stats fixes a player's name from the
 * player editor (PATCH /players/:id). The name is stored as the club's own
 * rename (player_curation) and shows on the profile and in the directory; the
 * central database and the native tables are never written.
 *
 * Seeds one tiny central club (9711, against 9712): K "Agamveer Singh" (the
 * keeper), D "Amninder Singh" merged into K, and a private player Q. Tenant T
 * reads club 9711; tenant U reads club 9713 and has no crosswalk to T's ids.
 *
 * Real-DB integration, central rows written with raw SQL only when the
 * database is local (the app itself never writes central).
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
const CLUB = 9711;
const OPP = 9712;
const CLUB_U = 9713;
const MATCH = 971101;
const LINE_BASE = 9_710_000;
const K = "97110000-0000-4000-8000-00000000000a";
const D = "97110000-0000-4000-8000-00000000000b";
const Q = "97110000-0000-4000-8000-00000000000f";
const O = "97110000-0000-4000-8000-0000000000ff";

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB, "Rename Test CC"],
    [OPP, "Rename Opp CC"],
    [CLUB_U, "Rename Other CC"],
  ] as const) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`R${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name, priv] of [
    [K, "Agamveer Singh", 0],
    [D, "Amninder Singh", 0],
    [Q, "Pat Private", 1],
    [O, "Olly Opp", 0],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, ${priv}, ${CLUB}, '2024/25', '2024/25', 1)
    `);
  }
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
      status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${MATCH}, ${`rename-test-${MATCH}`}, '2024/25', 'A Grade', 'grade-a', 'One Day', '1', '2024-11-01',
      'Rename Oval', 'Completed', ${CLUB}, ${OPP}, 'Rename Test CC', 'Rename Opp CC', '5/150', '10/120', ${CLUB}, ${CLUB},
      'Rename Test CC won')
  `);
  let id = LINE_BASE;
  for (const [guid, club] of [
    [K, CLUB],
    [D, CLUB],
    [Q, CLUB],
    [O, OPP],
  ] as const) {
    const home = club === CLUB;
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${MATCH}, ${home ? 1 : 2}, ${club}, 'x', 1, ${guid}, 'x', 20, 20, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${MATCH}, ${club}, 'x', ${guid}, 'x')
    `);
  }
}

async function cleanCentral(): Promise<void> {
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.matches where match_id = ${MATCH}`);
  await db.execute(
    sql`delete from central.players where participant_id in (${K}, ${D}, ${Q}, ${O})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB}, ${OPP}, ${CLUB_U})`);
}

describe.skipIf(!isLocalDb)("admins rename players of a central-read club", () => {
  const tenantIds: number[] = [];
  const adminIds: number[] = [];
  const idOf: Record<string, number> = {};
  let t: number;
  let u: number;
  let cookieT: string;
  let cookieU: string;
  let prevTtl: string | undefined;

  const patch = (tenantId: number, cookie: string, id: number, body: object) =>
    request(app)
      .patch(`/api/players/${id}`)
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookie)
      .send(body);
  const profile = (tenantId: number, id: number) =>
    request(app).get(`/api/players/${id}`).set("x-tenant-id", String(tenantId));
  const curationRow = async (participantId: string) =>
    (
      await db
        .select()
        .from(playerCurationTable)
        .where(
          and(
            eq(playerCurationTable.tenantId, t),
            eq(playerCurationTable.participantId, participantId),
          ),
        )
    )[0];

  async function makeTenant(label: string, club: number): Promise<{ id: number; cookie: string }> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `rename-central-${label}-${STAMP}`,
        centralClubId: club,
        name: `Rename Central ${label}`,
        readsFromCentral: true,
      })
      .returning();
    tenantIds.push(row.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: row.id,
        username: `rename_central_${label}_${STAMP}`,
        displayName: "Rename Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    return {
      id: row.id,
      cookie: `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`,
    };
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-rename-central";
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();
    for (const g of [K, D, Q]) {
      const [p] = await db
        .insert(playersTable)
        .values({ surname: `Renamecentral${STAMP}`, givenName: g.slice(-2) })
        .returning();
      idOf[g] = p.id;
    }
    ({ id: t, cookie: cookieT } = await makeTenant("t", CLUB));
    ({ id: u, cookie: cookieU } = await makeTenant("u", CLUB_U));
    await db
      .insert(playerIdMapTable)
      .values([K, D, Q].map((g) => ({ tenantId: t, participantId: g, playerId: idOf[g]! })));
    await db.insert(playerCurationTable).values({
      tenantId: t,
      participantId: D,
      mergedIntoParticipantId: K,
      mergeStatus: "confirmed",
    });
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(playerCurationTable).where(inArray(playerCurationTable.tenantId, tenantIds));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
    await db.delete(playersTable).where(inArray(playersTable.id, Object.values(idOf)));
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    clearMilestonesCache();
  });

  beforeEach(() => clearMilestonesCache());

  it("shows the central name until the club renames the player", async () => {
    const res = await profile(t, idOf[K]!).expect(200);
    expect({ givenName: res.body.givenName, surname: res.body.surname }).toEqual({
      givenName: "Agamveer",
      surname: "Singh",
    });
  });

  it("stores the rename as the club's own override and shows it everywhere", async () => {
    const res = await patch(t, cookieT, idOf[K]!, { givenName: "Amninder" }).expect(200);
    expect(res.body).toMatchObject({ id: idOf[K], givenName: "Amninder", surname: "Singh" });
    expect((await curationRow(K))?.overrideDisplayName).toBe("Amninder Singh");

    const prof = await profile(t, idOf[K]!).expect(200);
    expect([prof.body.givenName, prof.body.surname]).toEqual(["Amninder", "Singh"]);

    const dir = await request(app)
      .get("/api/players?limit=100")
      .set("x-tenant-id", String(t))
      .expect(200);
    const rows = (Array.isArray(dir.body) ? dir.body : dir.body.players) as {
      id: number;
      givenName: string;
    }[];
    expect(rows.find((r) => r.id === idOf[K])?.givenName).toBe("Amninder");
  });

  it("renames the keeper through a merged-away id and keeps the merge", async () => {
    await patch(t, cookieT, idOf[D]!, { givenName: "Aman", surname: "Singh" }).expect(200);
    expect((await curationRow(K))?.overrideDisplayName).toBe("Aman Singh");
    const merged = await curationRow(D);
    expect(merged).toMatchObject({ mergedIntoParticipantId: K, mergeStatus: "confirmed" });
    expect(merged?.overrideDisplayName ?? null).toBeNull();
  });

  it("keeps a merge decision already stored on the renamed row", async () => {
    await db
      .update(playerCurationTable)
      .set({ mergedIntoParticipantId: Q, mergeStatus: "rejected" })
      .where(and(eq(playerCurationTable.tenantId, t), eq(playerCurationTable.participantId, K)));
    await patch(t, cookieT, idOf[K]!, { surname: "Singh-Gill" }).expect(200);
    expect(await curationRow(K)).toMatchObject({
      overrideDisplayName: "Aman Singh-Gill",
      mergedIntoParticipantId: Q,
      mergeStatus: "rejected",
    });
  });

  it("stores a several-word surname so it reads back the same", async () => {
    await patch(t, cookieT, idOf[K]!, { givenName: "Aman", surname: "van der Singh" }).expect(200);
    const prof = await profile(t, idOf[K]!).expect(200);
    expect([prof.body.givenName, prof.body.surname]).toEqual(["Aman", "van der Singh"]);
  });

  it("clears the override when the name is set back to the central one", async () => {
    await patch(t, cookieT, idOf[K]!, { givenName: "Agamveer", surname: "Singh" }).expect(200);
    expect((await curationRow(K))?.overrideDisplayName ?? null).toBeNull();
  });

  it("refuses fields other than the name, and a blank name", async () => {
    await patch(t, cookieT, idOf[K]!, { deceased: true }).expect(400);
    await patch(t, cookieT, idOf[K]!, { givenName: " ", surname: "" }).expect(400);
  });

  it("never renames a private player or another club's player", async () => {
    await patch(t, cookieT, idOf[Q]!, { givenName: "Shown" }).expect(404);
    await patch(u, cookieU, idOf[K]!, { givenName: "Stolen" }).expect(404);
    await patch(t, cookieU, idOf[K]!, { givenName: "Stolen" }).expect(401);
  });

  it("needs a signed-in admin", async () => {
    await request(app)
      .patch(`/api/players/${idOf[K]}`)
      .set("x-tenant-id", String(t))
      .send({ givenName: "Anon" })
      .expect(401);
  });
});
