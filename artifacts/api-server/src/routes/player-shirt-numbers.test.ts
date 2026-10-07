import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  playerIdMapTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";
import { seasonStartYearFor } from "@workspace/db/seasons";

/**
 * Season shirt numbers on the player profile (plan U9; R14, R15, R16; AE2,
 * AE3, AE5; KTD13). `GET /players/:id` carries `shirtNumber` (current season)
 * and `shirtNumbers` (history, newest first) only when the tenant's feature is
 * on, only from that tenant's register, only for linked entries, and never
 * for a private player.
 *
 * Real-DB integration test (DATABASE_URL + CENTRAL_DATABASE_URL, CI fixture
 * from seed-ci-central-fixture.ts): tenant A on Mandurah (club 2), whose
 * fixture side has Casey (public) and a private player, and tenant B on
 * Pinjarra (club 3, Drew). A central club backs at most one tenant
 * (`tenants_central_club_id_uidx`), so the two tenants need two clubs; their
 * crosswalk ids both start at 1, so the same integer is a different person in
 * each tenant's space.
 */

const STAMP = Date.now();
const MANDURAH = 2;
const PINJARRA = 3;
const CASEY = "33333333-3333-4333-8333-333333333333";
const PRIVATE = "44444444-4444-4444-8444-444444444444";
const DREW = "55555555-5555-4555-8555-555555555555";
const NOW = seasonStartYearFor(new Date());
const LAST = NOW - 1;

type Detail = {
  id: number;
  shirtNumber?: string | null;
  shirtNumbers?: { season: number; number: string }[];
};

describe("player profile shirt numbers", () => {
  let tenantA: number;
  let tenantB: number;
  let caseyA: number;
  let drewB: number;
  let privateA: number | undefined;

  const get = (tenantId: number, playerId: number) =>
    request(app).get(`/api/players/${playerId}`).set("x-tenant-id", String(tenantId));
  const setEnabled = async (tenantId: number, enabled: boolean) => {
    await db
      .insert(shirtNumberSettingsTable)
      .values({ tenantId, enabled })
      .onConflictDoUpdate({ target: shirtNumberSettingsTable.tenantId, set: { enabled } });
  };

  beforeAll(async () => {
    const make = async (suffix: string, clubId: number) => {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `u9-shirts-${suffix}-${STAMP}`,
          centralClubId: clubId,
          name: `U9 Shirts ${suffix}`,
          readsFromCentral: true,
          plan: "club",
        })
        .returning();
      await mintPlayerIdMap(t!.id, clubId);
      return t!.id;
    };
    tenantA = await make("a", MANDURAH);
    tenantB = await make("b", PINJARRA);

    const mapA = await db
      .select()
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantA));
    const casey = mapA.find((m) => m.participantId === CASEY);
    expect(casey, "fixture player should be in the crosswalk").toBeDefined();
    caseyA = casey!.playerId;
    privateA = mapA.find((m) => m.participantId === PRIVATE)?.playerId;
    const [mapB] = await db
      .select()
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantB))
      .then((rows) => rows.filter((m) => m.participantId === DREW));
    expect(mapB, "fixture player should be in tenant B's crosswalk").toBeDefined();
    drewB = mapB!.playerId;

    await db.insert(shirtNumbersTable).values([
      // AE3: last season #12, this season #4.
      { tenantId: tenantA, season: LAST, name: "Casey Fixture", playerId: caseyA, number: "12" },
      { tenantId: tenantA, season: NOW, name: "Casey Fixture", playerId: caseyA, number: "4" },
      // A past season on the register unnumbered: left out of the history.
      { tenantId: tenantA, season: LAST - 1, name: "Casey Fixture", playerId: caseyA },
      // AE2: a held entry (no linked player) carrying Casey's participant id.
      {
        tenantId: tenantA,
        season: LAST - 2,
        name: "Casey Fixture",
        participantId: CASEY,
        number: "23",
      },
      // Tenant B's own entry for its player (crosswalk ids are per tenant, so
      // this is usually the same integer as caseyA) must never reach tenant A.
      { tenantId: tenantB, season: LAST - 3, name: "Other Club", playerId: drewB, number: "99" },
    ]);
    if (drewB !== caseyA) {
      // The same integer in tenant B's space is a different person there.
      await db.insert(shirtNumbersTable).values({
        tenantId: tenantB,
        season: LAST - 3,
        name: "Other Club Same Id",
        playerId: caseyA,
        number: "98",
      });
    }
    if (privateA !== undefined) {
      await db.insert(shirtNumbersTable).values({
        tenantId: tenantA,
        season: NOW,
        name: "Private Fixture",
        playerId: privateA,
        number: "8",
      });
    }
  });

  afterAll(async () => {
    const ids = [tenantA, tenantB].filter((t): t is number => typeof t === "number");
    if (ids.length === 0) return;
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, ids));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("AE5: with the feature off, the response has no shirt-number fields", async () => {
    const res = await get(tenantA, caseyA).expect(200);
    expect(res.body).not.toHaveProperty("shirtNumber");
    expect(res.body).not.toHaveProperty("shirtNumbers");
  });

  it("AE3/AE2: current number plus linked, numbered history newest-first, tenant-scoped", async () => {
    await setEnabled(tenantA, true);
    await setEnabled(tenantB, true);
    const body = (await get(tenantA, caseyA).expect(200)).body as Detail;
    expect(body.shirtNumber).toBe("4");
    // No held #23, no unnumbered season, no tenant B #99.
    expect(body.shirtNumbers).toEqual([
      { season: NOW, number: "4" },
      { season: LAST, number: "12" },
    ]);
  });

  it("a tenant only sees its own register for the same player id", async () => {
    const body = (await get(tenantB, drewB).expect(200)).body as Detail;
    expect(body.shirtNumber).toBeNull();
    expect(body.shirtNumbers).toEqual([{ season: LAST - 3, number: "99" }]);
  });

  it("a private player's response carries no shirt-number fields", async () => {
    if (privateA === undefined) return; // not minted into the crosswalk: nothing to expose
    const res = await get(tenantA, privateA);
    expect(res.body).not.toHaveProperty("shirtNumber");
    expect(res.body).not.toHaveProperty("shirtNumbers");
  });
});
