import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { asc, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  availabilitySettingsTable,
  playerIdMapTable,
  squadMembersTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { SESSION_COOKIE, encodeSession } from "../lib/auth";
import { autoSeedSquadIfEmpty, seedSquadFromSeason } from "../lib/squad-season-seed";
import { buildParticipantCsv, participantRow } from "../test/fixtures/playhq-participants";

/**
 * The squad register from this season's games outside provisioning
 * (`POST /squad/seed-from-season`, the sweep's hourly top-up), both reusing
 * provisioning's `seedCurrentSeasonSquad`, and the participant import
 * adopting seeded members.
 *
 * Tenant A reads central club 9821; tenant B reads its opponent 9823; tenants
 * C and D (clubs 9825 / 9826) test the top-up; tenant E (9827) has no games.
 * This season, A Grade, club 9821 named: J Wyllie (central "Jack Wyllie",
 * 701), Casey Barnes (703, private), K Initial (line name only, 704) and Ezra
 * Existing (702, already a member). Last season's Old Season is never read.
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
const CLUB = { A: 9821, B: 9823, C: 9825, D: 9826, E: 9827 } as const;
const [M1, M2, M3] = [982_101, 982_102, 982_103];
const LINE_BASE = 9_821_000;
const NOW = new Date();
const YEAR = seasonStartYearFor(NOW);
const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;

const guid = (n: number) => `98210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = {
  wyllie: guid(1),
  barnes: guid(2),
  initial: guid(3),
  ezra: guid(4),
  other: guid(5),
  cal: guid(6),
  dee: guid(7),
  old: guid(8),
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
  await db.execute(sql`delete from central.matches where match_id in (${M1}, ${M2}, ${M3})`);
  await db.execute(
    sql`delete from central.players where participant_id in (${P.wyllie}, ${P.barnes})`,
  );
  await db.execute(
    sql`delete from central.clubs where club_id in (${sql.join(Object.values(CLUB), sql`, `)})`,
  );
}

async function seedCentral(): Promise<void> {
  for (const id of Object.values(CLUB)) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${`Seed CC ${id}`}, ${`S${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [m, year, home, away] of [
    [M1, YEAR, CLUB.A, CLUB.B],
    [M2, YEAR, CLUB.C, CLUB.D],
    [M3, YEAR - 1, CLUB.A, CLUB.B],
  ] as const) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`squad-seed-${m}`}, ${seasonLabel(year)}, 'A Grade', 'g', 'One Day', '1', ${`${year}-10-01`}, 'Seed Oval',
        'Completed', ${home}, ${away}, 'Home', 'Opp', '5/150', '10/120', ${home}, ${home}, 'won')
    `);
  }
  for (const [pid, name, priv] of [
    [P.wyllie, "Jack Wyllie", 0],
    [P.barnes, "Casey Barnes", 1],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${pid}, ${name}, ${priv}, ${CLUB.A}, ${seasonLabel(YEAR)}, ${seasonLabel(YEAR)}, 1)
    `);
  }
  await roster(M1, CLUB.A, P.wyllie, "J Wyllie");
  await roster(M1, CLUB.A, P.barnes, "C Barnes");
  await roster(M1, CLUB.A, P.initial, "K Initial");
  await roster(M1, CLUB.A, P.ezra, "E Existing");
  await roster(M1, CLUB.B, P.other, "Bea Other");
  await roster(M2, CLUB.C, P.cal, "Cal Auto");
  await roster(M2, CLUB.D, P.dee, "Dee Auto");
  await roster(M3, CLUB.A, P.old, "Old Season");
}

describe.skipIf(!isLocalDb)("squad register from this season's games", () => {
  const tenants: Record<keyof typeof CLUB, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let cookieA: string;
  let cookieB: string;
  let existingId: number;
  const adminIds: number[] = [];

  const members = (tenantId: number) =>
    db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.tenantId, tenantId))
      .orderBy(asc(squadMembersTable.lastName), asc(squadMembersTable.firstName));

  const settingsOf = (tenantId: number) =>
    db
      .select()
      .from(availabilitySettingsTable)
      .where(eq(availabilitySettingsTable.tenantId, tenantId));

  const seed = (cookie: string | null, tenantId: number) => {
    const r = request(app).post("/api/squad/seed-from-season").set("x-tenant-id", String(tenantId));
    return cookie ? r.set("Cookie", cookie) : r;
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-squad-seed";
    await cleanCentral();
    await seedCentral();
    for (const key of Object.keys(CLUB) as (keyof typeof CLUB)[]) {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `squad-seed-${key.toLowerCase()}-${STAMP}`,
          centralClubId: CLUB[key],
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
          [P.ezra, 702],
          [P.barnes, 703],
          [P.initial, 704],
        ] as const
      ).map(([participantId, playerId]) => ({ tenantId: tenants.A, participantId, playerId })),
    );

    const [existing] = await db
      .insert(squadMembersTable)
      .values({
        tenantId: tenants.A,
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
    }
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, Object.values(tenants)));
    await cleanCentral();
  });

  it("is admin only (401)", async () => {
    expect((await seed(null, tenants.A)).status).toBe(401);
    // Another club's admin session does not reach this club.
    expect((await seed(cookieB, tenants.A)).status).toBe(401);
    expect(await members(tenants.A)).toHaveLength(1);
  });

  it("adds this season's players through provisioning's seed, linked, without contacts", async () => {
    const res = await seed(cookieA, tenants.A);
    expect(res.status).toBe(200);
    // Wyllie, Barnes, Initial added; Ezra (linked to 702) already present.
    expect(res.body).toEqual({ added: 3, skipped: 1 });

    const rows = await members(tenants.A);
    expect(
      rows.map((m) => ({
        name: `${m.firstName} ${m.lastName}`,
        link: m.linkedPlayerId,
        private: m.isPrivate,
      })),
    ).toEqual([
      { name: "Casey Barnes", link: 703, private: true },
      { name: "Ezra Existing", link: 702, private: false },
      { name: "K Initial", link: 704, private: false },
      { name: "Jack Wyllie", link: 701, private: false },
    ]);
    for (const m of rows.filter((r) => r.id !== existingId)) {
      expect(m).toMatchObject({
        section: "senior",
        gradeHint: "A Grade",
        active: true,
        playhqProfileId: null,
        accountHolderMobile: null,
      });
    }
    // Last season's player is not read.
    expect(rows.map((m) => m.lastName)).not.toContain("Season");
    // The button marks the register as seeded too.
    expect((await settingsOf(tenants.A))[0]?.seasonSeededAt).toBeInstanceOf(Date);
  });

  it("leaves an existing member untouched and adds no one twice", async () => {
    const [before] = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.id, existingId));
    const res = await seed(cookieA, tenants.A);
    expect(res.body).toEqual({ added: 0, skipped: 4 });
    const [after] = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.id, existingId));
    expect(after).toEqual(before);
    expect(await members(tenants.A)).toHaveLength(4);
  });

  it("is tenant-isolated", async () => {
    // Club B played in the same match: only its own side is read.
    expect(await members(tenants.B)).toEqual([]);
    expect((await seed(cookieB, tenants.B)).body).toEqual({ added: 1, skipped: 0 });
    expect((await members(tenants.B)).map((m) => m.lastName)).toEqual(["Other"]);
    expect((await members(tenants.A)).map((m) => m.lastName)).not.toContain("Other");
  });

  it("tops up once, only while the register is empty and was never seeded", async () => {
    const C = tenants.C;
    expect(await autoSeedSquadIfEmpty(C, NOW)).toEqual({ added: 1, skipped: 0 });
    expect((await members(C)).map((m) => m.lastName)).toEqual(["Auto"]);
    const [settings] = await settingsOf(C);
    expect(settings.seasonSeededAt).toBeInstanceOf(Date);
    expect(settings.enabled).toBe(false);
    expect(await autoSeedSquadIfEmpty(C, NOW)).toBeNull();

    // A club that empties its register on purpose is not refilled…
    await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, C));
    expect(await autoSeedSquadIfEmpty(C, NOW)).toBeNull();
    expect(await members(C)).toHaveLength(0);
    // …but the admin's button still works.
    expect(await seedSquadFromSeason(C, NOW)).toEqual({ added: 1, skipped: 0 });
  });

  it("does not top up a register that already has members", async () => {
    const D = tenants.D;
    await db
      .insert(squadMembersTable)
      .values({ tenantId: D, firstName: "Hand", lastName: "Added" });
    expect(await autoSeedSquadIfEmpty(D, NOW)).toBeNull();
    expect((await members(D)).map((m) => m.lastName)).toEqual(["Added"]);
    expect(await settingsOf(D)).toEqual([]);
  });

  it("leaves the marker unset for a club with no games yet, so it is tried again", async () => {
    const E = tenants.E;
    expect(await autoSeedSquadIfEmpty(E, NOW)).toEqual({ added: 0, skipped: 0 });
    expect(await settingsOf(E)).toEqual([]);
    expect(await autoSeedSquadIfEmpty(E, NOW)).toEqual({ added: 0, skipped: 0 });
    expect(await members(E)).toHaveLength(0);
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
    const WYLLIE = row(1, "Jack", "Wyllie", "0400 000 701"); // by link + first initial + surname
    const INITIAL = row(3, "Kim", "Initial", "0400 000 704"); // initial-only member
    const NEWBIE = row(4, "Nina", "Newbie", "0400 000 800");
    const res = await request(app)
      .post("/api/squad/import")
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenants.A))
      .attach(
        "file",
        Buffer.from(buildParticipantCsv([WYLLIE, INITIAL, NEWBIE]), "utf8"),
        "participants.csv",
      );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 2, adopted: 2 });

    const rows = await members(tenants.A);
    expect(rows).toHaveLength(5);
    const byProfile = (r: Record<string, string>) =>
      rows.find((m) => m.playhqProfileId === r["Profile ID"]);
    expect(byProfile(WYLLIE)).toMatchObject({
      firstName: "Jack",
      linkedPlayerId: 701,
      accountHolderMobile: "0400000701",
    });
    expect(byProfile(INITIAL)).toMatchObject({
      firstName: "Kim",
      lastName: "Initial",
      linkedPlayerId: 704,
      accountHolderMobile: "0400000704",
    });
    expect(byProfile(NEWBIE)).toBeDefined();
    // Casey Barnes wasn't in the file: still there, still without a profile id.
    expect(rows.find((m) => m.lastName === "Barnes")).toMatchObject({
      playhqProfileId: null,
      firstName: "Casey",
    });
    // A re-run of the seed now finds everyone.
    expect((await seed(cookieA, tenants.A)).body).toMatchObject({ added: 0 });
  });
});
