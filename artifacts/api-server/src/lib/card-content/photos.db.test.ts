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
  clubUploadsTable,
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
  isJuniorDesignDraft,
  juniorSafeCarousel,
  juniorSafeDesign,
  stripUnapprovedJuniorSetPhotos,
  withoutPhotos,
} from "../junior-stock-photos";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
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

describe("a junior set's cover and sponsors page (ADR-007, fails closed)", () => {
  const opts = {
    heading: "Juniors this week",
    from: "2026-10-09",
    to: "2026-10-11",
    roundLabels: ["1"],
    fixtureCount: 1,
  };
  const fields = [...presetFields("matchDay", "standard")];
  const slide = (id: string, content: unknown, photo: ClubPhotoRow | null, junior = false) => ({
    id,
    label: id,
    content,
    visibleFields: fields,
    photoId: photo?.id ?? null,
    data: photo ? { photoUrl: objectUrl(photo.objectPath) } : {},
    junior,
    sponsorsOn: false,
    warnings: [],
  });
  const game = (grade: string, junior: boolean) =>
    slide(
      `fixture-${grade}`,
      matchDayFixtureContent(
        {
          id: junior ? 2 : 1,
          grade,
          roundLabel: "1",
          opponentName: "Visitors",
          opponentLogoUrl: null,
          venue: "Oval",
          startAt: new Date("2026-10-10T02:00:00Z"),
          isHome: true,
        },
        { junior },
      ),
      null,
      junior,
    );
  const input = (cover: ClubPhotoRow, background: ClubPhotoRow | null, junior = true) => ({
    kind: "matchDay",
    weekendCarousel: {
      version: 2,
      packId: "club-kit-v1",
      setType: "matchDay",
      submissionId: randomUUID(),
      size: "square",
      slides: [
        slide("title", matchDayTitleContent(opts), cover),
        junior ? game("Year 4 Gold", true) : game("A Grade", false),
        slide("sponsors", matchDaySponsorsContent({ ...opts, sponsors: [] }), background),
      ],
    },
  });
  const slides = (cardInput: Record<string, unknown>) =>
    (cardInput.weekendCarousel as { slides: Array<{ id: string; data: object; photoId: unknown }> })
      .slides;

  it("removes a club-wide library photo from a junior set's cover and sponsors page", async () => {
    const cardInput = input(ph.c1, ph.c2);
    const carousel = readQueuedCarousel(cardInput)!;
    expect(await stripUnapprovedJuniorSetPhotos(club, cardInput, carousel)).toBe(2);
    const [cover, , sponsors] = slides(cardInput);
    expect(cover).toMatchObject({ data: {}, photoId: null });
    expect(sponsors).toMatchObject({ data: {}, photoId: null });
  });

  it("keeps the club's approved junior stock image on a junior set's cover", async () => {
    const cardInput = input(ph.s1, null);
    const carousel = readQueuedCarousel(cardInput)!;
    expect(await stripUnapprovedJuniorSetPhotos(club, cardInput, carousel)).toBe(0);
    expect(slides(cardInput)[0]).toMatchObject({
      data: { photoUrl: objectUrl(ph.s1.objectPath) },
      photoId: ph.s1.id,
    });
  });

  it("refuses a stock image's id with another photo's URL, and another club's stock", async () => {
    const forged = input(ph.s1, null);
    (slides(forged)[0]!.data as { photoUrl: string }).photoUrl = objectUrl(ph.c1.objectPath);
    expect(await stripUnapprovedJuniorSetPhotos(club, forged, readQueuedCarousel(forged)!)).toBe(1);
    const elsewhere = input(ph.s1, null);
    expect(
      await stripUnapprovedJuniorSetPhotos(other, elsewhere, readQueuedCarousel(elsewhere)!),
    ).toBe(1);
  });

  it("leaves a senior set's cover alone", async () => {
    const cardInput = input(ph.c1, null, false);
    expect(
      await stripUnapprovedJuniorSetPhotos(club, cardInput, readQueuedCarousel(cardInput)!),
    ).toBe(0);
  });

  it("posts an existing junior set without the photo, leaving the saved draft as it was", async () => {
    const cardInput = input(ph.c1, null);
    const safe = await juniorSafeCarousel(club, cardInput, readQueuedCarousel(cardInput)!);
    expect(safe.slides[0]!.data.photoUrl).toBeUndefined();
    expect(slides(cardInput)[0]!.data).toEqual({ photoUrl: objectUrl(ph.c1.objectPath) });
  });

  it("is applied when Create or the Weekend Carousel saves a junior set", async () => {
    const res = await request(app)
      .post("/api/social-drafts")
      .set("x-tenant-id", String(club))
      .set("Cookie", cookie)
      .send({ caption: "Juniors this week", cardInput: input(ph.c1, null) });
    expect(res.status).toBe(201);
    expect(res.body.cardInput.weekendCarousel.slides[0]).toMatchObject({
      data: {},
      photoId: null,
    });
  });
});

describe("photos inside a junior card's or set's design (fails closed)", () => {
  const url = (row: ClubPhotoRow) => objectUrl(row.objectPath);
  const upload = "/api/storage/objects/uploads/club-logo";
  const image = (id: string, content: string) => ({ id, kind: "image", content });
  const design = (...layers: unknown[]) => ({
    formatVersion: 2,
    pages: { title: { layers: [{ id: "p", kind: "photo" }, ...layers] } },
  });
  const junior = { sourceMatchIsJunior: true, cardInput: { kind: "matchDay", junior: true } };
  const ids = (d: unknown) =>
    (d as { pages: { title: { layers: Array<{ id: string }> } } }).pages.title.layers.map(
      (l) => l.id,
    );

  it("withoutPhotos drops an image layer or field naming a bad photo, nothing else", () => {
    const { value, removed } = withoutPhotos(
      { layers: [image("a", "bad"), image("b", "ok")], images: { photo: "bad", logo: "ok" } },
      (u) => u === "bad",
    );
    expect(removed).toBe(2);
    expect(value).toEqual({ layers: [image("b", "ok")], images: { logo: "ok" } });
  });

  it("removes a club library photo from a junior card, keeping junior stock and uploads", async () => {
    const safe = await juniorSafeDesign(
      club,
      junior,
      design(image("lib", url(ph.c1)), image("stock", url(ph.s1)), image("logo", upload)),
    );
    expect(safe.removed).toBe(1);
    expect(ids(safe.design)).toEqual(["p", "stock", "logo"]);
  });

  it("removes an uploaded image from a junior design, keeping a vector upload (retest 3, #8)", async () => {
    const path = `/objects/uploads/jr-upload-${STAMP}`;
    const [row] = await db
      .insert(clubUploadsTable)
      .values({
        tenantId: club,
        name: "Team photo",
        kind: "image",
        objectPath: path,
        width: 800,
        height: 600,
      })
      .returning();
    try {
      const vector = { id: "crest", kind: "vector", svg: "<svg viewBox='0 0 1 1'/>" };
      const uploaded = image("upload", `/api/storage${path}`);
      const safe = await juniorSafeDesign(club, junior, design(uploaded, vector));
      expect(safe.removed).toBe(1);
      expect(ids(safe.design)).toEqual(["p", "crest"]);
      // A senior design keeps it.
      const senior = { sourceMatchIsJunior: false, cardInput: { kind: "matchDay" } };
      expect((await juniorSafeDesign(club, senior, design(uploaded))).removed).toBe(0);
    } finally {
      await db.delete(clubUploadsTable).where(eq(clubUploadsTable.id, row!.id));
    }
  });

  it("removes a graded, tagged or another club's photo, and a thumbnail, from a junior set", async () => {
    const opts = {
      heading: "Juniors this week",
      from: "2026-10-09",
      to: "2026-10-11",
      roundLabels: ["1"],
      fixtureCount: 1,
    };
    const visibleFields = [...presetFields("matchDay", "standard")];
    const slide = (id: string, content: unknown, junior: boolean) => ({
      id,
      label: id,
      content,
      visibleFields,
      photoId: null,
      data: {},
      junior,
      sponsorsOn: false,
      warnings: [],
    });
    const fixture = matchDayFixtureContent(
      {
        id: 2,
        grade: "Year 4 Gold",
        roundLabel: "1",
        opponentName: "Visitors",
        opponentLogoUrl: null,
        venue: "Oval",
        startAt: new Date("2026-10-10T02:00:00Z"),
        isHome: true,
      },
      { junior: true },
    );
    const carousel = {
      kind: "matchDay",
      weekendCarousel: {
        version: 2,
        packId: "club-kit-v1",
        setType: "matchDay",
        submissionId: randomUUID(),
        size: "square",
        slides: [
          slide("title", matchDayTitleContent(opts), false),
          slide("fixture-u9", fixture, true),
          slide("sponsors", matchDaySponsorsContent({ ...opts, sponsors: [] }), false),
        ],
      },
    };
    const set = { sourceMatchIsJunior: false, cardInput: carousel };
    expect(isJuniorDesignDraft(set)).toBe(true);
    const safe = await juniorSafeDesign(
      club,
      set,
      design(
        image("graded", url(ph.u13)),
        image("other", url(ph.oCover)),
        image("thumb", objectUrl(ph.c2.thumbPath)),
        image("stock", url(ph.s2)),
      ),
    );
    expect(ids(safe.design)).toEqual(["p", "stock"]);
    // Another club's approved stock isn't this club's.
    const elsewhere = await juniorSafeDesign(other, set, design(image("stock", url(ph.s1))));
    expect(ids(elsewhere.design)).toEqual(["p"]);
  });

  it("keeps a junior player's photo only when it is the card's own cleared photo", async () => {
    const child = design(image("child", objectUrl("/objects/j1")));
    expect(ids((await juniorSafeDesign(club, junior, child)).design)).toEqual(["p"]);
    const cleared = {
      sourceMatchIsJunior: true,
      cardInput: { kind: "teamList", junior: true, juniorPhotoAllowed: true },
      photoUrl: objectUrl("/objects/j1"),
    };
    expect(ids((await juniorSafeDesign(club, cleared, child)).design)).toEqual(["p", "child"]);
  });

  it("leaves a senior design alone", async () => {
    const senior = { sourceMatchIsJunior: false, cardInput: { kind: "matchDay" } };
    const d = design(image("lib", url(ph.c1)));
    expect(await juniorSafeDesign(club, senior, d)).toEqual({ design: d, removed: 0 });
  });

  it("is applied when a junior draft's design is saved, and refuses a library card photo", async () => {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: club,
        engine: "adhoc",
        status: "awaiting_review",
        cardInput: { kind: "matchDay", junior: true },
        sourceMatchIsJunior: true,
      })
      .returning();
    const patch = (body: object) =>
      request(app)
        .patch(`/api/social-drafts/${row!.id}`)
        .set("x-tenant-id", String(club))
        .set("Cookie", cookie)
        .send(body);
    const photo = await patch({ photoUrl: url(ph.c1) });
    expect(photo.status).toBe(400);
    const saved = await patch({
      adjustments: design(image("lib", url(ph.c1)), image("stock", url(ph.s1))),
    });
    expect(saved.status).toBe(200);
    expect(ids(saved.body.adjustments)).toEqual(["p", "stock"]);
    // Clearing the photo is always allowed.
    expect((await patch({ photoUrl: null })).status).toBe(200);
  });
});
