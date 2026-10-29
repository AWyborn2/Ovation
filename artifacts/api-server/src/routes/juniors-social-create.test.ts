import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  juniorFixturesTable,
  juniorParticipantsTable,
  juniorTeamListsTable,
  socialDraftsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior cards in New Studio's Create (studio-create-consolidation S3):
 *
 *  - the junior Team List prefill reads one of this club's junior fixtures, names the
 *    team in the public style (a private child is "Private Player"), says where the
 *    list came from, and carries no photo;
 *  - another tenant's fixture is a 404;
 *  - a hand-made junior draft is marked junior, and the request's photo and consent
 *    markers are dropped (the server picks the photo, fail-closed): with no allowed
 *    photo the card has none.
 *
 * Real-DB integration test (needs DATABASE_URL): CI only.
 */

const STAMP = Date.now();
const pid = (tag: string) => `${tag}-${STAMP}`.toLowerCase();
const OLLIE = pid("jsc-ollie");
const SAM = pid("jsc-sam"); // private in PlayHQ

describe("junior cards in New Studio's Create", () => {
  let tenantA = 0;
  let tenantB = 0;
  let cookieA = "";
  let cookieB = "";
  let fixture = 0;
  const draftIds: number[] = [];

  const asAdminA = (r: request.Test) =>
    r.set("x-tenant-id", String(tenantA)).set("Cookie", cookieA);
  const asAdminB = (r: request.Test) =>
    r.set("x-tenant-id", String(tenantB)).set("Cookie", cookieB);

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-juniors-create";
    const make = async (key: string, clubId: number) => {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `jsc-${key}-${STAMP}`,
          centralClubId: clubId,
          name: `JSC ${key}`,
          plan: "pro",
          playhqOrgId: `jsc-org-${key}-${STAMP}`,
          playhqSyncEnabled: true,
          juniorSyncEnabled: true,
        })
        .returning();
      return t.id;
    };
    tenantA = await make("a", 97_000 + (STAMP % 1000));
    tenantB = await make("b", 98_000 + (STAMP % 1000));
    const admin = async (tenantId: number, key: string) => {
      const [row] = await db
        .insert(adminsTable)
        .values({
          tenantId,
          username: `test_admin_jsc_${key}_${STAMP}`,
          displayName: key,
          passwordHash: "x",
        })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: row.id, issuedAt: Date.now() })}`;
    };
    cookieA = await admin(tenantA, "a");
    cookieB = await admin(tenantB, "b");

    await db.insert(juniorParticipantsTable).values([
      { tenantId: tenantA, participantId: OLLIE, displayName: "Ollie Gallash" },
      { tenantId: tenantA, participantId: SAM, displayName: "Sam Hidden", isPrivate: true },
    ]);
    const [row] = await db
      .insert(juniorFixturesTable)
      .values({
        tenantId: tenantA,
        playhqMatchId: `jsc-a-${STAMP}`,
        seasonStartYear: 2026,
        ageGroup: "Year 6",
        grade: "Year 6 Gold",
        teamName: "Hawks",
        opponentName: "Eagles",
        venue: "Oval 1",
        startAt: new Date(Date.now() + 48 * 3600_000),
        isHome: true,
        status: "UPCOMING",
      })
      .returning();
    fixture = row.id;
    await db.insert(juniorTeamListsTable).values({
      tenantId: tenantA,
      juniorFixtureId: fixture,
      players: [
        { order: 1, participantId: OLLIE, role: "C" },
        { order: 2, participantId: SAM },
      ],
      isPublished: true,
      source: "playhq",
    });
  });

  afterAll(async () => {
    const tenants = [tenantA, tenantB];
    if (draftIds.length)
      await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.id, draftIds));
    await db.delete(juniorTeamListsTable).where(inArray(juniorTeamListsTable.tenantId, tenants));
    await db.delete(juniorFixturesTable).where(inArray(juniorFixturesTable.tenantId, tenants));
    await db
      .delete(juniorParticipantsTable)
      .where(inArray(juniorParticipantsTable.tenantId, tenants));
    await db.delete(adminsTable).where(inArray(adminsTable.tenantId, tenants));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  });

  it("prefills a junior team's list from the junior tables, with no photo", async () => {
    const res = await asAdminA(
      request(app).get(`/api/juniors/fixtures/${fixture}/social-prefill`),
    ).expect(200);
    expect(res.body).toMatchObject({ source: "playhq", isPublished: true });
    const input = res.body.input as Record<string, unknown>;
    expect(input).toMatchObject({ kind: "teamList", junior: true, juniorFixtureId: fixture });
    expect(input.photoUrl).toBeUndefined();
    expect(input.juniorPhotoAllowed).toBeUndefined();
    const names = JSON.stringify(input.players);
    expect(names).toContain("PRIVATE PLAYER");
    expect(names).not.toMatch(/HIDDEN/i);
  });

  it("is a 404 for another club's fixture", async () => {
    await asAdminB(request(app).get(`/api/juniors/fixtures/${fixture}/social-prefill`)).expect(404);
  });

  it("marks a hand-made junior draft junior and drops the request's photo consent", async () => {
    const res = await asAdminA(request(app).post("/api/social-drafts"))
      .send({
        cardInput: {
          kind: "teamList",
          junior: true,
          juniorFixtureId: fixture,
          gradeRound: "YEAR 6 GOLD",
          players: [],
          // A client may not claim consent or choose a child's photo.
          juniorPhotoAllowed: true,
          featuredParticipantId: SAM,
          photoUrl: "/api/storage/objects/smuggled.jpg",
        },
      })
      .expect(201);
    draftIds.push(res.body.id);
    const [row] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, res.body.id));
    expect(row.sourceMatchIsJunior).toBe(true);
    expect(row.photoUrl).toBeNull();
    const input = row.cardInput as Record<string, unknown>;
    expect(input.juniorPhotoAllowed).toBeUndefined();
    expect(input.featuredParticipantId).toBeUndefined();
    expect(input.photoUrl).toBeNull();
    expect(input.juniorTeams).toEqual([{ ageGroup: "Year 6", teamName: "Hawks" }]);
  });

  it("gives another club's fixture id no team and no photo", async () => {
    const res = await asAdminB(request(app).post("/api/social-drafts"))
      .send({ cardInput: { kind: "teamList", junior: true, juniorFixtureId: fixture } })
      .expect(201);
    draftIds.push(res.body.id);
    const [row] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, res.body.id));
    const input = row.cardInput as Record<string, unknown>;
    expect(input.juniorFixtureId).toBeUndefined();
    expect(input.juniorTeams).toBeUndefined();
    expect(row.photoUrl).toBeNull();
  });
});
