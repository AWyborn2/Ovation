/**
 * A team list card's photo is one of the selected players (Ash, 5 Oct 2026):
 * picked at random per fixture from the players with a library photo, never a
 * fill-in, and kept when the selection changes around them. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  fixturesTable,
  teamListsTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { generateTeamListDrafts, teamListKey } from "./team-list";
import { fillMissingDraftPhotos, teamListPhotoPlayer } from "../draft-enrich";

const STAMP = Date.now();
const NOW = new Date("2026-10-07T00:00:00Z");
let tenantId: number;
let ids: number[] = [];
const photoPath = (n: number) => `/objects/library/teamlist-${n}-${STAMP}`;

async function photoOf(n: number, playerId: number) {
  const [p] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId,
      objectPath: photoPath(n),
      thumbPath: `${photoPath(n)}-thumb`,
      width: 100,
      height: 100,
      grade: "A Grade",
    })
    .returning();
  await db.insert(clubPhotoPlayersTable).values({ tenantId, photoId: p.id, playerId });
}

async function fixtureWith(players: Array<{ playerId?: number; displayName: string }>) {
  const [f] = await db
    .insert(fixturesTable)
    .values({
      tenantId,
      grade: "A Grade",
      roundLabel: "Round 1",
      opponentName: "Rivals",
      venue: "Home Oval",
      startAt: new Date(NOW.getTime() + 72 * 3600 * 1000),
      isHome: true,
    })
    .returning();
  await db.insert(teamListsTable).values({
    tenantId,
    fixtureId: f.id,
    isPublished: true,
    players: players.map((p, i) => ({ order: i + 1, ...p })),
  });
  return f;
}

const draftFor = async (fixtureId: number) =>
  (
    await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKey, teamListKey(fixtureId)),
        ),
      )
  )[0];

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `teamlist-photo-${STAMP}`, centralClubId: 9941, name: "XI Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({
    tenantId,
    familyConfig: {
      results: { enabled: false, grades: {} },
      achievements: { enabled: false, grades: {} },
      roundup: { enabled: false, grades: {} },
      matchday: { enabled: true, grades: {} },
    },
  });
  const players = await db
    .insert(playersTable)
    .values(
      ["Ames", "Baker", "Cole", "Dunn", "Ellis"].map((s) => ({
        surname: `${s}${STAMP}`,
        givenName: "X",
      })),
    )
    .returning();
  ids = players.map((p) => p.id);
  // Baker, Dunn and Ellis have library photos; Ames and Cole don't.
  await photoOf(2, ids[1]);
  await photoOf(4, ids[3]);
  await photoOf(5, ids[4]);
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  await db.delete(clubPhotoPlayersTable).where(eq(clubPhotoPlayersTable.tenantId, tenantId));
  await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(playersTable).where(inArray(playersTable.id, ids));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("team list photo", () => {
  it("features a selected player with a library photo, never a fill-in or an unlinked name", async () => {
    expect(await teamListPhotoPlayer(tenantId, [ids[0], ids[2], 90001], "teamlist:1")).toBeNull();
    for (let i = 0; i < 20; i++) {
      const pick = await teamListPhotoPlayer(
        tenantId,
        [ids[0], ids[1], ids[2], ids[3], null, 90001],
        `teamlist:${i}`,
      );
      expect([ids[1], ids[3]]).toContain(pick);
    }
  });

  it("drafts the card with that player's photo, and keeps it through a selection change", async () => {
    const xi = [ids[0], ids[1], ids[2], ids[3], ids[4]].map((playerId, i) => ({
      playerId,
      displayName: `Player ${i}`,
    }));
    const f = await fixtureWith([...xi, { displayName: "New Signing" }]);
    await generateTeamListDrafts(tenantId, NOW);
    const draft = await draftFor(f.id);
    expect(draft.photoSource).toBe("auto:library-player");
    const featured = [ids[1], ids[3], ids[4]].find((id) =>
      draft.photoUrl?.endsWith(photoPath(ids.indexOf(id) + 1)),
    );
    expect(featured).toBeDefined();

    // Drop a photographed player who isn't featured: the photo stays.
    const other = [ids[1], ids[3], ids[4]].find((id) => id !== featured)!;
    await db
      .update(teamListsTable)
      .set({
        players: xi.filter((p) => p.playerId !== other).map((p, i) => ({ order: i + 1, ...p })),
      })
      .where(eq(teamListsTable.fixtureId, f.id));
    await generateTeamListDrafts(tenantId, NOW);
    expect((await draftFor(f.id)).photoUrl).toBe(draft.photoUrl);

    // Back-filling an empty draft picks the same player.
    await db
      .update(socialDraftsTable)
      .set({ photoUrl: null, photoSource: null })
      .where(eq(socialDraftsTable.id, draft.id));
    await fillMissingDraftPhotos(tenantId);
    expect((await draftFor(f.id)).photoUrl).toBe(draft.photoUrl);
  });
});
