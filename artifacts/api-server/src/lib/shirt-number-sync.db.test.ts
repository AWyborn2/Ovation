/**
 * The PlayHQ ingest's writes to the season shirt-number register, against a real
 * database (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, U5 / KTD9; AE2).
 * The planners are unit-tested in lib/db (shirt-number-sync.test.ts); this proves the
 * wiring: tenant selection, the lineup inserts and name-only attach, held-entry linking
 * through central appearances, the crosswalk mint, and the native-tenant mint fence.
 *
 * CI only: needs DATABASE_URL plus the CI central fixture (seed-ci-central-fixture.ts):
 * club 3 (Pinjarra) with Drew Fixture's A Grade scorecard rows, club 1 (Halls Head) with
 * Alex Fixture's. Runs only when both databases are local, like the upload suite's
 * central-name check, so it never touches a real central database or a real tenant.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  fixturesTable,
  teamListsTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
  playerIdMapTable,
  type ShirtNumberRow,
} from "@workspace/db";
import { linkHeldShirtNumbers, syncLineupShirtNumbers } from "@workspace/db/playhq-ingest";
import { seasonStartYearFor } from "@workspace/db/seasons";

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

/** CI central fixture participants (seed-ci-central-fixture.ts). */
const DREW = "55555555-5555-4555-8555-555555555555"; // club 3, A Grade scorecards
const ALEX = "11111111-1111-4111-8111-111111111111"; // club 1, A Grade scorecards
/** Selected in PlayHQ, never played: no central rows. */
const NOVA = randomUUID();
const NADIA = randomUUID();

const ORG_ON = randomUUID();
const ORG_OFF = randomUUID();
const ORG_NATIVE = randomUUID();
const NATIVE_TENANT = 1;

const NOW = new Date();
const START = new Date(NOW.getTime() + 2 * 86_400_000);
const SEASON = seasonStartYearFor(START);
const STAMP = Date.now();
const quiet = () => {};

describe.skipIf(!isLocalDb)("shirt numbers: PlayHQ lineup sync and held-entry links (DB)", () => {
  let onId: number;
  let offId: number;
  const register = (tenantId: number) =>
    db.select().from(shirtNumbersTable).where(eq(shirtNumbersTable.tenantId, tenantId));
  const byParticipant = (rows: ShirtNumberRow[], guid: string) =>
    rows.find((r) => r.participantId === guid);

  async function makeTenant(key: string, clubId: number, org: string, enabled: boolean) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `shirt-sync-${key}-${STAMP}`,
        centralClubId: clubId,
        readsFromCentral: true,
        name: `Shirt Sync ${key}`,
        plan: "pro",
        playhqOrgId: org,
      })
      .returning();
    await db.insert(shirtNumberSettingsTable).values({
      tenantId: t.id,
      enabled,
      duplicatePolicy: "warn",
      rolloverPolicy: "carry",
    });
    const [f] = await db
      .insert(fixturesTable)
      .values({
        tenantId: t.id,
        grade: "A Grade",
        roundLabel: "Round 1",
        opponentName: "Rivals",
        startAt: START,
        source: "playhq",
        playhqMatchId: `shirt-sync-${key}-${STAMP}`,
      })
      .returning();
    await db.insert(teamListsTable).values({
      tenantId: t.id,
      fixtureId: f.id,
      source: "playhq",
      players: [
        // Upper-case on purpose: GUIDs are compared lowercased.
        { order: 1, participantId: DREW.toUpperCase(), displayName: "Drew Fixture" },
        { order: 2, participantId: NOVA, displayName: "Nova Newcomer" },
        { order: 3, participantId: NADIA, displayName: "Nadia Named" },
      ],
    });
    return t.id;
  }

  beforeAll(async () => {
    // Club 3 has Drew's scorecards; club 2 is the switched-off club.
    onId = await makeTenant("on", 3, ORG_ON, true);
    offId = await makeTenant("off", 2, ORG_OFF, false);
    await db.insert(shirtNumbersTable).values([
      // An upload row for Drew before he had played: held by participant, numbered.
      { tenantId: onId, season: SEASON, name: "Drew Fixture", participantId: DREW, number: "23" },
      // A name-only upload row (no ids at all) for Nadia.
      { tenantId: onId, season: SEASON, name: "Nadia  named", number: "14", source: "upload" },
      // The switched-off club's own held entry for the same participant.
      { tenantId: offId, season: SEASON, name: "Drew Fixture", participantId: DREW, number: "5" },
    ]);
  });

  afterAll(async () => {
    const ids = [onId, offId].filter(Boolean);
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, ids));
    await db.delete(teamListsTable).where(inArray(teamListsTable.tenantId, ids));
    await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, ids));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("adds lineup players for the enabled club only, attaching the name-only held entry", async () => {
    const r = await syncLineupShirtNumbers({ orgIds: [ORG_ON, ORG_OFF], now: NOW, log: quiet });
    expect(r.errors).toEqual([]);
    expect(r.tenants).toEqual([{ tenantId: onId, inserted: 1, attached: 1 }]);

    const on = await register(onId);
    expect(on).toHaveLength(3);
    // Drew was already on the register (by participant): untouched, still held.
    expect(byParticipant(on, DREW)).toMatchObject({ playerId: null, number: "23" });
    // Nova is new: a held lineup entry, unnumbered (nothing to carry).
    expect(byParticipant(on, NOVA)).toMatchObject({
      season: SEASON,
      playerId: null,
      number: null,
      source: "lineup",
    });
    // Nadia's name-only upload row gained her participant and kept its number.
    expect(byParticipant(on, NADIA)).toMatchObject({
      name: "Nadia  named",
      number: "14",
      source: "upload",
    });

    // The switched-off club gets no writes at all.
    const off = await register(offId);
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ participantId: DREW, playerId: null, number: "5" });
  });

  it("a second lineup run is a no-op", async () => {
    const before = await register(onId);
    const r = await syncLineupShirtNumbers({ orgIds: [ORG_ON, ORG_OFF], now: NOW, log: quiet });
    expect(r).toEqual({ tenants: [{ tenantId: onId, inserted: 0, attached: 0 }], errors: [] });
    expect((await register(onId)).length).toBe(before.length);
  });

  it("links a held entry once its participant has a senior scorecard row, keeping its number", async () => {
    const r = await linkHeldShirtNumbers({ orgIds: [ORG_ON, ORG_OFF], log: quiet });
    expect(r.errors).toEqual([]);
    expect(r.tenants).toHaveLength(1);
    expect(r.tenants[0]).toMatchObject({ tenantId: onId, linked: 1, unmapped: 0 });
    // A central-read club with no crosswalk row for Drew mints one first.
    expect(r.tenants[0]!.minted).toBeGreaterThanOrEqual(1);

    const [map] = await db
      .select()
      .from(playerIdMapTable)
      .where(and(eq(playerIdMapTable.tenantId, onId), eq(playerIdMapTable.participantId, DREW)));
    expect(map).toBeDefined();
    expect(map!.playerId).toBeLessThan(90000);

    const on = await register(onId);
    expect(byParticipant(on, DREW)).toMatchObject({ playerId: map!.playerId, number: "23" });
    // Selected but never played: still held (R16: linked means has played).
    expect(byParticipant(on, NOVA)!.playerId).toBeNull();
    expect(byParticipant(on, NADIA)!.playerId).toBeNull();

    // The other club's entry for the same participant is untouched, and it got no crosswalk.
    const off = await register(offId);
    expect(off[0]).toMatchObject({ participantId: DREW, playerId: null, number: "5" });
    expect(
      await db.select().from(playerIdMapTable).where(eq(playerIdMapTable.tenantId, offId)),
    ).toEqual([]);
  });

  it("a second link run is a no-op", async () => {
    const r = await linkHeldShirtNumbers({ orgIds: [ORG_ON, ORG_OFF], log: quiet });
    expect(r).toEqual({
      tenants: [{ tenantId: onId, linked: 0, minted: 0, unmapped: 0 }],
      errors: [],
    });
  });

  it("never mints for the native-stats tenant: an unmapped participant stays held", async () => {
    const [native] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, NATIVE_TENANT));
    expect(native, "CI seeds tenant 1 (seed-ci-tenant.ts)").toBeDefined();
    expect(native!.readsFromCentral).toBe(false);
    expect(native!.centralClubId).toBe(1);
    const [settingsBefore] = await db
      .select()
      .from(shirtNumberSettingsTable)
      .where(eq(shirtNumberSettingsTable.tenantId, NATIVE_TENANT));
    const alexMapped = await db
      .select()
      .from(playerIdMapTable)
      .where(
        and(eq(playerIdMapTable.tenantId, NATIVE_TENANT), eq(playerIdMapTable.participantId, ALEX)),
      );
    expect(alexMapped, "Alex must have no tenant-1 crosswalk row for this case").toEqual([]);
    const crosswalkBefore = (
      await db
        .select({ id: playerIdMapTable.playerId })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, NATIVE_TENANT))
    ).length;

    const NATIVE_SEASON = 2041;
    let entryId: number | undefined;
    try {
      await db
        .update(tenantsTable)
        .set({ playhqOrgId: ORG_NATIVE })
        .where(eq(tenantsTable.id, NATIVE_TENANT));
      await db
        .insert(shirtNumberSettingsTable)
        .values({ tenantId: NATIVE_TENANT, enabled: true })
        .onConflictDoUpdate({ target: shirtNumberSettingsTable.tenantId, set: { enabled: true } });
      const [entry] = await db
        .insert(shirtNumbersTable)
        .values({
          tenantId: NATIVE_TENANT,
          season: NATIVE_SEASON,
          name: "Alex Fixture",
          participantId: ALEX,
          number: "8",
        })
        .returning();
      entryId = entry!.id;

      const r = await linkHeldShirtNumbers({ orgIds: [ORG_NATIVE], log: quiet });
      expect(r.errors).toEqual([]);
      expect(r.tenants).toHaveLength(1);
      expect(r.tenants[0]).toMatchObject({ tenantId: NATIVE_TENANT, linked: 0, minted: 0 });
      expect(r.tenants[0]!.unmapped).toBeGreaterThanOrEqual(1);

      const [after] = await db
        .select()
        .from(shirtNumbersTable)
        .where(eq(shirtNumbersTable.id, entryId));
      expect(after).toMatchObject({ playerId: null, number: "8" });
      const crosswalkAfter = (
        await db
          .select({ id: playerIdMapTable.playerId })
          .from(playerIdMapTable)
          .where(eq(playerIdMapTable.tenantId, NATIVE_TENANT))
      ).length;
      expect(crosswalkAfter).toBe(crosswalkBefore);
    } finally {
      if (entryId !== undefined)
        await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.id, entryId));
      await db
        .update(tenantsTable)
        .set({ playhqOrgId: native!.playhqOrgId })
        .where(eq(tenantsTable.id, NATIVE_TENANT));
      if (settingsBefore) {
        await db
          .update(shirtNumberSettingsTable)
          .set({ enabled: settingsBefore.enabled })
          .where(eq(shirtNumberSettingsTable.tenantId, NATIVE_TENANT));
      } else {
        await db
          .delete(shirtNumberSettingsTable)
          .where(eq(shirtNumberSettingsTable.tenantId, NATIVE_TENANT));
      }
    }
  });
});
