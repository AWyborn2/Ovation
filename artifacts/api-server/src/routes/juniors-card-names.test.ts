import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  juniorFixturesTable,
  juniorMatchesTable,
  juniorTeamNameOverridesTable,
  type FixtureRow,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { centralCardClubs } from "@workspace/db/central-queries";
import { cardNameKey, resolveCardTeamName } from "@workspace/scorecard/card-names";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { loadCardNames, setTeamNameOverride } from "../lib/card-content/names";
import { loadJuniorCardNames } from "../lib/card-content/junior-names";
import { buildMatchDayContent } from "../lib/card-content/match-day";

/**
 * Junior opponent and grade names (the Juniors tab of "Team and competition
 * names") over HTTP and through the card builders: admin-only, validated,
 * tenant-scoped, and isolated from the senior names both ways — a junior card
 * never prints a senior name and a senior card never prints a junior one.
 * Real-DB integration test, like card-names-isolation.test.ts.
 */

const STAMP = Date.now();
// Mandurah in the CI central fixture: a real central club with a senior name.
const MANDURAH = 2;
const M1 = 97_950_001;
const M2 = 97_950_002;
const SEASON = seasonStartYearFor(new Date());
const UPLOAD = "/api/storage/objects/uploads/junior-mandurah-crest";

describe("junior card names", () => {
  let t2: number;
  let t3: number;
  let cookie2: string;
  let cookie3: string;
  let centralClubName: string;

  beforeAll(async () => {
    const [club] = await centralCardClubs([MANDURAH]);
    if (!club?.name) throw new Error("Junior card names fixture club is missing");
    centralClubName = club.name;
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-junior-names";
    const tenants = await db
      .insert(tenantsTable)
      .values([
        { slug: `jcn-t2-${STAMP}`, centralClubId: 97_921, name: "Junior Names T2" },
        { slug: `jcn-t3-${STAMP}`, centralClubId: 97_922, name: "Junior Names T3" },
      ])
      .returning();
    t2 = tenants[0]!.id;
    t3 = tenants[1]!.id;
    const admins = await db
      .insert(adminsTable)
      .values([
        { tenantId: t2, username: `jcn_admin2_${STAMP}`, displayName: "A2", passwordHash: "x" },
        { tenantId: t3, username: `jcn_admin3_${STAMP}`, displayName: "A3", passwordHash: "x" },
      ])
      .returning();
    const session = (adminId: number) =>
      `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
    cookie2 = session(admins[0]!.id);
    cookie3 = session(admins[1]!.id);

    // Two age groups of one opponent club, one grade with a team name.
    await db.insert(juniorMatchesTable).values([
      {
        id: M1,
        tenantId: t2,
        season: `${SEASON}/${(SEASON + 1) % 100}`,
        seasonStartYear: SEASON,
        ageGroup: "Year 7",
        teamName: "Blue",
        competition: "PJCA Year 7 Division 1",
        team1: "JCN U13 Blue",
        team2: "Mandurah U13 Blue",
        opponentName: "Mandurah U13 Blue",
      },
      {
        id: M2,
        tenantId: t2,
        season: `${SEASON}/${(SEASON + 1) % 100}`,
        seasonStartYear: SEASON,
        ageGroup: "Year 9",
        competition: "PJCA Year 9",
        team1: "Mandurah Cricket Club",
        team2: "JCN U15",
        opponentName: "Mandurah Cricket Club",
      },
    ]);
    await db.insert(juniorFixturesTable).values({
      tenantId: t2,
      playhqMatchId: `jcn-${STAMP}`,
      seasonStartYear: SEASON,
      ageGroup: "Year 8",
      teamName: "Gold",
      opponentName: "Rockingham Hornets U14",
      startAt: new Date(),
      isHome: true,
    });
  });

  afterAll(async () => {
    await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.id, [M1, M2]));
    await purgeTestTenants([t2, t3]);
  });

  const as = (tenant: number, cookie: string | null) => ({
    get: (path: string) => {
      const r = request(app).get(path).set("x-tenant-id", String(tenant));
      return cookie ? r.set("Cookie", cookie) : r;
    },
    put: (path: string, body: object) => {
      const r = request(app).put(path).set("x-tenant-id", String(tenant)).send(body);
      return cookie ? r.set("Cookie", cookie) : r;
    },
  });

  it("is admin-only, and another club's session can't write", async () => {
    await as(t2, null).get("/api/juniors/card-names").expect(401);
    await as(t2, null)
      .put("/api/juniors/card-names/teams", { teamKey: "mandurah", shortName: "X" })
      .expect(401);
    await as(t2, cookie3)
      .put("/api/juniors/card-names/teams", { teamKey: "mandurah", shortName: "X" })
      .expect(401);
    const rows = await db
      .select()
      .from(juniorTeamNameOverridesTable)
      .where(eq(juniorTeamNameOverridesTable.tenantId, t2));
    expect(rows).toEqual([]);
  });

  it("validates the body and the crest", async () => {
    await as(t2, cookie2)
      .put("/api/juniors/card-names/teams", { teamKey: "mandurah", shortName: "x".repeat(41) })
      .expect(400);
    await as(t2, cookie2)
      .put("/api/juniors/card-names/crests", {
        teamKey: "mandurah",
        crestSource: "upload",
        crestUrl: "https://evil.test/crest.png",
      })
      .expect(400);
    await as(t2, cookie2)
      .put("/api/juniors/card-names/crests", {
        teamKey: "mandurah",
        crestSource: "known",
        crestUrl: "https://not-a-known-crest.test/x.png",
      })
      .expect(400);
    await as(t2, cookie2)
      .put("/api/social-settings/card-names/crests", {
        centralClubId: MANDURAH,
        crestSource: "upload",
        crestUrl: "/api/storage/objects/../../etc/passwd",
      })
      .expect(400);
  });

  it("lists each opponent club once and each grade, from the junior tables", async () => {
    const res = await as(t2, cookie2).get("/api/juniors/card-names").expect(200);
    const teams = res.body.teams as Array<{ teamKey: string; rawNames: string[]; name: string }>;
    expect(teams.map((t) => [t.teamKey, t.name])).toEqual([
      ["mandurah", "Mandurah"],
      ["rockingham hornets", "Rockingham Hornets"],
    ]);
    expect(teams[0]!.rawNames).toEqual(["Mandurah Cricket Club", "Mandurah U13 Blue"]);
    const comps = res.body.competitions as Array<{ gradeKey: string; rawLabels: string[] }>;
    expect(comps.map((c) => [c.gradeKey, c.rawLabels])).toEqual([
      ["Year 7", ["PJCA Year 7 Division 1"]],
      ["Year 8", []],
      ["Year 9", ["PJCA Year 9"]],
    ]);
    // Another club lists none of it.
    const other = await as(t3, cookie3).get("/api/juniors/card-names").expect(200);
    expect(other.body).toEqual({ teams: [], competitions: [] });
  });

  it("a junior name, crest and label reach junior cards only, never senior ones", async () => {
    // The same club, named differently for seniors and juniors.
    await setTeamNameOverride(t2, MANDURAH, null, "Senior Mandurah");
    await as(t2, cookie2)
      .put("/api/juniors/card-names/teams", { teamKey: "mandurah", shortName: "Junior Mandurah" })
      .expect(200);
    await as(t2, cookie2)
      .put("/api/juniors/card-names/crests", {
        teamKey: "mandurah",
        crestSource: "upload",
        crestUrl: UPLOAD,
      })
      .expect(200);
    const saved = await as(t2, cookie2)
      .put("/api/juniors/card-names/competitions", { gradeKey: "Year 7", label: "Yr 7" })
      .expect(200);
    expect(saved.body.teams[0]).toMatchObject({
      teamKey: "mandurah",
      name: "Junior Mandurah",
      source: "override",
      crestUrl: UPLOAD,
      crestSource: "upload",
    });

    // The junior map: every age group's spelling, the grade alone and with its team.
    const junior = await loadJuniorCardNames(t2);
    expect(resolveCardTeamName(junior, "Mandurah U13 Blue")).toBe("Junior Mandurah");
    expect(resolveCardTeamName(junior, "Mandurah Cricket Club")).toBe("Junior Mandurah");
    expect(junior.crestOverrides?.[cardNameKey("Mandurah U13 Blue")]).toBe(UPLOAD);
    expect(junior.competitions?.[cardNameKey("Year 7")]).toBe("Yr 7");
    expect(junior.competitions?.[cardNameKey("Year 7 — Blue")]).toBe("Yr 7 — Blue");
    expect(JSON.stringify(junior)).not.toContain("Senior Mandurah");

    // The senior map and the settings bundle carry no junior name.
    const senior = await loadCardNames(t2);
    expect(senior.teams?.[cardNameKey(centralClubName)]).toBe("Senior Mandurah");
    expect(JSON.stringify(senior)).not.toContain("Junior Mandurah");
    expect(JSON.stringify(senior)).not.toContain(UPLOAD);
    const bundle = await as(t2, null).get("/api/social-settings").expect(200);
    expect(JSON.stringify(bundle.body.cardNames ?? {})).not.toContain("Junior Mandurah");

    // The card builder: a junior slide and a senior slide against the same club.
    const fixture = (id: number, grade: string): FixtureRow => ({
      id,
      tenantId: t2,
      grade,
      opponentName: id > 0 ? centralClubName : "Mandurah Cricket Club",
      opponentClubId: null,
      opponentLogoUrl: "https://img.test/register.png",
      startAt: new Date("2026-11-07T01:30:00Z"),
      createdAt: new Date(),
      isHome: true,
      source: "playhq",
      playhqMatchId: null,
      venue: "Oval",
      roundLabel: null,
      notes: null,
      matchFormat: null,
      venueLatitude: null,
      venueLongitude: null,
      competitionName: null,
      associationOrgId: null,
      associationName: null,
      homeTeamName: null,
      awayTeamName: null,
    });
    const content = await buildMatchDayContent(t2, [fixture(-1, "Year 7"), fixture(1, "A Grade")], {
      junior: new Map([[-1, { gradeLabel: "Year 7 — Blue", juniorTeamName: "Blue" }]]),
    });
    expect(content.get(-1)).toMatchObject({
      junior: true,
      grade: "Yr 7 — Blue",
      opposition: { name: "Junior Mandurah", crestUrl: UPLOAD },
    });
    expect(content.get(1)).toMatchObject({
      junior: false,
      opposition: { name: "Senior Mandurah", crestUrl: "https://img.test/register.png" },
    });

    // Tenant isolation: another club's junior cards and listing never see it.
    expect(await loadJuniorCardNames(t3)).toEqual({});
    const other = await as(t3, cookie3).get("/api/juniors/card-names").expect(200);
    expect(JSON.stringify(other.body)).not.toContain("Junior Mandurah");
  });

  it("clearing goes back to the automatic name and crest", async () => {
    await as(t2, cookie2)
      .put("/api/juniors/card-names/teams", { teamKey: "mandurah", shortName: null })
      .expect(200);
    const res = await as(t2, cookie2)
      .put("/api/juniors/card-names/crests", { teamKey: "mandurah", crestSource: null })
      .expect(200);
    expect(res.body.teams[0]).toMatchObject({
      name: "Mandurah",
      source: "auto",
      crestSource: "auto",
    });
    const junior = await loadJuniorCardNames(t2);
    expect(junior.teams).toBeUndefined();
    expect(junior.crestOverrides).toBeUndefined();
  });
});
