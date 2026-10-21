import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  juniorFixturesTable,
  juniorTeamListsTable,
  juniorParticipantsTable,
  juniorShirtNumbersTable,
  shirtNumberSettingsTable,
  juniorMatchDisplaySettingsTable,
  clubPhotosTable,
} from "@workspace/db";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "./auth";
import { juniorCarouselContent, juniorCarouselFixtureId } from "./junior-carousel-content";
import { buildMatchDayContent } from "./card-content/match-day";
import { GetWeekendCarouselSourcesResponse } from "@workspace/api-zod";
import { validJuniorStockSelection } from "./junior-stock-photos";
import type { QueuedCarousel } from "@workspace/scorecard/queued-carousel";

const key = randomUUID();
const publicId = randomUUID(),
  privateId = randomUUID(),
  foreignId = randomUUID();
let tenant = 0,
  other = 0,
  fixtureId = 0,
  cookie = "";
const ids: number[] = [];
const query = { from: "2026-10-24", to: "2026-10-25", audience: "junior" };

beforeAll(async () => {
  const centralId = randomInt(1_300_000_000, 1_400_000_000);
  const rows = await db
    .insert(tenantsTable)
    .values(
      [0, 1].map((n) => ({
        slug: `junior-carousel-${n}-${key}`,
        name: `Junior Carousel Test ${n}`,
        centralClubId: centralId + n,
        readsFromCentral: true,
        plan: "pro",
        playhqOrgId: randomUUID(),
        playhqSyncEnabled: true,
        juniorSyncEnabled: true,
      })),
    )
    .returning();
  ids.push(...rows.map((r) => r.id));
  [tenant, other] = ids;
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant,
      username: `junior-carousel-${key}`,
      displayName: "Carousel test",
      passwordHash: "unused",
    })
    .returning();
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  await db.insert(juniorParticipantsTable).values([
    { tenantId: tenant, participantId: publicId, displayName: "Alice Public" },
    { tenantId: tenant, participantId: privateId, displayName: "Private Junior", isPrivate: true },
    { tenantId: other, participantId: foreignId, displayName: "Other Club Junior" },
  ]);
  await db
    .insert(juniorMatchDisplaySettingsTable)
    .values({ tenantId: tenant, nameStyle: "first_initial" });
  await db.insert(shirtNumberSettingsTable).values({ tenantId: tenant, enabled: true });
  await db.insert(juniorShirtNumbersTable).values([
    { tenantId: tenant, participantId: publicId, name: "Alice Public", season: 2026, number: "7" },
    {
      tenantId: tenant,
      participantId: privateId,
      name: "Private Junior",
      season: 2026,
      number: "12",
    },
    { tenantId: tenant, participantId: publicId, name: "Alice Public", season: 2025, number: "99" },
  ]);
  const base = {
    tenantId: tenant,
    ageGroup: "Year 5",
    teamName: "Gold",
    opponentName: "Carousel Test Opponent",
    seasonStartYear: 2026,
    venue: "Junior Oval",
    isHome: false,
    status: "UPCOMING",
  };
  const fixtures = await db
    .insert(juniorFixturesTable)
    .values([
      { ...base, playhqMatchId: randomUUID(), startAt: new Date("2026-10-23T16:00:00Z") },
      {
        ...base,
        playhqMatchId: randomUUID(),
        teamName: "Blue",
        startAt: new Date("2026-10-25T15:59:59Z"),
      },
      {
        ...base,
        playhqMatchId: randomUUID(),
        status: "CANCELLED",
        startAt: new Date("2026-10-24T00:00:00Z"),
      },
      {
        ...base,
        playhqMatchId: randomUUID(),
        opponentName: "Bye",
        startAt: new Date("2026-10-24T00:00:00Z"),
      },
      { ...base, playhqMatchId: randomUUID(), startAt: new Date("2026-10-25T16:00:00Z") },
      {
        ...base,
        playhqMatchId: randomUUID(),
        tenantId: other,
        startAt: new Date("2026-10-24T00:00:00Z"),
      },
    ])
    .returning();
  fixtureId = fixtures[0].id;
  await db.insert(juniorTeamListsTable).values([
    {
      tenantId: tenant,
      juniorFixtureId: fixtureId,
      isPublished: true,
      source: "admin",
      players: [
        { order: 2, participantId: privateId.toUpperCase(), role: "WK" },
        { order: 1, participantId: publicId, role: "C" },
        { order: 3, participantId: foreignId },
        { order: 4, participantId: randomUUID() },
      ],
    },
    {
      tenantId: tenant,
      juniorFixtureId: fixtures[1].id,
      isPublished: false,
      source: "admin",
      players: [{ order: 1, participantId: publicId }],
    },
  ]);
});

afterAll(async () => {
  for (const id of ids) {
    await db.delete(juniorTeamListsTable).where(eq(juniorTeamListsTable.tenantId, id));
    await db.delete(juniorFixturesTable).where(eq(juniorFixturesTable.tenantId, id));
    await db.delete(juniorShirtNumbersTable).where(eq(juniorShirtNumbersTable.tenantId, id));
    await db.delete(juniorParticipantsTable).where(eq(juniorParticipantsTable.tenantId, id));
    await db
      .delete(juniorMatchDisplaySettingsTable)
      .where(eq(juniorMatchDisplaySettingsTable.tenantId, id));
    await db.delete(shirtNumberSettingsTable).where(eq(shirtNumberSettingsTable.tenantId, id));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, id));
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
});

describe("junior match-day and team-list carousel sources", () => {
  it("rejects junior stock uploads that include a player or grade before touching storage", async () => {
    for (const extra of [{ grade: "A Grade" }, { playerIds: [123] }, { photoType: "team" }]) {
      const response = await request(app)
        .post("/api/club-photos/ingest")
        .set("x-tenant-id", String(tenant))
        .set("Cookie", cookie)
        .send({ objectPaths: ["/objects/not-read"], juniorStock: true, ...extra });
      expect(response.status).toBe(422);
    }
  });
  it("persists reusable stock images, isolates clubs, and verifies approved URLs before review", async () => {
    const base = {
      width: 600,
      height: 400,
      objectPath: `/objects/stock-${key}`,
      thumbPath: `/objects/thumb-${key}`,
    };
    const photos = await db
      .insert(clubPhotosTable)
      .values([
        { ...base, tenantId: tenant, juniorStock: true },
        { ...base, tenantId: tenant, objectPath: `/objects/ordinary-${key}` },
        { ...base, tenantId: other, juniorStock: true, objectPath: `/objects/foreign-${key}` },
        {
          ...base,
          tenantId: tenant,
          juniorStock: true,
          grade: "A Grade",
          objectPath: `/objects/graded-${key}`,
        },
      ])
      .returning();
    const response = await request(app)
      .get("/api/weekend-carousel/sources")
      .set("x-tenant-id", String(tenant))
      .set("Cookie", cookie)
      .query({ ...query, setType: "matchDay" });
    const body = GetWeekendCarouselSourcesResponse.parse(response.body);
    expect(body.juniorStockPhotos?.map((p) => p.id)).toEqual([photos[0].id]);
    const photo = body.juniorStockPhotos![0];
    const saved = {
      slides: [
        { junior: true, input: { juniorStockPhotoId: photo.id }, data: { photoUrl: photo.url } },
      ],
    } as unknown as QueuedCarousel;
    expect(await validJuniorStockSelection(tenant, saved)).toBe(true);
    expect(await validJuniorStockSelection(other, saved)).toBe(false);
    saved.slides[0].data.photoUrl = "/objects/arbitrary";
    expect(await validJuniorStockSelection(tenant, saved)).toBe(false);
    saved.slides[0].data.photoUrl = photo.url;
    await db
      .update(clubPhotosTable)
      .set({ juniorStock: false })
      .where(eq(clubPhotosTable.id, photo.id));
    expect(await validJuniorStockSelection(tenant, saved)).toBe(false);
    await db
      .update(clubPhotosTable)
      .set({ juniorStock: true })
      .where(eq(clubPhotosTable.id, photo.id));
    const future = await request(app)
      .get("/api/weekend-carousel/sources")
      .set("x-tenant-id", String(tenant))
      .set("Cookie", cookie)
      .query({ from: "2027-01-01", to: "2027-01-02", audience: "junior" });
    expect(future.body.juniorStockPhotos.map((p: { id: number }) => p.id)).toEqual([photo.id]);
  });
  it("uses club-time boundaries, isolates tenants and excludes byes/cancellations", async () => {
    const result = await juniorCarouselContent(tenant, "matchDay", query.from, query.to);
    expect(result.fixtures).toHaveLength(2);
    expect(result.fixtures.every((f) => f.tenantId === tenant && f.id < -2_000_000_000)).toBe(true);
    // Junior Match Day slides come from the content builder, like senior ones.
    expect(result.content).toEqual({});
    const id = juniorCarouselFixtureId(fixtureId);
    expect(result.junior.get(id)).toEqual({ gradeLabel: "Year 5 — Gold", juniorTeamName: "Gold" });
    const content = (await buildMatchDayContent(tenant, result.fixtures, result)).get(id)!;
    expect(content).toMatchObject({
      kind: "matchDay",
      page: "fixture",
      junior: true,
      juniorTeamName: "Gold",
      grade: "Year 5 — Gold",
      opposition: { rawName: "Carousel Test Opponent" },
      venue: "Junior Oval",
    });
    expect(content.date).toBeTruthy();
    expect(content.startTime).toBeTruthy();
    expect(result.fixtures[0].isHome).toBe(false);
    expect(result.warnings.join(" ")).toContain("Excluded 2");
  });

  it("uses only published own-club juniors, public name style and junior season numbers", async () => {
    const result = await juniorCarouselContent(tenant, "teamList", query.from, query.to);
    expect(result.fixtures).toHaveLength(1);
    const input = result.content[juniorCarouselFixtureId(fixtureId)];
    // The junior team list builder (ADR-010 P7), the same one the junior sweep
    // uses: the club's public naming, every listed player kept in order and
    // anyone not publicly named (private, another club's, unknown) withheld.
    expect(input).toMatchObject({
      kind: "teamList",
      page: "team",
      junior: true,
      grade: "Year 5 — Gold",
      juniorTeamName: "Gold",
      source: {
        kind: "teamList",
        junior: true,
        numbering: "shirt",
        players: [
          { order: 1, surname: "ALICE P", role: "C", shirtNumber: "7" },
          { order: 2, surname: "PRIVATE PLAYER", role: "WK" },
          { order: 3, surname: "PRIVATE PLAYER" },
          { order: 4, surname: "PRIVATE PLAYER" },
        ],
      },
    });
    const players = (input as { source: { players: Record<string, unknown>[] } }).source.players;
    expect(players.slice(1).some((p) => "shirtNumber" in p)).toBe(false);
    const serialized = JSON.stringify(input);
    for (const secret of [
      publicId,
      privateId,
      foreignId,
      "Private Junior",
      "Alice Public",
      "Other Club Junior",
      '"12"',
      '"99"',
    ])
      expect(serialized.toLowerCase()).not.toContain(secret.toLowerCase());
    expect(result.warnings.join(" ")).toContain("no published junior team list");
  });

  it.each(["matchDay", "teamList"])(
    "serves validated %s sources without consulting senior central data",
    async (setType) => {
      const response = await request(app)
        .get("/api/weekend-carousel/sources")
        .set("x-tenant-id", String(tenant))
        .set("Cookie", cookie)
        .query({ ...query, setType });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const body = GetWeekendCarouselSourcesResponse.parse(response.body);
      expect(body.fixtures.length).toBe(setType === "matchDay" ? 2 : 1);
      const junior = (id: number) =>
        setType === "matchDay"
          ? body.matchDayContent?.[id]?.junior === true
          : body.content?.[id]?.junior === true;
      expect(body.fixtures.every((f) => junior(f.id))).toBe(true);
      expect(body.photos).toEqual([]);
    },
  );

  it("serves no junior sources while junior sync is switched off", async () => {
    await db
      .update(tenantsTable)
      .set({ juniorSyncEnabled: false })
      .where(eq(tenantsTable.id, tenant));
    try {
      const result = await juniorCarouselContent(tenant, "teamList", query.from, query.to);
      expect(result.fixtures).toEqual([]);
    } finally {
      await db
        .update(tenantsTable)
        .set({ juniorSyncEnabled: true })
        .where(eq(tenantsTable.id, tenant));
    }
  });
});
