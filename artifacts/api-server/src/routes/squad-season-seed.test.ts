import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { asc, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  availabilitySettingsTable,
  fixturesTable,
  playerIdMapTable,
  squadMembersTable,
  teamListsTable,
  type TeamListPlayer,
} from "@workspace/db";
import { SESSION_COOKIE, encodeSession } from "../lib/auth";
import { autoSeedSquadIfEmpty, seasonWindow, seedSquadFromSeason } from "../lib/squad-season-seed";
import { buildParticipantCsv, participantRow } from "../test/fixtures/playhq-participants";

/**
 * The squad register from this season's games (`POST /squad/seed-from-season`,
 * the automatic seed) and the participant import adopting seeded members.
 *
 * Tenant A reads central club 9821; tenant B is another club with its own
 * team list; tenants C and D test the automatic seed. This season (from
 * 1 July, Perth) tenant A has:
 *   - a published PlayHQ team list, A Grade: Jack Wyllie (701), Frankie
 *     Fillin (95002), Ezra Existing (702, already a member);
 *   - a later published admin list, B Grade: Jack Wyllie (701), Tara Typed
 *     (no id);
 *   - an unpublished list (Una Published), an Under 15 list (Jun Ior) and a
 *     list from last season (Old Season) — none read;
 *   - central A Grade: J Wyllie (same GUID as 701), Casey Barnes ("Barnes,
 *     Casey", 703, private), K Initial (line name only, 704), F Filler (90001);
 *   - central Under 15: Y Young (705) — never read.
 *
 * Real-DB integration (DATABASE_URL and CENTRAL_DATABASE_URL are the same
 * throwaway Postgres). Central rows are written through the TENANT `db` with
 * raw SQL, only when the database is local. Every person here is fake.
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
const CLUB_A = 9821;
const OPP = 9823;
const [M1, M2] = [982_101, 982_102];
const LINE_BASE = 9_821_000;
const NOW = new Date();
const SEASON = seasonWindow(NOW);
/** A date `days` into this season, as `YYYY-MM-DD` and a Perth-afternoon instant. */
const seasonDay = (days: number) =>
  new Date(Date.parse(`${SEASON.from}T06:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const seasonAt = (days: number) => new Date(`${seasonDay(days)}T05:00:00Z`);

const guid = (n: number) => `98210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = {
  wyllie: guid(1),
  barnes: guid(2),
  initial: guid(3),
  filler: guid(4),
  young: guid(5),
};

let lineId = LINE_BASE;
const roster = (m: number, club: number, pid: string, name: string) =>
  db.execute(sql`
    insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
    values (${lineId++}, ${m}, ${club}, 'x', ${pid}, ${name})
  `);

async function cleanCentral(): Promise<void> {
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`;
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.matches where match_id in (${M1}, ${M2})`);
  await db.execute(sql`delete from central.players where participant_id = ${P.barnes}`);
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB_A}, ${OPP})`);
}

async function seedCentral(): Promise<void> {
  for (const id of [CLUB_A, OPP]) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${`Seed CC ${id}`}, ${`S${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  const season = `${SEASON.startYear}/${String((SEASON.startYear + 1) % 100).padStart(2, "0")}`;
  for (const [m, grade] of [
    [M1, "A Grade"],
    [M2, "Under 15"],
  ] as const) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`squad-seed-${m}`}, ${season}, ${grade}, 'g', 'One Day', '1', ${seasonDay(20)}, 'Seed Oval',
        'Completed', ${CLUB_A}, ${OPP}, 'Home', 'Opp', '5/150', '10/120', ${CLUB_A}, ${CLUB_A}, 'won')
    `);
  }
  await db.execute(sql`
    insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
    values (${P.barnes}, 'Barnes, Casey', 1, ${CLUB_A}, ${season}, ${season}, 1)
  `);
  await roster(M1, CLUB_A, P.wyllie, "J Wyllie");
  await roster(M1, CLUB_A, P.barnes, "C Barnes");
  await roster(M1, CLUB_A, P.initial, "K Initial");
  await roster(M1, CLUB_A, P.filler, "F Filler");
  await roster(M2, CLUB_A, P.young, "Y Young");
}

describe.skipIf(!isLocalDb)("squad register from this season's games", () => {
  const tenants: Record<"A" | "B" | "C" | "D", number> = { A: 0, B: 0, C: 0, D: 0 };
  let cookieA: string;
  let cookieB: string;
  let existingId: number;
  const adminIds: number[] = [];

  async function addList(
    tenantId: number,
    grade: string,
    startAt: Date,
    players: TeamListPlayer[],
    opts: { published?: boolean; source?: string } = {},
  ) {
    const [fx] = await db
      .insert(fixturesTable)
      .values({ tenantId, grade, opponentName: "Opp", startAt })
      .returning();
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: fx.id,
      players,
      isPublished: opts.published ?? true,
      source: opts.source ?? "admin",
    });
  }

  const members = (tenantId: number) =>
    db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.tenantId, tenantId))
      .orderBy(asc(squadMembersTable.lastName), asc(squadMembersTable.firstName));

  const seed = (cookie: string | null, tenantId: number) => {
    const r = request(app).post("/api/squad/seed-from-season").set("x-tenant-id", String(tenantId));
    return cookie ? r.set("Cookie", cookie) : r;
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-squad-seed";
    await cleanCentral();
    await seedCentral();
    for (const [key, club] of [
      ["A", CLUB_A],
      ["B", 9824],
      ["C", 9825],
      ["D", 9826],
    ] as const) {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `squad-seed-${key.toLowerCase()}-${STAMP}`,
          centralClubId: club,
          readsFromCentral: true,
          name: `Seed ${key}`,
        })
        .returning();
      tenants[key] = t.id;
    }
    const admin = async (tenantId: number, username: string) => {
      const [a] = await db
        .insert(adminsTable)
        .values({ tenantId, username, displayName: username, passwordHash: "x" })
        .returning();
      adminIds.push(a.id);
      return `${SESSION_COOKIE}=${encodeSession({ adminId: a.id, issuedAt: Date.now() })}`;
    };
    cookieA = await admin(tenants.A, `squad_seed_a_${STAMP}`);
    cookieB = await admin(tenants.B, `squad_seed_b_${STAMP}`);

    await db.insert(playerIdMapTable).values(
      (
        [
          [P.wyllie, 701],
          [P.barnes, 703],
          [P.initial, 704],
          [P.filler, 90001],
          [P.young, 705],
        ] as const
      ).map(([participantId, playerId]) => ({ tenantId: tenants.A, participantId, playerId })),
    );

    const A = tenants.A;
    await addList(
      A,
      "A Grade",
      seasonAt(10),
      [
        { order: 1, playerId: 701, displayName: "Jack Wyllie", participantId: P.wyllie },
        { order: 2, playerId: 95002, displayName: "Frankie Fillin" },
        { order: 3, playerId: 702, displayName: "Ezra Existing" },
      ],
      { source: "playhq" },
    );
    await addList(A, "B Grade", seasonAt(40), [
      { order: 1, playerId: 701, displayName: "Jack Wyllie" },
      { order: 2, displayName: "Tara Typed" },
    ]);
    await addList(A, "A Grade", seasonAt(41), [{ order: 1, displayName: "Una Published" }], {
      published: false,
    });
    await addList(A, "Under 15", seasonAt(42), [{ order: 1, displayName: "Jun Ior" }]);
    await addList(A, "A Grade", seasonAt(-30), [{ order: 1, displayName: "Old Season" }]);
    await addList(tenants.B, "A Grade", seasonAt(12), [{ order: 1, displayName: "Bea Other" }]);
    await addList(tenants.C, "A Grade", seasonAt(12), [{ order: 1, displayName: "Cal Auto" }]);
    await addList(tenants.D, "A Grade", seasonAt(12), [{ order: 1, displayName: "Dee Auto" }]);

    const [existing] = await db
      .insert(squadMembersTable)
      .values({
        tenantId: A,
        firstName: "Ezra",
        lastName: "Existing",
        linkedPlayerId: 702,
        active: false,
        activeSetByAdmin: true,
        accountHolderMobile: "0400000702",
      })
      .returning();
    existingId = existing.id;
  });

  afterAll(async () => {
    for (const t of Object.values(tenants)) {
      if (!t) continue;
      await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, t));
      await db.delete(availabilitySettingsTable).where(eq(availabilitySettingsTable.tenantId, t));
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, t));
      await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, t));
      await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, t));
    }
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, Object.values(tenants)));
    await cleanCentral();
  });

  it("is admin only (401)", async () => {
    expect((await seed(null, tenants.A)).status).toBe(401);
    // Another club's admin session does not reach this club.
    expect((await seed(cookieB, tenants.A)).status).toBe(401);
  });

  it("adds this season's senior players with their fullest name, grade and link", async () => {
    const res = await seed(cookieA, tenants.A);
    expect(res.status).toBe(200);
    // Wyllie, Typed, Barnes, Initial added; Ezra already present; the two fill-ins skipped.
    expect(res.body).toEqual({ added: 4, skipped: 2, alreadyPresent: 1 });

    const rows = await members(tenants.A);
    const view = rows.map((m) => ({
      name: `${m.firstName} ${m.lastName}`,
      grade: m.gradeHint,
      link: m.linkedPlayerId,
      private: m.isPrivate,
    }));
    expect(view).toEqual([
      { name: "Casey Barnes", grade: "A Grade", link: 703, private: true },
      { name: "Ezra Existing", grade: null, link: 702, private: false },
      { name: "K Initial", grade: "A Grade", link: 704, private: false },
      { name: "Tara Typed", grade: "B Grade", link: null, private: false },
      // Most recent appearance: the B Grade list on day 40 (central's game was day 20).
      { name: "Jack Wyllie", grade: "B Grade", link: 701, private: false },
    ]);
    for (const m of rows.filter((r) => r.id !== existingId)) {
      expect(m).toMatchObject({
        section: "senior",
        active: true,
        playhqProfileId: null,
        accountHolderMobile: null,
        accountHolderEmail: null,
        guardian1Mobile: null,
      });
    }
  });

  it("leaves an existing member untouched and adds no one twice", async () => {
    const [before] = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.id, existingId));
    const res = await seed(cookieA, tenants.A);
    expect(res.body).toEqual({ added: 0, skipped: 2, alreadyPresent: 5 });
    const [after] = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.id, existingId));
    expect(after).toEqual(before);
    expect(after).toMatchObject({ active: false, accountHolderMobile: "0400000702" });
    expect(await members(tenants.A)).toHaveLength(5);
  });

  it("never reads junior grades, unpublished lists, last season or fill-ins", async () => {
    const names = (await members(tenants.A)).map((m) => m.lastName);
    for (const absent of ["Ior", "Young", "Published", "Season", "Fillin", "Filler"]) {
      expect(names).not.toContain(absent);
    }
  });

  it("is tenant-isolated", async () => {
    expect((await members(tenants.B)).map((m) => m.lastName)).toEqual([]);
    const res = await seed(cookieB, tenants.B);
    expect(res.body).toEqual({ added: 1, skipped: 0, alreadyPresent: 0 });
    expect((await members(tenants.B)).map((m) => m.lastName)).toEqual(["Other"]);
    expect(await members(tenants.A)).toHaveLength(5);
  });

  it("auto-seeds once, only while the register is empty and the club was never seeded", async () => {
    const C = tenants.C;
    expect(await autoSeedSquadIfEmpty(C, NOW)).toEqual({ added: 1, skipped: 0, alreadyPresent: 0 });
    const [settings] = await db
      .select()
      .from(availabilitySettingsTable)
      .where(eq(availabilitySettingsTable.tenantId, C));
    expect(settings.seasonSeededAt).toBeInstanceOf(Date);
    expect(settings.enabled).toBe(false);
    expect(await autoSeedSquadIfEmpty(C, NOW)).toBeNull();

    // A club that empties its register on purpose is not re-filled…
    await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, C));
    expect(await autoSeedSquadIfEmpty(C, NOW)).toBeNull();
    expect(await members(C)).toHaveLength(0);
    // …but the admin's button still works.
    expect(await seedSquadFromSeason(C, NOW)).toMatchObject({ added: 1 });
  });

  it("does not auto-seed a club whose register already has members", async () => {
    const D = tenants.D;
    await db
      .insert(squadMembersTable)
      .values({ tenantId: D, firstName: "Hand", lastName: "Added" });
    expect(await autoSeedSquadIfEmpty(D, NOW)).toBeNull();
    expect((await members(D)).map((m) => m.lastName)).toEqual(["Added"]);
    const settings = await db
      .select()
      .from(availabilitySettingsTable)
      .where(eq(availabilitySettingsTable.tenantId, D));
    expect(settings).toEqual([]);
  });

  it("the participant import adopts seeded members instead of adding them twice", async () => {
    const row = (n: number, first: string, last: string, mobile: string) =>
      participantRow({
        "First Name": first,
        "Last Name": last,
        "Profile ID": `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        "Date of Birth": "01/01/1995",
        Grade: "A Grade",
        "Account Holder Mobile": mobile,
      });
    const WYLLIE = row(1, "Jack", "Wyllie", "0400 000 701"); // by link (team-list name → 701)
    const TYPED = row(2, "Tara", "Typed", "0400 000 799"); // by unique full name
    const INITIAL = row(3, "Kim", "Initial", "0400 000 704"); // initial-only member
    const NEWBIE = row(4, "Nina", "Newbie", "0400 000 800");
    const res = await request(app)
      .post("/api/squad/import")
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenants.A))
      .attach(
        "file",
        Buffer.from(buildParticipantCsv([WYLLIE, TYPED, INITIAL, NEWBIE]), "utf8"),
        "participants.csv",
      );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 3, adopted: 3 });

    const rows = await members(tenants.A);
    expect(rows).toHaveLength(6);
    const byProfile = (r: Record<string, string>) =>
      rows.find((m) => m.playhqProfileId === r["Profile ID"]);
    expect(byProfile(WYLLIE)).toMatchObject({
      firstName: "Jack",
      linkedPlayerId: 701,
      accountHolderMobile: "0400000701",
    });
    expect(byProfile(TYPED)).toMatchObject({
      lastName: "Typed",
      accountHolderMobile: "0400000799",
    });
    expect(byProfile(INITIAL)).toMatchObject({
      firstName: "Kim",
      lastName: "Initial",
      linkedPlayerId: 704,
      accountHolderMobile: "0400000704",
    });
    expect(byProfile(NEWBIE)).toBeDefined();
    // Casey Barnes wasn't in the file: still there, still without a profile id.
    const barnes = rows.find((m) => m.lastName === "Barnes");
    expect(barnes).toMatchObject({ playhqProfileId: null, firstName: "Casey" });
    const ids = rows.filter((m) => m.lastName === "Wyllie").map((m) => m.id);
    expect(ids).toHaveLength(1);
    // A re-run of the seed now finds everyone.
    expect((await seed(cookieA, tenants.A)).body).toMatchObject({ added: 0 });
  });
});
