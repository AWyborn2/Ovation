/**
 * ADR-010 P4: automatic carousel photos. `pickPhoto` takes the least recently
 * posted photo of a slide's pool; junior slides only ever get the club's junior
 * stock images (never a junior player's photo, a junior grade's photo or a card
 * photo rule); nothing that fits means null (the brand background); and one
 * club's photos and posting history never reach another club's picks. Posting a
 * draft records its photos in `photo_usage`.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  cardPhotoRulesTable,
  juniorParticipantsTable,
  juniorPhotosTable,
  photoUsageTable,
  socialDraftsTable,
  type ClubPhotoRow,
} from "@workspace/db";
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "@workspace/scorecard/card-content";
import app from "../../app";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { objectUrl } from "../photo-store";
import {
  buildMatchDayPhotos,
  createPhotoPicker,
  loadCarouselPhotos,
  pickPhoto,
  recordPhotoUsage,
} from "./photos";

const STAMP = Date.now();
const DAY = 24 * 60 * 60 * 1000;
let club: number;
let other: number;
let empty: number;
let adminId: number;
let cookie: string;
const ph: Record<string, ClubPhotoRow> = {};

const base = (tenantId: number, key: string) => ({
  tenantId,
  objectPath: `/objects/p4-${key}-${STAMP}`,
  thumbPath: `/objects/p4-${key}-thumb-${STAMP}`,
  width: 100,
  height: 100,
});

async function photo(
  key: string,
  tenantId: number,
  over: Partial<typeof clubPhotosTable.$inferInsert>,
): Promise<ClubPhotoRow> {
  const [row] = await db
    .insert(clubPhotosTable)
    .values({ ...base(tenantId, key), ...over })
    .returning();
  ph[key] = row;
  return row;
}

const used = (tenantId: number, photoId: number, daysAgo: number) =>
  db
    .insert(photoUsageTable)
    .values({ tenantId, photoId, usedAt: new Date(Date.now() - daysAgo * DAY) });

async function tenant(n: number) {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `p4-photos-${n}-${STAMP}`,
      centralClubId: 9970 + n,
      name: "Photo Club",
      plan: "pro",
    })
    .returning();
  return t.id;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-p4-photos";
  club = await tenant(1);
  other = await tenant(2);
  empty = await tenant(3);
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId: club, username: `p4_${STAMP}`, displayName: "P4", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

  // Senior A Grade action photos, oldest first.
  const at = (d: number) => new Date(Date.UTC(2026, 0, d));
  await photo("a1", club, { grade: "A Grade", photoTypes: ["batting"], takenAt: at(1) });
  await photo("a2", club, { grade: "A Grade", photoTypes: ["bowling"], takenAt: at(2) });
  await photo("a3", club, { grade: "A Grade", photoTypes: ["fielding"], takenAt: at(3) });
  // Not for a fixture slide: a team shot, and a photo tagged with a fill-in.
  await photo("aTeam", club, { grade: "A Grade", photoTypes: ["team"], takenAt: at(9) });
  await photo("aFillIn", club, { grade: "A Grade", photoTypes: ["batting"], takenAt: at(9) });
  await db
    .insert(clubPhotoPlayersTable)
    .values({ tenantId: club, photoId: ph.aFillIn.id, playerId: 90001 });
  // B Grade, with a fixed Match Day rule on the older photo.
  await photo("b1", club, { grade: "B Grade", photoTypes: ["batting"], takenAt: at(1) });
  await photo("b2", club, { grade: "B Grade", photoTypes: ["batting"], takenAt: at(2) });
  // Club-wide Season 2026 cover photos, and the club's junior stock artwork.
  await photo("c1", club, {
    grade: null,
    season: 2026,
    photoTypes: ["celebrating"],
    takenAt: at(5),
  });
  await photo("c2", club, { grade: null, season: 2026, photoTypes: ["team"], takenAt: at(1) });
  await photo("s1", club, { grade: null, juniorStock: true, takenAt: at(1) });
  await photo("s2", club, { grade: null, juniorStock: true, takenAt: at(2) });
  // A junior grade's own photo, newest of all: never on any card.
  await photo("u13", club, { grade: "Under 13 Blue", photoTypes: ["batting"], takenAt: at(20) });
  await db.insert(cardPhotoRulesTable).values([
    { tenantId: club, grade: "B Grade", cardKind: "matchDay", mode: "fixed", photoId: ph.b1.id },
    // A rule on a junior grade is ignored: junior cards never take a rule's photo.
    {
      tenantId: club,
      grade: "Under 13 Blue",
      cardKind: "matchDay",
      mode: "fixed",
      photoId: ph.u13.id,
    },
  ]);
  // Junior players' own photos: one allowed, one withheld. Carousels never use either.
  await db.insert(juniorParticipantsTable).values([
    { tenantId: club, participantId: `p4-allowed-${STAMP}`, displayName: "Allowed Junior" },
    {
      tenantId: club,
      participantId: `p4-withheld-${STAMP}`,
      displayName: "Withheld Junior",
      photoWithheld: true,
    },
  ]);
  await db.insert(juniorPhotosTable).values([
    {
      tenantId: club,
      participantId: `p4-allowed-${STAMP}`,
      objectPath: "/objects/j1",
      isDefault: true,
    },
    {
      tenantId: club,
      participantId: `p4-withheld-${STAMP}`,
      objectPath: "/objects/j2",
      isDefault: true,
    },
  ]);

  // The other club: its own A Grade photo, and heavy recent use of its photos.
  await photo("o1", other, { grade: "A Grade", photoTypes: ["batting"], takenAt: at(1) });
  await photo("oCover", other, {
    grade: null,
    season: 2026,
    photoTypes: ["team"],
    takenAt: at(30),
  });

  // Our club posted a1 three days ago and a2 yesterday; a3 never.
  await used(club, ph.a1.id, 3);
  await used(club, ph.a2.id, 1);
  // A stray row under the other club against OUR photo must not count for us.
  await used(other, ph.a3.id, 0);
});

afterAll(async () => {
  for (const id of [club, other, empty].filter(Boolean)) {
    await db.delete(photoUsageTable).where(eq(photoUsageTable.tenantId, id));
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, id));
    await db.delete(cardPhotoRulesTable).where(eq(cardPhotoRulesTable.tenantId, id));
    await db.delete(clubPhotoPlayersTable).where(eq(clubPhotoPlayersTable.tenantId, id));
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, id));
    await db.delete(juniorPhotosTable).where(eq(juniorPhotosTable.tenantId, id));
    await db.delete(juniorParticipantsTable).where(eq(juniorParticipantsTable.tenantId, id));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
});

const senior = (grade: string) => ({ kind: "fixture" as const, grade, junior: false });

describe("pickPhoto: least recently used", () => {
  it("takes a never-posted photo first, then the one posted longest ago", async () => {
    expect((await pickPhoto(club, senior("A Grade")))?.photoId).toBe(ph.a3.id);
    const picker = await createPhotoPicker(club, ["A Grade"]);
    // One build spreads its slides across the pool before repeating a photo.
    const picks = [1, 2, 3, 4].map(() => picker.pick(senior("A Grade"))?.photoId);
    expect(picks).toEqual([ph.a3.id, ph.a1.id, ph.a2.id, ph.a3.id]);
  });

  it("only offers a grade's batting, bowling or fielding photos, never one tagged with a fill-in", async () => {
    const { photos } = await loadCarouselPhotos(club, ["A Grade", "B Grade", "Under 13 Blue"]);
    expect(photos.map((p) => p.id).sort()).toEqual(
      [ph.a1.id, ph.a2.id, ph.a3.id, ph.b1.id, ph.b2.id].sort(),
    );
  });

  it("honours a fixed Match Day photo rule for a senior grade", async () => {
    // b2 is newer and never used either, but the club fixed b1 for B Grade.
    expect((await pickPhoto(club, senior("B Grade")))?.photoId).toBe(ph.b1.id);
  });

  it("returns the pick's URL, and null when nothing fits (the brand background)", async () => {
    expect(await pickPhoto(club, senior("A Grade"))).toEqual({
      photoId: ph.a3.id,
      url: objectUrl(ph.a3.objectPath),
    });
    expect(await pickPhoto(club, senior("C Grade"))).toBeNull();
    expect(await pickPhoto(empty, senior("A Grade"))).toBeNull();
    expect(await pickPhoto(empty, { kind: "cover", junior: false })).toBeNull();
    expect(await pickPhoto(empty, { kind: "cover", junior: true })).toBeNull();
  });

  it("covers a senior set with a Club-wide photo, team shots first", async () => {
    // c1 is newer, but both are unused and c2 is a team photo.
    expect((await pickPhoto(club, { kind: "cover", junior: false }))?.photoId).toBe(ph.c2.id);
    await used(club, ph.c2.id, 2);
    try {
      expect((await pickPhoto(club, { kind: "cover", junior: false }))?.photoId).toBe(ph.c1.id);
    } finally {
      await db
        .delete(photoUsageTable)
        .where(and(eq(photoUsageTable.tenantId, club), eq(photoUsageTable.photoId, ph.c2.id)));
    }
  });
});

describe("pickPhoto: junior photo rules", () => {
  const juniorPicks = async () => [
    (await pickPhoto(club, { kind: "fixture", grade: "Under 13 Blue", junior: true }))?.photoId,
    // A junior-looking grade is junior even when the flag says otherwise (fail closed).
    (await pickPhoto(club, { kind: "fixture", grade: "Under 13 Blue", junior: false }))?.photoId,
    // A junior fixture in a senior-named grade still only gets stock.
    (await pickPhoto(club, { kind: "fixture", grade: "A Grade", junior: true }))?.photoId,
    (await pickPhoto(club, { kind: "cover", junior: true }))?.photoId,
  ];

  it("gives junior slides and a junior set's cover the club's stock images only", async () => {
    const stock = [ph.s1.id, ph.s2.id];
    for (const id of await juniorPicks()) expect(stock).toContain(id);
  });

  it("never uses a junior player's photo (allowed or withheld), a junior grade's photo or its rule", async () => {
    const juniorPhotoIds = (
      await db
        .select({ id: juniorPhotosTable.id })
        .from(juniorPhotosTable)
        .where(eq(juniorPhotosTable.tenantId, club))
    ).map((r) => r.id);
    const picks = await juniorPicks();
    expect(picks).not.toContain(ph.u13.id);
    // Junior photo ids live in another table; a pick is always a library stock image.
    for (const id of picks) expect([ph.s1.id, ph.s2.id]).toContain(id);
    expect(juniorPhotoIds).toHaveLength(2);
    const { photos, coverPhotos } = await loadCarouselPhotos(club, ["Under 13 Blue"]);
    expect(photos).toEqual([]);
    expect(coverPhotos.map((p) => p.id)).not.toContain(ph.u13.id);
  });

  it("with no stock images a junior slide has no photo, never a senior one", async () => {
    await db
      .update(clubPhotosTable)
      .set({ juniorStock: false, grade: "Archive" })
      .where(inArray(clubPhotosTable.id, [ph.s1.id, ph.s2.id]));
    try {
      for (const id of await juniorPicks()) expect(id).toBeUndefined();
    } finally {
      await db
        .update(clubPhotosTable)
        .set({ juniorStock: true, grade: null })
        .where(inArray(clubPhotosTable.id, [ph.s1.id, ph.s2.id]));
    }
  });
});

describe("buildMatchDayPhotos", () => {
  const fixture = (id: number, grade: string) =>
    matchDayFixtureContent({
      id,
      grade,
      roundLabel: "1",
      opponentName: "Visitors",
      opponentLogoUrl: null,
      venue: "Oval",
      startAt: new Date("2026-10-10T02:00:00Z"),
      isHome: true,
    });

  it("picks the cover and each fixture, keyed by fixture id", async () => {
    const junior = matchDayFixtureContent(
      {
        id: 3,
        grade: "Under 13 Blue",
        roundLabel: "1",
        opponentName: "Visitors",
        opponentLogoUrl: null,
        venue: "Oval",
        startAt: new Date("2026-10-10T02:00:00Z"),
        isHome: true,
      },
      { junior: true },
    );
    const picks = await buildMatchDayPhotos(club, [
      fixture(1, "A Grade"),
      fixture(2, "A Grade"),
      junior,
    ]);
    expect(picks).toEqual({
      cover: ph.c2.id,
      // Two unused stock images: the newer one (s2) first.
      fixtures: { "1": ph.a3.id, "2": ph.a1.id, "3": ph.s2.id },
    });
  });

  it("covers an all-junior set with stock only", async () => {
    const juniorOnly = matchDayFixtureContent(
      {
        id: 4,
        grade: "Under 13 Blue",
        roundLabel: "1",
        opponentName: "Visitors",
        opponentLogoUrl: null,
        venue: "Oval",
        startAt: new Date("2026-10-10T02:00:00Z"),
        isHome: true,
      },
      { junior: true },
    );
    const picks = await buildMatchDayPhotos(club, [juniorOnly]);
    expect([ph.s1.id, ph.s2.id]).toContain(picks.cover);
  });
});

describe("tenant isolation", () => {
  it("one club's photos and posting history never reach another club's picks", async () => {
    // The other club's stray usage row against a3 does not make a3 "recent" for us.
    expect((await pickPhoto(club, senior("A Grade")))?.photoId).toBe(ph.a3.id);
    expect((await pickPhoto(other, senior("A Grade")))?.photoId).toBe(ph.o1.id);
    expect((await pickPhoto(other, { kind: "cover", junior: false }))?.photoId).toBe(ph.oCover.id);
    const ours = await loadCarouselPhotos(club, ["A Grade"]);
    const ids = [...ours.photos, ...ours.coverPhotos, ...ours.juniorStockPhotos].map((p) => p.id);
    expect(ids).not.toContain(ph.o1.id);
    expect(ids).not.toContain(ph.oCover.id);
  });

  it("a draft never records another club's photo", async () => {
    const [draft] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: other,
        engine: "ondemand",
        status: "ready",
        cardInput: { kind: "matchDay" },
        // Our club's photo, on the other club's draft.
        photoUrl: objectUrl(ph.a1.objectPath),
      })
      .returning();
    expect(await recordPhotoUsage(draft)).toBe(0);
  });
});

describe("photo usage is written when a draft is posted", () => {
  it("a carousel records each slide photo once, however often it is posted", async () => {
    const opts = {
      heading: "Round 1",
      from: "2026-10-09",
      to: "2026-10-11",
      roundLabels: ["1"],
      fixtureCount: 1,
    };
    const fields = [...presetFields("matchDay", "standard")];
    const slide = (id: string, content: unknown, photoId: number | null, url: string | null) => ({
      id,
      label: id,
      content,
      visibleFields: fields,
      photoId,
      data: url ? { photoUrl: url } : {},
      junior: false,
      sponsorsOn: false,
      warnings: [],
    });
    const [draft] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: club,
        engine: "ondemand",
        status: "ready",
        cardInput: {
          kind: "matchDay",
          weekendCarousel: {
            version: 2,
            packId: "club-kit-v1",
            setType: "matchDay",
            submissionId: randomUUID(),
            size: "square",
            slides: [
              slide("title", matchDayTitleContent(opts), ph.c1.id, objectUrl(ph.c1.objectPath)),
              slide(
                "fixture-1",
                matchDayFixtureContent({
                  id: 1,
                  grade: "B Grade",
                  roundLabel: "1",
                  opponentName: "Visitors",
                  opponentLogoUrl: null,
                  venue: "Oval",
                  startAt: new Date("2026-10-10T02:00:00Z"),
                  isHome: true,
                }),
                ph.b2.id,
                objectUrl(ph.b2.objectPath),
              ),
              slide("sponsors", matchDaySponsorsContent({ ...opts, sponsors: [] }), null, null),
            ],
          },
        },
      })
      .returning();
    const post = () =>
      request(app)
        .post(`/api/social-drafts/${draft.id}/posted`)
        .set("x-tenant-id", String(club))
        .set("Cookie", cookie);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    const rows = await db
      .select()
      .from(photoUsageTable)
      .where(and(eq(photoUsageTable.tenantId, club), eq(photoUsageTable.draftId, draft.id)));
    expect(rows.map((r) => r.photoId).sort()).toEqual([ph.c1.id, ph.b2.id].sort());
    // c1 is now the most recently used cover, so the next cover is c2.
    expect((await pickPhoto(club, { kind: "cover", junior: false }))?.photoId).toBe(ph.c2.id);
  });

  it("a single card records its library photo; a photo outside the library is skipped", async () => {
    const [card] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: club,
        engine: "ondemand",
        status: "ready",
        cardInput: { kind: "matchDay" },
        photoUrl: objectUrl(ph.a3.objectPath),
      })
      .returning();
    expect(await recordPhotoUsage(card)).toBe(1);
    expect(await recordPhotoUsage(card)).toBe(0);
    // a3 was never used before; now a1 (three days ago) is the least recent.
    expect((await pickPhoto(club, senior("A Grade")))?.photoId).toBe(ph.a1.id);
    const [headshot] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: club,
        engine: "ondemand",
        status: "ready",
        cardInput: { kind: "matchDay" },
        photoUrl: "https://example.test/headshot.jpg",
      })
      .returning();
    expect(await recordPhotoUsage(headshot)).toBe(0);
  });
});
