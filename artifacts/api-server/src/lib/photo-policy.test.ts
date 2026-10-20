/**
 * Tag-based photo policy (social-photo-tag-selection, Ash 19–20 Oct 2026):
 * Team List and match result cards show someone from the side or game (tagged
 * photo, then headshot) and nothing else; Match Day shows the grade's team or
 * celebrating photos; Team List rotates towards the players and photos least
 * used on recent Team List posts. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  playerImagesTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  cardPhotoRulesTable,
  socialDraftsTable,
} from "@workspace/db";
import { pickCandidatePhoto, pickDraftPhoto } from "./draft-enrich";
import { objectUrl } from "./photo-store";

const STAMP = Date.now();
const GRADE = `Policy Grade ${STAMP}`;
const OTHER = `Policy Other ${STAMP}`;
let tenantId: number;
const ids: number[] = [];

const pathOf = (name: string) => `/objects/library/policy-${STAMP}-${name}`;
const urlOf = (name: string) => objectUrl(pathOf(name));

async function photo(
  name: string,
  opts: { players?: number[]; grade?: string; types?: string[]; takenAt?: string } = {},
): Promise<number> {
  const [p] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId,
      objectPath: pathOf(name),
      thumbPath: `${pathOf(name)}-thumb`,
      width: 100,
      height: 100,
      grade: opts.grade ?? GRADE,
      takenAt: new Date(opts.takenAt ?? "2026-01-01T00:00:00Z"),
      photoTypes: opts.types ?? [],
    })
    .returning();
  for (const playerId of opts.players ?? []) {
    await db.insert(clubPhotoPlayersTable).values({ tenantId, photoId: p.id, playerId });
  }
  return p.id;
}

/** A Team List draft that used `url`, as if posted recently. */
async function usedOnTeamList(url: string, key: string) {
  await db.insert(socialDraftsTable).values({
    tenantId,
    engine: "teamlist",
    status: "posted",
    cardInput: { kind: "teamList", grade: GRADE },
    appPath: "/fixtures",
    sourceKey: key,
    photoUrl: url,
    photoSource: "auto:library-player",
  });
}

const rotate = (candidates: number[], seed: string) =>
  pickCandidatePhoto(tenantId, candidates, { order: "rotate", seed, types: [], format: null });

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `policy-${STAMP}`, centralClubId: 9961, name: "Policy Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const rows = await db
    .insert(playersTable)
    .values(
      ["Ames", "Baker", "Cole", "Dunn"].map((s) => ({ surname: `${s}${STAMP}`, givenName: "P" })),
    )
    .returning();
  ids.push(...rows.map((r) => r.id));
  const [a, b, c] = ids;
  await photo("a1", { players: [a], takenAt: "2026-02-01T00:00:00Z" });
  await photo("a2", { players: [a], takenAt: "2026-01-01T00:00:00Z" });
  await photo("b1", { players: [b] });
  await db
    .insert(playerImagesTable)
    .values({ tenantId, playerId: c, imageUrl: `/headshot-${STAMP}-c`, isDefault: true });
  // The grade's photos: an untagged newest one, a celebration and a team shot.
  await photo("grade-plain", { takenAt: "2026-05-01T00:00:00Z" });
  await photo("grade-celebrating", { types: ["celebrating"], takenAt: "2026-04-01T00:00:00Z" });
  await photo("grade-team", { types: ["team"], takenAt: "2026-03-01T00:00:00Z" });
  await photo("other-team", { grade: OTHER, types: ["team"], takenAt: "2026-06-01T00:00:00Z" });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(cardPhotoRulesTable).where(eq(cardPhotoRulesTable.tenantId, tenantId));
  await db.delete(playerImagesTable).where(eq(playerImagesTable.tenantId, tenantId));
  await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId));
  await db.delete(playersTable).where(inArray(playersTable.id, ids));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("match results show someone who played", () => {
  it("takes the best-ranked candidate with a tagged photo", async () => {
    const [a, b, , d] = ids;
    const pick = await pickDraftPhoto(tenantId, {
      playerId: null,
      grade: GRADE,
      junior: false,
      kind: "matchSummary",
      candidatePlayerIds: [d, b, a],
    });
    expect(pick).toEqual({ url: urlOf("b1"), source: "auto:library-player" });
  });

  it("falls back to a headshot, then to no photo at all", async () => {
    const [, , c, d] = ids;
    const opts = { playerId: null, grade: GRADE, junior: false, kind: "matchSummary" };
    expect(await pickDraftPhoto(tenantId, { ...opts, candidatePlayerIds: [d, c] })).toEqual({
      url: `/headshot-${STAMP}-c`,
      source: "auto:headshot",
    });
    expect(await pickDraftPhoto(tenantId, { ...opts, candidatePlayerIds: [d, 90001] })).toBeNull();
  });

  it("ignores a retired player rule but keeps a fixed one", async () => {
    const [a] = ids;
    const opts = {
      playerId: null,
      grade: GRADE,
      junior: false,
      kind: "matchSummary",
      candidatePlayerIds: [a],
    };
    await db
      .insert(cardPhotoRulesTable)
      .values({ tenantId, grade: GRADE, cardKind: "matchSummary", mode: "random" });
    expect((await pickDraftPhoto(tenantId, opts))?.url).toBe(urlOf("a1"));
    await db
      .update(cardPhotoRulesTable)
      .set({
        mode: "fixed",
        photoId: (
          await db
            .select()
            .from(clubPhotosTable)
            .where(eq(clubPhotosTable.objectPath, pathOf("grade-team")))
        )[0].id,
      })
      .where(eq(cardPhotoRulesTable.tenantId, tenantId));
    expect(await pickDraftPhoto(tenantId, opts)).toEqual({
      url: urlOf("grade-team"),
      source: "auto:rule-fixed",
    });
    await db.delete(cardPhotoRulesTable).where(eq(cardPhotoRulesTable.tenantId, tenantId));
  });
});

describe("match day shows the grade's team", () => {
  it("prefers team, then celebrating photos, of that grade only", async () => {
    const opts = { playerId: null, junior: false, kind: "matchDay" };
    expect(await pickDraftPhoto(tenantId, { ...opts, grade: GRADE })).toEqual({
      url: urlOf("grade-team"),
      source: "auto:library-grade",
    });
    expect(await pickDraftPhoto(tenantId, { ...opts, grade: `Empty ${STAMP}` })).toBeNull();
  });
});

describe("team lists rotate", () => {
  it("prefers the player whose photos were used least recently", async () => {
    const [a, b] = ids;
    await usedOnTeamList(urlOf("b1"), `teamlist:used-b-${STAMP}`);
    expect((await rotate([a, b], `teamlist:r1-${STAMP}`))?.url).toBe(urlOf("a1"));
    await usedOnTeamList(urlOf("a1"), `teamlist:used-a1-${STAMP}`);
    await usedOnTeamList(urlOf("a2"), `teamlist:used-a2-${STAMP}`);
    expect((await rotate([a, b], `teamlist:r2-${STAMP}`))?.url).toBe(urlOf("b1"));
  });

  it("uses a player's least-used photo, and still picks an over-used one", async () => {
    const [a] = ids;
    await usedOnTeamList(urlOf("a1"), `teamlist:used-a1-again-${STAMP}`);
    // a1 is used twice now, a2 once: a2.
    expect((await rotate([a], `teamlist:r3-${STAMP}`))?.url).toBe(urlOf("a2"));
  });

  it("keeps the draft's current automatic photo on a refresh", async () => {
    const [a, b] = ids;
    const key = `teamlist:sticky-${STAMP}`;
    await db.insert(socialDraftsTable).values({
      tenantId,
      engine: "teamlist",
      status: "awaiting_review",
      cardInput: { kind: "teamList", grade: GRADE },
      appPath: "/fixtures",
      sourceKey: key,
      photoUrl: urlOf("a1"),
      photoSource: "auto:library-player",
    });
    expect((await rotate([a, b], key))?.url).toBe(urlOf("a1"));
    // Once that player leaves the side, the photo moves on.
    expect((await rotate([b], key))?.url).toBe(urlOf("b1"));
  });
});
