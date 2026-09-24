import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  premiershipsTable,
  premiershipPlayersTable,
} from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";
import { seedTenantPremierships, PRIVATE_PLAYER_NAME } from "@workspace/db/premierships-seed";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { buildPremierships } from "../lib/honour-display/premierships";

/**
 * Premiership honour boards for central-backed tenants: seeded from
 * central.premiers (CI fixture: seed-ci-central-fixture.ts), they must carry the
 * decider's scores, the Grand Final scorecard link (a central match id their
 * /matches/:id serves) and the team list — with player links through the
 * tenant's player_id_map, private players masked, and re-seeds never
 * clobbering a club's edits. Real-DB integration test (DATABASE_URL +
 * CENTRAL_DATABASE_URL), following the existing pattern.
 *
 * Fixture: central club 3 (Pinjarra) won A Grade 2024/25 in match 1002
 * (6/121 def Mandurah 10/120; team Drew, Eli) and has an undated B Grade
 * 2023/24 premier with no decider. Central club 2 (Mandurah)'s premier links
 * match 1001, whose side includes the private player.
 */

const STAMP = Date.now();
// Real fixture club ids — suffix-free because tenants.central_club_id is
// unique; each is released in afterAll.
const PINJARRA = 3;
const MANDURAH = 2;

let pinjarraTenantId: number;
let mandurahTenantId: number;
let adminCookie: string;

async function createCentralTenant(slug: string, centralClubId: number): Promise<number> {
  // Another suite may have left a tenant on the club (signup picks the first
  // available one) — this suite needs the club, so fail loudly instead.
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug, centralClubId, name: slug, readsFromCentral: true, plan: "club" })
    .returning();
  await mintPlayerIdMap(t!.id, centralClubId);
  return t!.id;
}

async function dropTenant(tenantId: number | undefined): Promise<void> {
  if (!tenantId) return;
  await db.delete(premiershipPlayersTable).where(eq(premiershipPlayersTable.tenantId, tenantId));
  await db.delete(premiershipsTable).where(eq(premiershipsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
  await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
}

const getBoard = (tenantId: number) =>
  request(app).get("/api/premierships").set("x-tenant-id", String(tenantId)).expect(200);

describe("central premiership honour boards", () => {
  beforeAll(async () => {
    pinjarraTenantId = await createCentralTenant(`prem-pin-${STAMP}`, PINJARRA);
    mandurahTenantId = await createCentralTenant(`prem-man-${STAMP}`, MANDURAH);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: pinjarraTenantId,
        username: `prem_admin_${STAMP}`,
        displayName: "Prem Admin",
        passwordHash: "x",
      })
      .returning();
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await dropTenant(pinjarraTenantId);
    await dropTenant(mandurahTenantId);
  });

  it("seeds results, the scorecard link and the team list from central", async () => {
    const r = await seedTenantPremierships(pinjarraTenantId, PINJARRA);
    expect(r).toMatchObject({ centralPremiers: 2, inserted: 2, playersAdded: 2, skipped: 0 });

    const res = await getBoard(pinjarraTenantId);
    expect(res.body).toHaveLength(2);
    const [a, b] = res.body;

    expect(a).toMatchObject({
      year: 2024,
      grade: "A Grade",
      result: "6/121 def Mandurah 10/120",
      venue: "Fixture Oval",
      matchDate: "2024-10-19",
      matchId: 1002,
    });
    // Internal seed columns stay out of the API shape.
    expect(a).not.toHaveProperty("centralMatchId");
    expect(a).not.toHaveProperty("centralPremierId");

    // Team list, linked through the tenant's crosswalk ints.
    const map = await db
      .select()
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, pinjarraTenantId));
    const idOf = new Map(map.map((m) => [m.participantId, m.playerId]));
    expect(a.players.map((p: { name: string }) => p.name)).toEqual(["Drew Fixture", "Eli Fixture"]);
    expect(a.players.map((p: { playerId: number | null }) => p.playerId)).toEqual([
      idOf.get("55555555-5555-4555-8555-555555555555"),
      idOf.get("66666666-6666-4666-8666-666666666666"),
    ]);
    expect(a.players[0]).not.toHaveProperty("participantId");

    // The undated premier with no decider: season-end year, note as result.
    expect(b).toMatchObject({
      year: 2024,
      grade: "B Grade",
      result: "Minor premiers",
      matchId: null,
      players: [],
    });

    // The linked scorecard is one this tenant's /matches/:id actually serves.
    await request(app)
      .get(`/api/matches/${a.matchId}`)
      .set("x-tenant-id", String(pinjarraTenantId))
      .expect(200);
  });

  it("shows the premiership on the player's own page", async () => {
    const res = await getBoard(pinjarraTenantId);
    const playerId = res.body[0].players[0].playerId as number;
    const player = await request(app)
      .get(`/api/players/${playerId}`)
      .set("x-tenant-id", String(pinjarraTenantId))
      .expect(200);
    expect(player.body.premiershipsWon).toBe(1);
    expect(player.body.premierships[0]).toMatchObject({ grade: "A Grade", year: 2024 });
  });

  it("links the honours-display premiership board the same way", async () => {
    const board = await buildPremierships(pinjarraTenantId, true);
    const entry = board!.entries.find((e) => e.matchId === 1002);
    expect(entry).toBeDefined();
    expect(entry!.detail).toBe("6/121 def Mandurah 10/120");
    expect(entry!.squad!.map((s) => s.name)).toEqual(["Drew Fixture", "Eli Fixture"]);
    expect(entry!.squad!.every((s) => typeof s.playerId === "number")).toBe(true);
  });

  it("masks private players and never stores their identity", async () => {
    await seedTenantPremierships(mandurahTenantId, MANDURAH);
    const rows = await db
      .select()
      .from(premiershipPlayersTable)
      .where(eq(premiershipPlayersTable.tenantId, mandurahTenantId));
    const names = rows.map((r) => r.name);
    expect(names).toContain("Casey Fixture");
    expect(names).toContain(PRIVATE_PLAYER_NAME);
    expect(names).not.toContain("Private Fixture");
    expect(rows.find((r) => r.name === PRIVATE_PLAYER_NAME)!.participantId).toBeNull();
  });

  it("re-seeding keeps the club's edits and does not duplicate", async () => {
    const before = await getBoard(pinjarraTenantId);
    const a = before.body[0];

    // The club edits the result and the team list (captain) via admin.
    const patched = await request(app)
      .patch(`/api/premierships/${a.id}`)
      .set("x-tenant-id", String(pinjarraTenantId))
      .set("Cookie", adminCookie)
      .send({
        result: "Pinjarra 6/121 d Mandurah 10/120 (club wording)",
        players: a.players.map((p: { name: string; playerId: number | null }, i: number) => ({
          name: p.name,
          playerId: p.playerId,
          isCaptain: i === 0,
          battingOrder: i + 1,
        })),
      })
      .expect(200);
    // Crosswalk ids round-trip through the editor (stored as GUIDs, not FKs).
    expect(patched.body.players.map((p: { playerId: number }) => p.playerId)).toEqual(
      a.players.map((p: { playerId: number }) => p.playerId),
    );
    expect(patched.body.matchId).toBe(1002);

    const again = await seedTenantPremierships(pinjarraTenantId, PINJARRA);
    expect(again).toMatchObject({ inserted: 0, updated: 0, playersAdded: 0 });

    const after = await getBoard(pinjarraTenantId);
    expect(after.body).toHaveLength(2);
    expect(after.body[0].result).toBe("Pinjarra 6/121 d Mandurah 10/120 (club wording)");
    expect(after.body[0].players[0].isCaptain).toBe(true);
  });

  it("scopes admin writes to the caller's tenant", async () => {
    const theirs = await getBoard(mandurahTenantId);
    const otherId = theirs.body[0].id as number;

    // Pinjarra's admin cannot edit or delete Mandurah's premiership by id.
    await request(app)
      .patch(`/api/premierships/${otherId}`)
      .set("x-tenant-id", String(pinjarraTenantId))
      .set("Cookie", adminCookie)
      .send({ result: "hijacked" })
      .expect(404);
    await request(app)
      .delete(`/api/premierships/${otherId}`)
      .set("x-tenant-id", String(pinjarraTenantId))
      .set("Cookie", adminCookie)
      .expect(404);
    const unchanged = await getBoard(mandurahTenantId);
    expect(unchanged.body[0].result).toBe(theirs.body[0].result);

    // A created premiership lands on the caller's own tenant, not tenant #1.
    const created = await request(app)
      .post("/api/premierships")
      .set("x-tenant-id", String(pinjarraTenantId))
      .set("Cookie", adminCookie)
      .send({ year: 2019, grade: "C Grade", competition: "C Grade", players: [] })
      .expect(201);
    const [row] = await db
      .select({ tenantId: premiershipsTable.tenantId })
      .from(premiershipsTable)
      .where(eq(premiershipsTable.id, created.body.id));
    expect(row!.tenantId).toBe(pinjarraTenantId);
  });
});
