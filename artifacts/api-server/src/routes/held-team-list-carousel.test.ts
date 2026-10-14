import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  teamListsTable,
  selectionsTable,
  squadMembersTable,
  availabilityRoundsTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
  type TeamListPlayer,
  type SelectionSlot,
} from "@workspace/db";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { finaliseSelection } from "../lib/selection-board";
import {
  recoverPublishedSelectionIdentities,
  loadSelectionParticipantIds,
  selectionPublishedPlayers,
} from "../lib/selection-published-players";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import type * as AvailabilityMessaging from "../lib/availability-messaging";

// Exercise real publication/storage/HTTP generation, without sending messages.
vi.mock("../lib/availability-messaging", async (original) => ({
  ...(await original<typeof AvailabilityMessaging>()),
  messageMember: vi.fn(async () => ({ results: [] })),
  notifyStaff: vi.fn(async () => undefined),
}));

const stamp = randomUUID();
const now = new Date("2034-10-05T00:00:00Z");
const startAt = new Date("2034-10-07T04:00:00Z");
const profiles = Array.from({ length: 10 }, () => randomUUID());
const expectedNumbers = [
  "77",
  "18",
  "39",
  "102",
  "75",
  "88",
  undefined,
  undefined,
  undefined,
  "105",
];
let tenant: number, other: number, fixtureId: number, selectionId: number, cookie: string;
let memberIds: number[], original: TeamListPlayer[], slots: SelectionSlot[];
const actor = { kind: "admin" as const, id: 0, name: "Test Admin" };
const list = async () =>
  (await db.select().from(teamListsTable).where(eq(teamListsTable.fixtureId, fixtureId)))[0];
const sources = async () => {
  const res = await request(app)
    .get("/api/weekend-carousel/sources")
    .set("x-tenant-id", String(tenant))
    .set("Cookie", cookie)
    .query({ from: "2034-10-06", to: "2034-10-08", setType: "teamList" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};
const legacy = () =>
  db
    .update(teamListsTable)
    .set({
      players: original.map(({ participantId: _, ...p }) => p),
    })
    .where(eq(teamListsTable.fixtureId, fixtureId));

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "held-carousel-test";
  const tenants = await db
    .insert(tenantsTable)
    .values([
      {
        slug: `held-carousel-${stamp}`,
        name: "Held Carousel Test",
        centralClubId: randomInt(1000000, 1000000000),
        readsFromCentral: false,
      },
      {
        slug: `held-other-${stamp}`,
        name: "Held Other Test",
        centralClubId: randomInt(1000000, 1000000000),
        readsFromCentral: false,
      },
    ])
    .returning();
  [tenant, other] = tenants.map((t) => t.id);
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant,
      username: `held-${stamp}`,
      displayName: actor.name,
      passwordHash: "x",
    })
    .returning();
  actor.id = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  const members = await db
    .insert(squadMembersTable)
    .values(
      profiles.map((id, i) => ({
        tenantId: tenant,
        playhqProfileId: id.toUpperCase(),
        firstName: "Test",
        lastName: `Member${i}`,
        section: "senior" as const,
        linkedPlayerId: i === 5 ? -18501 : i === 8 ? 90001 : null,
        isPrivate: i === 7,
      })),
    )
    .returning();
  memberIds = members.map((m) => m.id);
  slots = Array.from({ length: 12 }, (_, i) => ({
    memberId: i < 9 ? memberIds[i] : i === 11 ? memberIds[9] : null,
  }));
  const [round] = await db
    .insert(availabilityRoundsTable)
    .values({ tenantId: tenant, weekendDate: "2034-10-07" })
    .returning();
  const [fixture] = await db
    .insert(fixturesTable)
    .values({
      tenantId: tenant,
      grade: "A Grade",
      opponentName: "Visitors",
      startAt,
      source: "manual",
    })
    .returning();
  fixtureId = fixture.id;
  const [side] = await db
    .insert(selectionsTable)
    .values({
      tenantId: tenant,
      roundId: round.id,
      fixtureId,
      slots,
      captainMemberId: memberIds[0],
      keeperMemberId: memberIds[0],
    })
    .returning();
  selectionId = side.id;
  await db.insert(shirtNumberSettingsTable).values({ tenantId: tenant, enabled: true });
  await db.insert(shirtNumbersTable).values([
    ...profiles.map((id, i) => ({
      tenantId: tenant,
      season: 2034,
      participantId: id,
      playerId: i === 5 ? -18501 : null,
      name: `Test Member${i}`,
      number: i === 7 ? "66" : i === 8 ? "67" : (expectedNumbers[i] ?? null),
      source: "admin" as const,
    })),
    {
      tenantId: tenant,
      season: 2033,
      participantId: profiles[0],
      name: "Previous season",
      number: "98",
      source: "admin",
    },
    {
      tenantId: other,
      season: 2034,
      participantId: profiles[0],
      name: "Other club",
      number: "99",
      source: "admin",
    },
  ]);
  await finaliseSelection(tenant, actor, selectionId, 1, { now });
  original = (await list()).players;
});
beforeEach(async () => {
  await db
    .update(teamListsTable)
    .set({ players: original, source: "selection", isPublished: true })
    .where(eq(teamListsTable.fixtureId, fixtureId));
  await db
    .update(selectionsTable)
    .set({
      slots,
      state: "final",
      finalisedAt: now,
      captainMemberId: memberIds[0],
      keeperMemberId: memberIds[0],
    })
    .where(eq(selectionsTable.id, selectionId));
  await db
    .update(shirtNumberSettingsTable)
    .set({ enabled: true })
    .where(eq(shirtNumberSettingsTable.tenantId, tenant));
});
afterAll(async () => {
  await purgeTestTenants([tenant, other].filter(Boolean));
});

describe("Held numbers from Selection Hub to Team List carousel", () => {
  it("publishes participant identities for all six Held cases and the twelfth, without leaking private/fill-in IDs", async () => {
    for (const i of [0, 1, 2, 3, 4, 9]) {
      expect(original[i].participantId).toBe(profiles[i]);
      expect(original[i]).not.toHaveProperty("playerId");
    }
    expect(original[9]).toMatchObject({ order: 12, participantId: profiles[9] });
    expect(original[9]).not.toHaveProperty("role");
    expect(original[0].role).toBe("C/WK");
    for (const i of [7, 8]) {
      expect(original[i]).not.toHaveProperty("participantId");
      expect(original[i]).not.toHaveProperty("playerId");
    }
    expect(original[7].displayName).toBe("Private Player");
    const body = await sources();
    expect(
      body.content[fixtureId].players.map((p: { shirtNumber?: string }) => p.shirtNumber),
    ).toEqual(expectedNumbers);
    expect(body.content[fixtureId].players[9].order).toBe(12);
    expect(JSON.stringify(body.content)).not.toMatch(/participantId|playerId|Member7/);
    for (const profile of profiles) expect(JSON.stringify(body.content)).not.toContain(profile);
  });

  it("recovers all six old Held numbers by finalised member identity, with no publication or snapshot writes", async () => {
    await legacy();
    const before = await list();
    const body = await sources();
    expect(
      body.content[fixtureId].players.map((p: { shirtNumber?: string }) => p.shirtNumber),
    ).toEqual(expectedNumbers);
    expect(await list()).toEqual(before);
    // A previous generated set is a value snapshot, not live register bindings.
    await db
      .update(shirtNumberSettingsTable)
      .set({ enabled: false })
      .where(eq(shirtNumberSettingsTable.tenantId, tenant));
    expect((await sources()).content[fixtureId]).not.toHaveProperty("numbering");
    expect(body.content[fixtureId].players[0].shirtNumber).toBe("77");
  });

  it("never uses reopened drafts, even if their player names match the publication", async () => {
    await legacy();
    await db
      .update(selectionsTable)
      .set({ state: "draft" })
      .where(eq(selectionsTable.id, selectionId));
    const body = await sources();
    expect(body.content[fixtureId].players[0]).not.toHaveProperty("shirtNumber");
    expect(body.content[fixtureId].players[5].shirtNumber).toBe("88");
    expect(body.warnings.join(" ")).toContain("could not be verified");
    expect(body.content[fixtureId].players.map((p: { order: number }) => p.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 12,
    ]);
  });

  it.each(["displayName", "order", "role", "playerId", "participantId"] as const)(
    "refuses a legacy source with a conflicting %s",
    async (field) => {
      await legacy();
      const saved = await list();
      const players = saved.players.map((p) => ({ ...p }));
      Object.assign(players[1], {
        [field]: {
          displayName: "Different Person",
          order: 10,
          role: "C",
          playerId: -19001,
          participantId: randomUUID(),
        }[field],
      });
      await db
        .update(teamListsTable)
        .set({ players })
        .where(eq(teamListsTable.fixtureId, fixtureId));
      const body = await sources();
      expect(
        body.content[fixtureId].players.find((p: { order: number }) => p.order === 1),
      ).not.toHaveProperty("shirtNumber");
      expect(body.warnings.join(" ")).toContain("could not be verified");
    },
  );

  it("rejects duplicate member IDs and ambiguous same-name legacy rows", async () => {
    await legacy();
    await db
      .update(selectionsTable)
      .set({ slots: slots.map((s, i) => (i === 1 ? slots[0] : s)) })
      .where(eq(selectionsTable.id, selectionId));
    expect((await sources()).warnings.join(" ")).toContain("could not be verified");
    await db.update(selectionsTable).set({ slots }).where(eq(selectionsTable.id, selectionId));
    await db
      .update(squadMembersTable)
      .set({ lastName: "Member0" })
      .where(eq(squadMembersTable.id, memberIds[1]));
    try {
      const saved = await list();
      await db
        .update(teamListsTable)
        .set({
          players: saved.players.map((p, i) =>
            i === 1 ? { ...p, displayName: "Test Member0" } : p,
          ),
        })
        .where(eq(teamListsTable.fixtureId, fixtureId));
      const body = await sources();
      expect(body.content[fixtureId].players[0]).not.toHaveProperty("shirtNumber");
      expect(body.content[fixtureId].players[1]).not.toHaveProperty("shirtNumber");
      expect(body.warnings.join(" ")).toContain("could not be verified");
    } finally {
      await db
        .update(squadMembersTable)
        .set({ lastName: "Member1" })
        .where(eq(squadMembersTable.id, memberIds[1]));
    }
  });

  it("does not enrich another club's list or manual/PlayHQ/unpublished sources", async () => {
    await legacy();
    const saved = await list();
    expect((await recoverPublishedSelectionIdentities(other, saved, startAt)).players).toEqual(
      saved.players,
    );
    for (const overrides of [{ source: "admin" }, { source: "playhq" }, { isPublished: false }]) {
      expect(
        await recoverPublishedSelectionIdentities(tenant, { ...saved, ...overrides }, startAt),
      ).toEqual({ players: saved.players });
    }
  });

  it("does not equate distinct Profile IDs and participant GUIDs or guess a Held identity by name", async () => {
    await legacy();
    await db
      .update(squadMembersTable)
      .set({ playhqProfileId: randomUUID() })
      .where(eq(squadMembersTable.id, memberIds[0]));
    try {
      const verified = await loadSelectionParticipantIds(db, tenant, startAt);
      expect(verified.has(memberIds[0])).toBe(false);
      const body = await sources();
      expect(body.content[fixtureId].players[0]).not.toHaveProperty("shirtNumber");
      expect(body.warnings.join(" ")).toContain("could not be verified");
      const [member] = await db
        .select()
        .from(squadMembersTable)
        .where(eq(squadMembersTable.id, memberIds[0]));
      expect(
        selectionPublishedPlayers(
          { slots: [{ memberId: member.id }], captainMemberId: null, keeperMemberId: null },
          [member],
          verified,
        )[0],
      ).not.toHaveProperty("participantId");
    } finally {
      await db
        .update(squadMembersTable)
        .set({ playhqProfileId: profiles[0].toUpperCase() })
        .where(eq(squadMembersTable.id, memberIds[0]));
    }
  });

  it("takes a linked player's participant GUID from the register when their Profile ID is different", async () => {
    await db
      .update(squadMembersTable)
      .set({ playhqProfileId: randomUUID() })
      .where(eq(squadMembersTable.id, memberIds[5]));
    try {
      const verified = await loadSelectionParticipantIds(db, tenant, startAt);
      expect(verified.get(memberIds[5])).toBe(profiles[5]);
      const [member] = await db
        .select()
        .from(squadMembersTable)
        .where(eq(squadMembersTable.id, memberIds[5]));
      expect(
        selectionPublishedPlayers(
          { slots: [{ memberId: member.id }], captainMemberId: null, keeperMemberId: null },
          [member],
          verified,
        )[0].participantId,
      ).toBe(profiles[5]);
    } finally {
      await db
        .update(squadMembersTable)
        .set({ playhqProfileId: profiles[5].toUpperCase() })
        .where(eq(squadMembersTable.id, memberIds[5]));
    }
  });

  it("does not publish a Profile ID merely because it collides with another person's participant GUID", async () => {
    await legacy();
    await db
      .update(squadMembersTable)
      .set({ playhqProfileId: profiles[1] })
      .where(eq(squadMembersTable.id, memberIds[0]));
    try {
      const verified = await loadSelectionParticipantIds(db, tenant, startAt);
      expect(verified.has(memberIds[0])).toBe(false);
      const body = await sources();
      expect(body.content[fixtureId].players[0]).not.toHaveProperty("shirtNumber");
      expect(body.content[fixtureId].players[1].shirtNumber).toBe("18");
    } finally {
      await db
        .update(squadMembersTable)
        .set({ playhqProfileId: profiles[0].toUpperCase() })
        .where(eq(squadMembersTable.id, memberIds[0]));
    }
  });

  it("keeps juniors separate and feature-off cards on batting order", async () => {
    await legacy();
    await db
      .update(shirtNumberSettingsTable)
      .set({ enabled: false })
      .where(eq(shirtNumberSettingsTable.tenantId, tenant));
    const disabled = (await sources()).content[fixtureId];
    expect(disabled).not.toHaveProperty("numbering");
    expect(disabled.players.every((p: { shirtNumber?: string }) => !p.shirtNumber)).toBe(true);
    await db
      .update(shirtNumberSettingsTable)
      .set({ enabled: true })
      .where(eq(shirtNumberSettingsTable.tenantId, tenant));
    await db.update(fixturesTable).set({ grade: "U15" }).where(eq(fixturesTable.id, fixtureId));
    try {
      const junior = (await sources()).content[fixtureId];
      expect(junior).not.toHaveProperty("numbering");
      expect(
        junior.players.every(
          (p: { surname: string; shirtNumber?: string }) =>
            p.surname === "PLAYER" && !p.shirtNumber,
        ),
      ).toBe(true);
    } finally {
      await db
        .update(fixturesTable)
        .set({ grade: "A Grade" })
        .where(eq(fixturesTable.id, fixtureId));
    }
  });
});
