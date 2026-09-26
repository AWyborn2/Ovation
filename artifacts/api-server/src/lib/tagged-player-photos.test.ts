/**
 * Social assets lead with a library photo the player is tagged in, so the
 * player list carries each player's tagged photo (`withLibraryPhotos`), chosen
 * the same way as the single lookup: solo shots first, then newest. Another
 * club's photos never leak in. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
} from "@workspace/db";
import { taggedPlayerPhotoUrl, withLibraryPhotos } from "./club-photo-library";

const STAMP = Date.now();
const tenantIds: number[] = [];
const playerIds: number[] = [];

async function photo(tenantId: number, path: string, taken: string, tagged: number[]) {
  const [p] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId,
      objectPath: `/objects/library/${path}-${STAMP}`,
      thumbPath: `/objects/library/${path}-${STAMP}-thumb`,
      width: 100,
      height: 100,
      takenAt: new Date(taken),
    })
    .returning();
  if (tagged.length > 0) {
    await db
      .insert(clubPhotoPlayersTable)
      .values(tagged.map((playerId) => ({ tenantId, photoId: p.id, playerId })));
  }
}

beforeAll(async () => {
  for (const n of [1, 2]) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `tagged-${n}-${STAMP}`,
        centralClubId: 97661 + n,
        name: "Tagged Club",
        plan: "pro",
      })
      .returning();
    tenantIds.push(t.id);
  }
  const players = await db
    .insert(playersTable)
    .values([
      { surname: `Solo${STAMP}`, givenName: "A" },
      { surname: `Group${STAMP}`, givenName: "B" },
      { surname: `None${STAMP}`, givenName: "C" },
    ])
    .returning();
  playerIds.push(...players.map((p) => p.id));
  const [solo, group] = playerIds;
  const [mine, other] = tenantIds;
  // Solo shot (older) beats a newer group shot for the same player.
  await photo(mine, "solo-old", "2025-01-01", [solo]);
  await photo(mine, "group-new", "2026-01-01", [solo, group]);
  // Another club's newer solo photo of the same player must not leak.
  await photo(other, "elsewhere", "2026-06-01", [group]);
});

afterAll(async () => {
  await db.delete(clubPhotoPlayersTable).where(inArray(clubPhotoPlayersTable.tenantId, tenantIds));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenantIds));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
});

describe("withLibraryPhotos", () => {
  it("attaches each player's tagged photo, solo shots first, this club only", async () => {
    const [solo, group, none] = playerIds;
    const out = await withLibraryPhotos(tenantIds[0], [
      { id: solo },
      { id: group },
      { id: none },
      { id: 90001 }, // a fill-in never gets one
    ]);
    const byId = new Map(out.map((p) => [p.id, p.libraryPhotoUrl]));
    expect(byId.get(solo)).toContain(`solo-old-${STAMP}`);
    expect(byId.get(group)).toContain(`group-new-${STAMP}`);
    expect(byId.get(none)).toBeNull();
    expect(byId.get(90001)).toBeNull();
  });

  it("matches the single-player lookup", async () => {
    for (const id of playerIds) {
      const [row] = await withLibraryPhotos(tenantIds[0], [{ id }]);
      expect(row.libraryPhotoUrl).toBe(await taggedPlayerPhotoUrl(tenantIds[0], id));
    }
  });

  it("returns an empty page unchanged", async () => {
    expect(await withLibraryPhotos(tenantIds[0], [])).toEqual([]);
    expect(
      (await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantIds[0]))).length,
    ).toBe(1);
  });
});
