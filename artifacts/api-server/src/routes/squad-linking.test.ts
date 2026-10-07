import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, squadMembersTable, playerIdMapTable } from "@workspace/db";
import { SESSION_COOKIE, encodeSession } from "../lib/auth";
import { buildParticipantCsv, participantRow } from "../test/fixtures/playhq-participants";

/**
 * Squad player linking (first initial + surname against the club's central
 * players) and the admin player search for manual linking.
 *
 * Tenant A reads central club 9811, tenant B club 9812. Central (all A Grade
 * unless noted):
 *
 *   M1 2022/23  A v OPP   J Barnes (old GUID)
 *   M2 2025/26  A v OPP   J Wyllie, j barnes (new GUID), S Twin ×2, P Hidden
 *                         (private, batting line only), U Nomap (no crosswalk
 *                         row), F Filler (fill-in id), D Dup, B Jones, K Same
 *   M3 2025/26  A v OPP   Under 15 — Y Young (junior only: never a candidate)
 *   M4 2025/26  B v OPP   O Other (club B's player)
 *
 * Real-DB integration (DATABASE_URL and CENTRAL_DATABASE_URL are the same
 * throwaway Postgres). Central rows are written through the TENANT `db` with
 * raw SQL, only when the database is local — the app itself never writes
 * central. Every participant row is fake.
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
const CLUB_A = 9811;
const CLUB_B = 9812;
const OPP = 9813;
const [M1, M2, M3, M4] = [981_101, 981_102, 981_103, 981_104];
const LINE_BASE = 9_811_000;

const guid = (n: number) => `98110000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = {
  wyllie: guid(1),
  barnesOld: guid(2),
  barnesNew: guid(3),
  twin1: guid(4),
  twin2: guid(5),
  hidden: guid(6),
  nomap: guid(7),
  filler: guid(8),
  young: guid(9),
  other: guid(10),
  dup: guid(11),
  jones: guid(12),
  same: guid(13),
};

/** Tenant A's crosswalk (Wyllie's row is added between the two imports). */
const MAP_A: Array<[string, number]> = [
  [P.barnesOld, 502],
  [P.barnesNew, 503],
  [P.twin1, 504],
  [P.twin2, 505],
  [P.hidden, 506],
  [P.filler, 90001],
  [P.young, 507],
  [P.dup, 508],
  [P.jones, 509],
  [P.same, 510],
];

let lineId = LINE_BASE;
const roster = (m: number, club: number, pid: string, name: string) =>
  db.execute(sql`
    insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
    values (${lineId++}, ${m}, ${club}, 'x', ${pid}, ${name})
  `);
const bat = (m: number, club: number, pid: string, name: string) =>
  db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
      runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${m}, 1, ${club}, 'x', 1, ${pid}, ${name}, 10, 10, 0, 0, 100, 'b Bowler', 'bowled', null)
  `);

async function seedCentral(): Promise<void> {
  for (const id of [CLUB_A, CLUB_B, OPP]) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${`Link CC ${id}`}, ${`L${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [m, season, grade, home] of [
    [M1, "2022/23", "A Grade", CLUB_A],
    [M2, "2025/26", "A Grade", CLUB_A],
    [M3, "2025/26", "Under 15", CLUB_A],
    [M4, "2025/26", "A Grade", CLUB_B],
  ] as const) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`squad-link-${m}`}, ${season}, ${grade}, 'g', 'One Day', '4', '2025-11-02', 'Link Oval',
        'Completed', ${home}, ${OPP}, 'Home', 'Opp', '5/150', '10/120', ${home}, ${home}, 'won')
    `);
  }
  await db.execute(sql`
    insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
    values (${P.wyllie}, 'Jordan Wyllie', 0, ${CLUB_A}, '2025/26', '2025/26', 1),
           (${P.hidden}, 'P Hidden', 1, ${CLUB_A}, '2025/26', '2025/26', 1)
  `);
  await roster(M1, CLUB_A, P.barnesOld, "J Barnes");
  await roster(M2, CLUB_A, P.wyllie, "J Wyllie");
  await roster(M2, CLUB_A, P.barnesNew, "j barnes");
  await roster(M2, CLUB_A, P.twin1, "S Twin");
  await roster(M2, CLUB_A, P.twin2, "S Twin");
  await bat(M2, CLUB_A, P.hidden, "P Hidden");
  await roster(M2, CLUB_A, P.nomap, "U Nomap");
  await roster(M2, CLUB_A, P.filler, "F Filler");
  await roster(M2, CLUB_A, P.dup, "D Dup");
  await roster(M2, CLUB_A, P.jones, "B Jones");
  await roster(M2, CLUB_A, P.same, "K Same");
  await roster(M3, CLUB_A, P.young, "Y Young");
  await roster(M4, CLUB_B, P.other, "O Other");
}

async function cleanCentral(): Promise<void> {
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.matches where match_id in (${M1}, ${M2}, ${M3}, ${M4})`);
  await db.execute(
    sql`delete from central.players where participant_id in (${P.wyllie}, ${P.hidden})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB_A}, ${CLUB_B}, ${OPP})`);
}

const row = (n: number, first: string, last: string, preferred = "") =>
  participantRow({
    "First Name": first,
    "Last Name": last,
    "Preferred Name": preferred,
    // Export profile ids are NOT central participant GUIDs.
    "Profile ID": `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    "Date of Birth": "01/01/1995",
  });

const WYLLIE = row(1, "Jordan", "Wyllie");
const BARNES = row(2, "Jack", "Barnes");
const TWIN = row(3, "Sam", "Twin");
const HIDDEN = row(4, "Pat", "Hidden");
const NOMAP = row(5, "Uma", "Nomap");
const FILLER = row(6, "Fred", "Filler");
const YOUNG = row(7, "Yan", "Young");
const OTHER = row(8, "Olly", "Other");
const DUP = row(9, "Dan", "Dup");
const JONES = row(10, "William", "Jones", "Bill");
const SAME_1 = row(11, "Kai", "Same");
const SAME_2 = row(12, "Kim", "Same");
const FILE = [
  WYLLIE,
  BARNES,
  TWIN,
  HIDDEN,
  NOMAP,
  FILLER,
  YOUNG,
  OTHER,
  DUP,
  JONES,
  SAME_1,
  SAME_2,
];

describe.skipIf(!isLocalDb)("squad player linking", () => {
  let tenantA: number;
  let tenantB: number;
  let adminA: number;
  let adminB: number;
  let cookieA: string;
  let cookieB: string;
  let dupHolder: number;

  const upload = (csv: string) =>
    request(app)
      .post("/api/squad/import")
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .attach("file", Buffer.from(csv, "utf8"), "participants.csv");

  const search = (cookie: string, tenantId: number, q: string) =>
    request(app)
      .get("/api/squad/player-search")
      .query({ q })
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));

  async function linkOf(r: Record<string, string>): Promise<number | null> {
    const [m] = await db
      .select({ linkedPlayerId: squadMembersTable.linkedPlayerId })
      .from(squadMembersTable)
      .where(
        and(
          eq(squadMembersTable.tenantId, tenantA),
          eq(squadMembersTable.playhqProfileId, r["Profile ID"]),
        ),
      );
    return m.linkedPlayerId;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-squad-link";
    await cleanCentral();
    await seedCentral();
    const [a] = await db
      .insert(tenantsTable)
      .values({
        slug: `squad-link-a-${STAMP}`,
        centralClubId: CLUB_A,
        readsFromCentral: true,
        name: "Link A",
      })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({
        slug: `squad-link-b-${STAMP}`,
        centralClubId: CLUB_B,
        readsFromCentral: true,
        name: "Link B",
      })
      .returning();
    tenantA = a.id;
    tenantB = b.id;
    const admin = async (tenantId: number, username: string) =>
      (
        await db
          .insert(adminsTable)
          .values({ tenantId, username, displayName: username, passwordHash: "x" })
          .returning()
      )[0].id;
    adminA = await admin(tenantA, `squad_link_a_${STAMP}`);
    adminB = await admin(tenantB, `squad_link_b_${STAMP}`);
    cookieA = `${SESSION_COOKIE}=${encodeSession({ adminId: adminA, issuedAt: Date.now() })}`;
    cookieB = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB, issuedAt: Date.now() })}`;

    await db.insert(playerIdMapTable).values([
      ...MAP_A.map(([participantId, playerId]) => ({
        tenantId: tenantA,
        participantId,
        playerId,
      })),
      { tenantId: tenantB, participantId: P.other, playerId: 601 },
    ]);
    // An admin already linked another member to D Dup's player.
    const [holder] = await db
      .insert(squadMembersTable)
      .values({ tenantId: tenantA, firstName: "Hand", lastName: "Linked", linkedPlayerId: 508 })
      .returning();
    dupHolder = holder.id;
  });

  afterAll(async () => {
    for (const t of [tenantA, tenantB]) {
      await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, t));
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, t));
    }
    await db.delete(adminsTable).where(inArray(adminsTable.id, [adminA, adminB]));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantA, tenantB]));
    await cleanCentral();
  });

  it("links on first initial + surname against the club's central players", async () => {
    const res = await upload(buildParticipantCsv(FILE)).expect(200);
    // Barnes, Hidden, Jones.
    expect(res.body).toMatchObject({ created: FILE.length, linked: 3 });
    // The more recent of two GUIDs for "J Barnes", whatever the case.
    expect(await linkOf(BARNES)).toBe(503);
    // A private player still links (the link is admin-only).
    expect(await linkOf(HIDDEN)).toBe(506);
    // Bill (preferred) and William both key b|jones / w|jones: only B Jones exists.
    expect(await linkOf(JONES)).toBe(509);
  });

  it("never links a tie, an unmapped participant, a fill-in, a junior-only or another club's player", async () => {
    expect(await linkOf(TWIN)).toBeNull(); // two S Twins, same season
    expect(await linkOf(NOMAP)).toBeNull(); // no crosswalk row
    expect(await linkOf(FILLER)).toBeNull(); // id 90001
    expect(await linkOf(YOUNG)).toBeNull(); // Under 15 only
    expect(await linkOf(OTHER)).toBeNull(); // club B's player
    expect(await linkOf(WYLLIE)).toBeNull(); // no crosswalk row yet
  });

  it("never reuses a linked player or links a name shared within the file", async () => {
    expect(await linkOf(DUP)).toBeNull(); // 508 already belongs to another member
    expect(await linkOf(SAME_1)).toBeNull();
    expect(await linkOf(SAME_2)).toBeNull();
    const [holder] = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.id, dupHolder));
    expect(holder.linkedPlayerId).toBe(508);
  });

  it("re-importing the file links members an earlier import couldn't", async () => {
    await db
      .insert(playerIdMapTable)
      .values({ tenantId: tenantA, participantId: P.wyllie, playerId: 501 });
    const res = await upload(buildParticipantCsv(FILE)).expect(200);
    expect(res.body).toMatchObject({ created: 0, updated: FILE.length, linked: 1 });
    expect(await linkOf(WYLLIE)).toBe(501);
    // Existing links are untouched.
    expect(await linkOf(BARNES)).toBe(503);
  });

  it("names the linked player on the squad list and the member detail", async () => {
    const list = await request(app)
      .get("/api/squad")
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .expect(200);
    const byLast = new Map<string, { id: number; linkedPlayerName: string | null }>(
      list.body.map((m: { lastName: string; id: number; linkedPlayerName: string | null }) => [
        m.lastName,
        m,
      ]),
    );
    expect(byLast.get("Wyllie")?.linkedPlayerName).toBe("Jordan Wyllie");
    expect(byLast.get("Barnes")?.linkedPlayerName).toBe("j barnes");
    expect(byLast.get("Twin")?.linkedPlayerName).toBeNull();
    const detail = await request(app)
      .get(`/api/squad/${byLast.get("Wyllie")!.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .expect(200);
    expect(detail.body.linkedPlayerName).toBe("Jordan Wyllie");
  });

  it("refuses linking a player already linked to another member (409)", async () => {
    const [twin] = await db
      .select({ id: squadMembersTable.id })
      .from(squadMembersTable)
      .where(
        and(
          eq(squadMembersTable.tenantId, tenantA),
          eq(squadMembersTable.playhqProfileId, TWIN["Profile ID"]),
        ),
      );
    await request(app)
      .patch(`/api/squad/${twin.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .send({ linkedPlayerId: 503 })
      .expect(409);
    const ok = await request(app)
      .patch(`/api/squad/${twin.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .send({ linkedPlayerId: 504 })
      .expect(200);
    expect(ok.body).toMatchObject({ linkedPlayerId: 504, linkedPlayerName: "S Twin" });
  });

  describe("player search", () => {
    it("is admin only and needs two letters", async () => {
      await request(app)
        .get("/api/squad/player-search")
        .query({ q: "barnes" })
        .set("x-tenant-id", String(tenantA))
        .expect(401);
      await search(cookieA, tenantA, "b").expect(400);
      await search(cookieA, tenantA, " b ").expect(400);
      // Tenant B's admin can't search tenant A.
      await search(cookieB, tenantA, "barnes").expect(401);
    });

    it("finds club players most recent first, with who they're linked to", async () => {
      const res = await search(cookieA, tenantA, "BARNES").expect(200);
      expect(res.body).toEqual([
        {
          playerId: 503,
          displayName: "j barnes",
          lastSeason: "2025/26",
          alreadyLinkedTo: { memberId: expect.any(Number), name: "Jack Barnes" },
        },
        { playerId: 502, displayName: "J Barnes", lastSeason: "2022/23", alreadyLinkedTo: null },
      ]);
    });

    it("includes private players but never a fill-in, a junior-only or an unmapped one", async () => {
      const ids = async (q: string) =>
        (await search(cookieA, tenantA, q).expect(200)).body.map(
          (h: { playerId: number }) => h.playerId,
        );
      expect(await ids("hidden")).toEqual([506]);
      expect(await ids("filler")).toEqual([]);
      expect(await ids("young")).toEqual([]);
      expect(await ids("nomap")).toEqual([]);
    });

    it("is tenant-isolated", async () => {
      expect((await search(cookieA, tenantA, "other").expect(200)).body).toEqual([]);
      const b = await search(cookieB, tenantB, "other").expect(200);
      expect(b.body).toEqual([
        { playerId: 601, displayName: "O Other", lastSeason: "2025/26", alreadyLinkedTo: null },
      ]);
      // Tenant A's members never show as linked in tenant B.
      expect((await search(cookieB, tenantB, "barnes").expect(200)).body).toEqual([]);
    });
  });
});
