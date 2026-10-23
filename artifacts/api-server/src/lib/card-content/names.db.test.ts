/**
 * The card name resolver (ADR-010 P1) against a real database: override →
 * automatic short name → raw, per grade and for every grade; the render map
 * every card takes; the admin listing; crests from the PlayHQ crosswalk; and
 * tenant isolation — one club's names never reach another club's cards.
 *
 * CI only: needs DATABASE_URL (central lives in the same local database). The
 * suite seeds its own central clubs and match (ids 978xx) and removes them.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  teamNameOverridesTable,
  teamCrestOverridesTable,
  competitionLabelOverridesTable,
} from "@workspace/db";
import { clearCentralQueriesCache } from "@workspace/db/central-queries";
import {
  cardNameKey,
  resolveCardCrest,
  resolveCardTeamName,
} from "@workspace/scorecard/card-names";
import { purgeTestTenants } from "../tenant-purge.test-helpers";
import { invalidateTenantConfigCache } from "../tenant";
import {
  listCardNames,
  loadCardNames,
  resolveCompetitionLabel,
  resolveTeamName,
  setCompetitionLabelOverride,
  setTeamCrestOverride,
  setTeamNameOverride,
} from "./names";

// This suite seeds central/playhq fixtures in the tenant test database.
// Keep reads on that same connection even when the workspace's central pool
// points to a different database.
vi.mock("@workspace/db/central", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  centralDb: (await import("@workspace/db")).db,
}));

const STAMP = Date.now();
const OWN = 97_801;
const OPP = 97_802;
const OTHER = 97_803;
const MATCH = 97_801_001;
// The Murdoch case: a club with no crosswalk row whose only PlayHQ side met a
// club that has one. Central stores the lower club id as home.
const HORNETS = 97_805;
const MURDOCH = 97_806;
const ORG_HORNETS = "0" + randomUUID().slice(1);
const ORG_MURDOCH = "f" + randomUUID().slice(1);
const PHQ_GRADE = randomUUID();
const PHQ_MATCH = randomUUID();
const ORG = `9780${STAMP % 10_000}`.padEnd(8, "0") + "-0000-4000-8000-000000000001";
// The fixture match is in 2024/25; the listing looks one season back from here.
const NOW = new Date("2025-11-01T00:00:00Z");

let tenantA: number;
let tenantB: number;

async function seedCentral(): Promise<void> {
  await db.execute(sql`
    insert into central.clubs (club_id, name, short_name) values
      (${OWN}, 'Testville Cricket Club Inc', 'TCC'),
      (${OPP}, 'SJ Blues Cricket Club', 'SJBCC'),
      (${OTHER}, 'Melville', 'Melville'),
      (${HORNETS}, 'Rockingham Hornets Cricket Club', 'RHCC'),
      (${MURDOCH}, 'Murdoch University Melville Cricket Club', 'MUMCC')
    on conflict (club_id) do nothing
  `);
  await db.execute(sql`
    insert into central.club_name_history (id, club_id, name, season_from, season_to)
    values (${MATCH}, ${OPP}, 'Singleton Juniors Blues', '2002/03', '2010/11')
  `);
  await db.execute(sql`
    insert into central.matches (match_id, season, grade, round, status, home_club_id, away_club_id,
      home_team, away_team)
    values
      (${MATCH}, '2024/25', 'Senior Female A Grade', '1', 'Completed', ${OWN}, ${OPP},
       'Testville Female A Grade', 'SJ Blues Senior Women'),
      (${MATCH + 1}, '2024/25', 'A Grade Wyllie Cup', '1', 'Completed', ${OPP}, ${OWN},
       'SJ Blues Senior Men A Grade', 'Testville A Grade'),
      -- An old season, outside the listing's window.
      (${MATCH + 2}, '2015/16', 'A Grade', '1', 'Completed', ${OWN}, ${OTHER},
       'Testville A Grade', 'Melville - 1s')
  `);
  // The PlayHQ crosswalk and organisation, for the opposition's crest.
  await db.execute(sql`
    insert into central.club_playhq_orgs (playhq_org_id, club_id, source) values (${ORG}, ${OPP}, 'manual')
  `);
  await db.execute(sql`
    insert into playhq.organisations (id, name, logo_url)
    values (${ORG}::uuid, 'SJ Blues Cricket Club', 'https://img.test/sjblues.png')
  `);
  // Murdoch's U21 side at home in PlayHQ, so central (lower id = home) has
  // the Hornets as home: home ↔ home pairs Murdoch with the Hornets' org.
  await db.execute(sql`
    insert into central.matches (match_id, season, grade, round, status, home_club_id, away_club_id,
      home_team, away_team, playhq_match_id)
    values (${MATCH + 3}, '2024/25', 'U21 Mixed', '1', 'Completed', ${HORNETS}, ${MURDOCH},
      'Hornets U21 Mixed Colts', 'MUMCC U21 Mixed', ${PHQ_MATCH})
  `);
  await db.execute(sql`
    insert into central.club_playhq_orgs (playhq_org_id, club_id, source)
    values (${ORG_HORNETS}, ${HORNETS}, 'history')
  `);
  await db.execute(sql`
    insert into playhq.organisations (id, name, logo_url) values
      (${ORG_HORNETS}::uuid, 'Rockingham Hornets Cricket Club', 'https://img.test/hornets.png'),
      (${ORG_MURDOCH}::uuid, 'Murdoch University Melville Cricket Club', 'https://img.test/mumcc.png')
  `);
  await db.execute(sql`
    insert into playhq.grades (id, name, season_name, is_junior)
    values (${PHQ_GRADE}::uuid, 'U21 Mixed', '2024/25', false)
  `);
  await db.execute(sql`
    insert into playhq.matches (id, grade_id, status, home_team_name, home_org_id,
      away_team_name, away_org_id, raw, fetched_at)
    values (${PHQ_MATCH}::uuid, ${PHQ_GRADE}::uuid, 'COMPLETED', 'MUMCC U21 Mixed',
      ${ORG_MURDOCH}::uuid, 'Hornets U21 Mixed Colts', ${ORG_HORNETS}::uuid, '{}'::jsonb, now())
  `);
}

/**
 * The crosswalk as scripts/sql/central-projector.sql creates it (CI's central
 * schema is a Drizzle push, which doesn't include it). Same DDL, so a later
 * suite that applies the projector SQL finds the table it expects.
 */
async function ensureCrosswalk(): Promise<void> {
  await db.execute(sql`
    create table if not exists central.club_playhq_orgs (
      playhq_org_id text primary key,
      club_id       integer not null,
      source        text    not null default 'history' check (source in ('history', 'manual')),
      votes         integer not null default 0,
      updated_at    timestamptz not null default now()
    )
  `);
}

async function cleanCentral(): Promise<void> {
  await db.execute(
    sql`delete from central.matches where match_id between ${MATCH} and ${MATCH + 9}`,
  );
  await db.execute(
    sql`delete from central.club_name_history where club_id in (${OWN}, ${OPP}, ${OTHER})`,
  );
  await db.execute(
    sql`delete from central.club_playhq_orgs where playhq_org_id in (${ORG}, ${ORG_HORNETS})`,
  );
  await db.execute(sql`delete from playhq.matches where id = ${PHQ_MATCH}::uuid`);
  await db.execute(sql`delete from playhq.grades where id = ${PHQ_GRADE}::uuid`);
  await db.execute(
    sql`delete from playhq.organisations where id in (${ORG}::uuid, ${ORG_HORNETS}::uuid, ${ORG_MURDOCH}::uuid)`,
  );
  await db.execute(
    sql`delete from central.clubs where club_id in (${OWN}, ${OPP}, ${OTHER}, ${HORNETS}, ${MURDOCH})`,
  );
}

beforeAll(async () => {
  await ensureCrosswalk();
  await cleanCentral();
  await seedCentral();
  const rows = await db
    .insert(tenantsTable)
    .values([
      { slug: `names-a-${STAMP}`, centralClubId: OWN, name: "Names A", plan: "pro" },
      { slug: `names-b-${STAMP}`, centralClubId: 97_804, name: "Names B", plan: "pro" },
    ])
    .returning();
  tenantA = rows[0]!.id;
  tenantB = rows[1]!.id;
  invalidateTenantConfigCache();
});

afterAll(async () => {
  await purgeTestTenants([tenantA, tenantB]);
  await cleanCentral();
  clearCentralQueriesCache();
});

beforeEach(async () => {
  clearCentralQueriesCache();
  for (const t of [tenantA, tenantB]) {
    await db.delete(teamNameOverridesTable).where(eq(teamNameOverridesTable.tenantId, t));
    await db.delete(teamCrestOverridesTable).where(eq(teamCrestOverridesTable.tenantId, t));
    await db
      .delete(competitionLabelOverridesTable)
      .where(eq(competitionLabelOverridesTable.tenantId, t));
  }
});

describe("resolveTeamName", () => {
  it("with no override: the automatic short name of the register name", async () => {
    const r = await resolveTeamName(tenantA, OPP);
    expect(r).toMatchObject({
      rawName: "SJ Blues Cricket Club",
      autoName: "SJ Blues",
      overrideName: null,
      name: "SJ Blues",
      source: "auto",
      crestUrl: "https://img.test/sjblues.png",
      monogram: "SB",
    });
  });

  it("a raw name that needs no shortening reads as raw", async () => {
    const r = await resolveTeamName(tenantA, OTHER);
    expect([r.name, r.source]).toEqual(["Melville", "raw"]);
    expect(r.crestUrl).toBeNull();
    expect(r.monogram).toBe("ME");
  });

  it("the club's all-grades name, then a grade's own name for that grade", async () => {
    await setTeamNameOverride(tenantA, OPP, null, "Blues");
    await setTeamNameOverride(tenantA, OPP, "Female A Grade", "SJ Blues Women");
    expect((await resolveTeamName(tenantA, OPP)).name).toBe("Blues");
    expect((await resolveTeamName(tenantA, OPP, "A Grade")).name).toBe("Blues");
    const women = await resolveTeamName(tenantA, OPP, "Female A Grade");
    expect([women.name, women.source]).toEqual(["SJ Blues Women", "override"]);
  });

  it("upserts one row per club and grade, and an empty name clears it", async () => {
    await setTeamNameOverride(tenantA, OPP, null, "Blues");
    await setTeamNameOverride(tenantA, OPP, null, "  SJ   Blues  ");
    const rows = await db
      .select()
      .from(teamNameOverridesTable)
      .where(eq(teamNameOverridesTable.tenantId, tenantA));
    expect(rows.map((r) => [r.gradeKey, r.shortName])).toEqual([[null, "SJ Blues"]]);
    await setTeamNameOverride(tenantA, OPP, null, "   ");
    expect((await resolveTeamName(tenantA, OPP)).source).toBe("auto");
  });

  it("concurrent all-grades saves keep one row without affecting another tenant or grade", async () => {
    await setTeamNameOverride(tenantB, OPP, null, "Other tenant");
    await setTeamNameOverride(tenantA, OPP, "A Grade", "First grade");
    await setTeamNameOverride(tenantA, OPP, "A Grade", "Updated grade");
    await Promise.all(
      ["Blues", "SJ Blues", "Singleton"].map((name) =>
        setTeamNameOverride(tenantA, OPP, null, name),
      ),
    );
    const rows = await db
      .select()
      .from(teamNameOverridesTable)
      .where(eq(teamNameOverridesTable.tenantId, tenantA));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.gradeKey === null)).toHaveLength(1);
    expect(rows.find((row) => row.gradeKey === "A Grade")?.shortName).toBe("Updated grade");
    expect((await resolveTeamName(tenantB, OPP)).name).toBe("Other tenant");
    await setTeamNameOverride(tenantA, OPP, null, "");
    expect((await resolveTeamName(tenantA, OPP, "A Grade")).name).toBe("Updated grade");
    expect((await resolveTeamName(tenantA, OPP)).source).toBe("auto");
  });
});

describe("resolveCompetitionLabel", () => {
  it("override, else the automatic label", async () => {
    expect((await resolveCompetitionLabel(tenantA, "Female A Grade")).label).toBe("Female A Grade");
    await setCompetitionLabelOverride(tenantA, "Female A Grade", "Women's A");
    const r = await resolveCompetitionLabel(tenantA, "Female A Grade");
    expect([r.label, r.source]).toEqual(["Women's A", "override"]);
    await setCompetitionLabelOverride(tenantA, "Female A Grade", null);
    expect((await resolveCompetitionLabel(tenantA, "Female A Grade")).source).toBe("raw");
  });
});

describe("loadCardNames (the map every card render takes)", () => {
  it("keys every spelling of an overridden club, a grade's sides to its own name", async () => {
    await setTeamNameOverride(tenantA, OPP, null, "Blues");
    await setTeamNameOverride(tenantA, OPP, "Female A Grade", "SJ Blues Women");
    await setCompetitionLabelOverride(tenantA, "Female A Grade", "Women's A");
    const names = await loadCardNames(tenantA, { now: NOW });
    // Register name, an earlier name, a team name in another grade: the club's name.
    expect(resolveCardTeamName(names, "SJ Blues Cricket Club")).toBe("Blues");
    expect(resolveCardTeamName(names, "Singleton Juniors Blues")).toBe("Blues");
    expect(resolveCardTeamName(names, "SJ Blues Senior Men A Grade")).toBe("Blues");
    // That grade's side: the grade's own name.
    expect(resolveCardTeamName(names, "SJ Blues Senior Women")).toBe("SJ Blues Women");
    // A club with no override is left to the automatic name.
    expect(names.teams?.[cardNameKey("Testville A Grade")]).toBeUndefined();
    expect(resolveCardTeamName(names, "Testville A Grade")).toBe("Testville");
    // Crests for every club met, under each of its names.
    expect(names.crests?.[cardNameKey("SJ Blues Senior Women")]).toBe(
      "https://img.test/sjblues.png",
    );
    // Labels under the grade key and the raw competition names it plays as.
    expect(names.competitions?.[cardNameKey("Female A Grade")]).toBe("Women's A");
    expect(names.competitions?.[cardNameKey("Senior Female A Grade")]).toBe("Women's A");
  });

  it("a club with no overrides and no central club still gets a map (empty)", async () => {
    expect(await loadCardNames(tenantB, { now: NOW })).toEqual({});
  });
});

describe("listCardNames (the settings section)", () => {
  it("the club first, then every club met lately, with grades and labels", async () => {
    await setTeamNameOverride(tenantA, OPP, "Female A Grade", "SJ Blues Women");
    const listing = await listCardNames(tenantA, NOW);
    expect(listing.available).toBe(true);
    expect(listing.teams.map((t) => [t.centralClubId, t.name, t.isOwnClub])).toEqual([
      [OWN, "Testville", true],
      [OPP, "SJ Blues", false],
    ]);
    const opp = listing.teams[1]!;
    expect(opp.teamNames).toEqual(["SJ Blues Senior Men A Grade", "SJ Blues Senior Women"]);
    expect(opp.grades.map((g) => [g.gradeKey, g.name, g.overrideName])).toEqual([
      ["A Grade", "SJ Blues", null],
      ["Female A Grade", "SJ Blues Women", "SJ Blues Women"],
    ]);
    expect(listing.competitions.map((c) => [c.gradeKey, c.rawLabels])).toEqual([
      ["A Grade", ["A Grade Wyllie Cup"]],
      ["Female A Grade", ["Senior Female A Grade"]],
    ]);
  });

  it("a club whose central club has played no one lately lists no teams", async () => {
    const listing = await listCardNames(tenantB, NOW);
    expect(listing).toEqual({ available: true, teams: [], competitions: [] });
  });
});

describe("tenant isolation", () => {
  it("one club's names never reach another club's resolution, map or listing", async () => {
    await setTeamNameOverride(tenantB, OPP, null, "B's name for the Blues");
    await setCompetitionLabelOverride(tenantB, "Female A Grade", "B's label");

    expect((await resolveTeamName(tenantA, OPP)).name).toBe("SJ Blues");
    expect((await resolveCompetitionLabel(tenantA, "Female A Grade")).label).toBe("Female A Grade");
    const mapA = await loadCardNames(tenantA, { now: NOW });
    expect(JSON.stringify(mapA)).not.toContain("B's");
    const listingA = await listCardNames(tenantA, NOW);
    expect(JSON.stringify(listingA)).not.toContain("B's");

    // B sees its own.
    expect((await resolveTeamName(tenantB, OPP)).name).toBe("B's name for the Blues");
  });

  it("a write for one club never touches another club's row for the same central club", async () => {
    await setTeamNameOverride(tenantA, OPP, null, "A's Blues");
    await setTeamNameOverride(tenantB, OPP, null, "B's Blues");
    await setTeamNameOverride(tenantB, OPP, null, null);
    expect((await resolveTeamName(tenantA, OPP)).name).toBe("A's Blues");
    expect((await resolveTeamName(tenantB, OPP)).source).toBe("auto");
  });
});

describe("automatic crests", () => {
  it("Murdoch University Melville gets its own crest, never the Rockingham Hornets'", async () => {
    const murdoch = await resolveTeamName(tenantA, MURDOCH);
    expect(murdoch.crestUrl).toBe("https://img.test/mumcc.png");
    expect(murdoch.crestSource).toBe("auto");
    // The Hornets keep their crosswalk crest.
    expect((await resolveTeamName(tenantA, HORNETS)).crestUrl).toBe("https://img.test/hornets.png");
  });
});

describe("crest overrides", () => {
  const UPLOAD = "/api/storage/objects/uploads/sjblues-crest";

  it("an uploaded or picked crest replaces the automatic one, everywhere", async () => {
    await setTeamCrestOverride(tenantA, OPP, { crestSource: "upload", crestUrl: UPLOAD });
    const r = await resolveTeamName(tenantA, OPP);
    expect(r).toMatchObject({
      crestUrl: UPLOAD,
      crestSource: "upload",
      autoCrestUrl: "https://img.test/sjblues.png",
    });
    const listing = await listCardNames(tenantA, NOW);
    const row = listing.teams.find((t) => t.centralClubId === OPP)!;
    expect([row.crestUrl, row.crestSource]).toEqual([UPLOAD, "upload"]);
    expect(row.grades.every((g) => g.crestUrl === UPLOAD)).toBe(true);
    // The render map: the choice wins over a crest the card input carries.
    const names = await loadCardNames(tenantA, { now: NOW });
    expect(resolveCardCrest(names, "SJ Blues Senior Women", "https://img.test/other.png")).toBe(
      UPLOAD,
    );
    expect(resolveCardCrest(names, "SJ Blues Cricket Club", null)).toBe(UPLOAD);
  });

  it("the initials badge shows no crest at all; reset goes back to automatic", async () => {
    await setTeamCrestOverride(tenantA, MURDOCH, { crestSource: "initials", crestUrl: "x" });
    const r = await resolveTeamName(tenantA, MURDOCH);
    expect([r.crestUrl, r.crestSource, r.monogram]).toEqual([null, "initials", "MU"]);
    const names = await loadCardNames(tenantA, { now: NOW });
    expect(names.crestOverrides?.[cardNameKey("Murdoch University Melville Cricket Club")]).toBe(
      "",
    );
    expect(
      resolveCardCrest(names, "Murdoch University Melville Cricket Club", "https://img.test/x"),
    ).toBeNull();
    await setTeamCrestOverride(tenantA, MURDOCH, null);
    expect((await resolveTeamName(tenantA, MURDOCH)).crestSource).toBe("auto");
  });

  it("one club's crest never reaches another club's cards", async () => {
    await setTeamCrestOverride(tenantB, OPP, { crestSource: "upload", crestUrl: UPLOAD });
    expect((await resolveTeamName(tenantA, OPP)).crestUrl).toBe("https://img.test/sjblues.png");
    const mapA = await loadCardNames(tenantA, { now: NOW });
    expect(mapA.crestOverrides).toBeUndefined();
    expect(JSON.stringify(await listCardNames(tenantA, NOW))).not.toContain(UPLOAD);
    expect((await resolveTeamName(tenantB, OPP)).crestUrl).toBe(UPLOAD);
  });
});
