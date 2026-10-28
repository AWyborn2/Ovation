/**
 * Player page sponsors (player-sponsors P1): `GET /players/:id/sponsors` gives
 * the public profile the player's own active sponsors, by the same rule and
 * date window the player's cards use. Club-wide sponsors, ended or future
 * sponsorships, fill-ins and another club's tags never show.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db, sponsorPlayersTable, sponsorsTable, tenantsTable } from "@workspace/db";
import { perthDate } from "../lib/availability-grades";

const STAMP = Date.now();
const tenantIds: number[] = [];
const PLAYER = 4301;
const UNTAGGED = 4302;
const FILL_IN = 90001;

// The club's date (Perth), as the sponsor window uses: a UTC date is a day
// behind from 4 pm to midnight UTC.
const day = (offset: number) => perthDate(new Date(Date.now() + offset * 86_400_000));
const get = (i: number, url: string) =>
  request(app).get(url).set("x-tenant-id", String(tenantIds[i]));

async function sponsor(
  tenant: number,
  name: string,
  over: Partial<typeof sponsorsTable.$inferInsert> = {},
  playerIds: number[] = [],
): Promise<number> {
  const [row] = await db
    .insert(sponsorsTable)
    .values({ tenantId: tenant, name, logoUrl: `/api/storage/objects/${STAMP}.png`, ...over })
    .returning();
  if (playerIds.length > 0) {
    await db.insert(sponsorPlayersTable).values(
      playerIds.map((playerId) => ({
        tenantId: tenant,
        sponsorId: row.id,
        playerId,
        playerName: "Tagged",
      })),
    );
  }
  return row.id;
}

beforeAll(async () => {
  for (const i of [0, 1]) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `player-page-sponsors-${i}-${STAMP}`,
        centralClubId: 9980 + i,
        readsFromCentral: true,
        name: `Player Page Sponsors Club ${i}`,
        plan: "pro",
      })
      .returning();
    tenantIds.push(t.id);
  }
  const [mine, other] = tenantIds;
  await sponsor(mine, `Club Wide ${STAMP}`, { isPresenting: true, displayOrder: 0 });
  await sponsor(mine, `Second ${STAMP}`, { displayOrder: 2, link: "" }, [PLAYER]);
  await sponsor(
    mine,
    `First ${STAMP}`,
    { displayOrder: 1, link: "https://first.example", activeFrom: day(-5), activeTo: day(5) },
    [PLAYER],
  );
  await sponsor(mine, `Ended ${STAMP}`, { activeTo: day(-1) }, [PLAYER]);
  await sponsor(mine, `Future ${STAMP}`, { activeFrom: day(1) }, [PLAYER]);
  // A fill-in can't be tagged through the API; a stray row still never shows.
  await sponsor(mine, `Fill In ${STAMP}`, {}, [FILL_IN]);
  // Another club tags its own player with the same id.
  await sponsor(other, `Other Club ${STAMP}`, {}, [PLAYER]);
});

afterAll(async () => {
  await db.delete(sponsorsTable).where(inArray(sponsorsTable.tenantId, tenantIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
});

describe("GET /players/:id/sponsors", () => {
  it("lists the player's active sponsors in card order, with logo and link", async () => {
    const res = await get(0, `/api/players/${PLAYER}/sponsors`).expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual([
      `First ${STAMP}`,
      `Second ${STAMP}`,
    ]);
    expect(res.body[0]).toEqual({
      id: expect.any(Number),
      name: `First ${STAMP}`,
      logoUrl: `/api/storage/objects/${STAMP}.png`,
      link: "https://first.example",
    });
    expect(res.body[1].link).toBe("");
  });

  it("is empty for a player with no sponsor of their own (no club-wide fallback)", async () => {
    const res = await get(0, `/api/players/${UNTAGGED}/sponsors`).expect(200);
    expect(res.body).toEqual([]);
  });

  it("is empty for a fill-in", async () => {
    const res = await get(0, `/api/players/${FILL_IN}/sponsors`).expect(200);
    expect(res.body).toEqual([]);
  });

  it("rejects an id that is not a number", async () => {
    await get(0, "/api/players/abc/sponsors").expect(400);
  });
});

describe("GET /players/:id/sponsors: tenant isolation", () => {
  it("each club sees only its own tags for the same player id", async () => {
    const mine = await get(0, `/api/players/${PLAYER}/sponsors`).expect(200);
    expect(mine.body.some((s: { name: string }) => s.name === `Other Club ${STAMP}`)).toBe(false);
    const other = await get(1, `/api/players/${PLAYER}/sponsors`).expect(200);
    expect(other.body.map((s: { name: string }) => s.name)).toEqual([`Other Club ${STAMP}`]);
  });
});
