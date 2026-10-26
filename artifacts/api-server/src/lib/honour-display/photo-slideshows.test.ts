/**
 * Kiosk photo slideshows (honours kiosk redesign D1/D3): the server picks each
 * slideshow's photos from the tenant's own libraries. Covers tenant isolation,
 * the source filters, junior stock and cut-outs staying out, and the junior
 * consent rule (fail closed: untagged, withheld or private means not shown).
 * Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  db,
  tenantsTable,
  clubPhotosTable,
  juniorParticipantsTable,
  juniorPhotoParticipantsTable,
  juniorPhotosTable,
  type KioskPhotoSlideshowJson,
} from "@workspace/db";
import { purgeTestTenants } from "../tenant-purge.test-helpers";
import { currentSeasonStartYear, resolveSlideshows, slideshowCaption } from "./photo-slideshows";

const STAMP = Date.now();
const NOW = new Date("2026-10-26T00:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const AVA = randomUUID().toLowerCase();
const BEN = randomUUID().toLowerCase();

let tenantId: number;
let otherTenantId: number;
const junior: Record<string, number> = {};
const senior: Record<string, number> = {};

const show = (over: Partial<KioskPhotoSlideshowJson> = {}): KioskPhotoSlideshowJson => ({
  id: "s1",
  name: "Clubroom",
  library: "senior",
  source: "all",
  order: "newest",
  perPass: 10,
  secondsPerPhoto: 6,
  captions: true,
  ...over,
});

const urls = async (s: KioskPhotoSlideshowJson, tenant = tenantId) =>
  (await resolveSlideshows(tenant, [s], NOW))[0]!.photos.map((p) => p.url);

beforeAll(async () => {
  const tenants = await db
    .insert(tenantsTable)
    .values([
      {
        slug: `kiosk-ss-${STAMP}`,
        centralClubId: 96_600 + (STAMP % 150),
        name: "Slides",
        plan: "pro",
      },
      {
        slug: `kiosk-ss-o-${STAMP}`,
        centralClubId: 96_400 + (STAMP % 150),
        name: "Other",
        plan: "pro",
      },
    ])
    .returning();
  tenantId = tenants[0]!.id;
  otherTenantId = tenants[1]!.id;
  const photo = (name: string, over: Partial<typeof clubPhotosTable.$inferInsert> = {}) => ({
    tenantId,
    objectPath: `/objects/library/${STAMP}-${name}`,
    thumbPath: `/objects/library/${STAMP}-${name}-thumb`,
    width: 1600,
    height: 1067,
    ...over,
  });
  const [team] = await db
    .insert(clubPhotosTable)
    .values(
      photo("team", {
        grade: "A Grade",
        season: 2026,
        photoTypes: ["team"],
        takenAt: ago(3),
      }),
    )
    .returning();
  const rest = await db
    .insert(clubPhotosTable)
    .values([
      photo("old", { grade: "B Grade", season: 2019, takenAt: ago(2000) }),
      photo("stock", { juniorStock: true, takenAt: ago(1) }),
      photo("cutout", { sourcePhotoId: team!.id, takenAt: ago(1) }),
      photo("other-club", { tenantId: otherTenantId, takenAt: ago(1) }),
    ])
    .returning();
  senior.team = team!.id;
  senior.old = rest[0]!.id;
  senior.otherClub = rest[3]!.id;

  await db.insert(juniorParticipantsTable).values([
    { tenantId, participantId: AVA, displayName: "Ava Smith" },
    { tenantId, participantId: BEN, displayName: "Ben Jones", photoWithheld: true },
  ]);
  for (const [name, takenAt] of [
    ["shown", ago(2)],
    ["withheld", ago(2)],
    ["untagged", ago(2)],
  ] as const) {
    const [row] = await db
      .insert(juniorPhotosTable)
      .values({
        tenantId,
        objectPath: `/objects/juniors/${STAMP}-${name}`,
        width: 800,
        height: 600,
        grade: "Under 13",
        season: 2026,
        takenAt,
      })
      .returning();
    junior[name] = row!.id;
  }
  await db.insert(juniorPhotoParticipantsTable).values([
    { tenantId, photoId: junior.shown!, participantId: AVA },
    { tenantId, photoId: junior.withheld!, participantId: AVA },
    { tenantId, photoId: junior.withheld!, participantId: BEN },
  ]);
});

afterAll(async () => {
  await purgeTestTenants([tenantId, otherTenantId]);
});

describe("kiosk photo slideshows", () => {
  it("captions with grade and season only", () => {
    expect(slideshowCaption("A Grade", 2024)).toBe("A Grade · 2024/25");
    expect(slideshowCaption(null, 2024)).toBe("2024/25");
    expect(slideshowCaption(" ", null)).toBeNull();
    expect(currentSeasonStartYear(new Date("2026-03-01T00:00:00Z"))).toBe(2025);
    expect(currentSeasonStartYear(NOW)).toBe(2026);
  });

  it("serves the club's own senior photos, newest first, without stock or cut-outs", async () => {
    const [resolved] = await resolveSlideshows(tenantId, [show()], NOW);
    expect(resolved!.id).toBe("s1");
    expect(resolved!.photos).toEqual([
      {
        url: `/api/storage/objects/library/${STAMP}-team`,
        width: 1600,
        height: 1067,
        caption: "A Grade · 2026/27",
      },
      {
        url: `/api/storage/objects/library/${STAMP}-old`,
        width: 1600,
        height: 1067,
        caption: "B Grade · 2019/20",
      },
    ]);
    expect(await urls(show(), otherTenantId)).toEqual([
      `/api/storage/objects/library/${STAMP}-other-club`,
    ]);
  });

  it("applies the source filter and leaves captions off on request", async () => {
    const team = [`/api/storage/objects/library/${STAMP}-team`];
    expect(await urls(show({ source: "recent", recentDays: 30 }))).toEqual(team);
    expect(await urls(show({ source: "season" }))).toEqual(team);
    expect(await urls(show({ source: "types", types: ["team"] }))).toEqual(team);
    expect(await urls(show({ source: "grades", grades: ["A Grade"] }))).toEqual(team);
    // A tag filter with nothing picked shows nothing rather than everything.
    expect(await urls(show({ source: "types", types: [] }))).toEqual([]);
    const [off] = await resolveSlideshows(tenantId, [show({ captions: false })], NOW);
    expect(off!.photos.every((p) => p.caption === null)).toBe(true);
  });

  it("shows a junior photo only when every tagged child may be shown", async () => {
    expect(await urls(show({ library: "junior" }))).toEqual([
      `/api/juniors/photos/${junior.shown}`,
    ]);
    const both = await urls(show({ library: "both" }));
    expect(both).toContain(`/api/juniors/photos/${junior.shown}`);
    expect(both).not.toContain(`/api/juniors/photos/${junior.withheld}`);
    expect(both).not.toContain(`/api/juniors/photos/${junior.untagged}`);
    expect(await urls(show({ library: "junior" }), otherTenantId)).toEqual([]);
  });

  it("has nothing for an empty library", async () => {
    expect(await resolveSlideshows(tenantId, [], NOW)).toEqual([]);
    expect(await urls(show({ library: "junior", source: "grades", grades: ["Under 9"] }))).toEqual(
      [],
    );
  });

  it("reads library folders: a grade, Club-wide, or one type inside a grade", async () => {
    const lib = (name: string) => `/api/storage/objects/library/${STAMP}-${name}`;
    expect(await urls(show({ source: "folders", folders: [{ grade: "B Grade" }] }))).toEqual([
      lib("old"),
    ]);
    expect(
      await urls(show({ source: "folders", folders: [{ grade: "A Grade", type: "team" }] })),
    ).toEqual([lib("team")]);
    expect(
      await urls(show({ source: "folders", folders: [{ grade: "A Grade", type: "unsorted" }] })),
    ).toEqual([]);
    // B Grade's photo has no type, so it is in B Grade / Unsorted.
    expect(
      await urls(
        show({
          source: "folders",
          folders: [{ grade: "B Grade", type: "unsorted" }, { grade: "club-wide" }],
        }),
      ),
    ).toEqual([lib("old")]);
    expect(await urls(show({ source: "folders", folders: [] }))).toEqual([]);
  });

  it("shows hand-picked photos from both libraries in the picked order", async () => {
    const picked = [
      { library: "senior" as const, id: senior.old! },
      { library: "junior" as const, id: junior.shown! },
      // Withheld, another club's, and a cut-out: never shown, even when picked.
      { library: "junior" as const, id: junior.withheld! },
      { library: "senior" as const, id: senior.otherClub! },
      { library: "senior" as const, id: senior.team! },
    ];
    expect(await urls(show({ source: "picked", picked, order: "manual" }))).toEqual([
      `/api/storage/objects/library/${STAMP}-old`,
      `/api/juniors/photos/${junior.shown}`,
      `/api/storage/objects/library/${STAMP}-team`,
    ]);
    // Newest order sorts the same picks by date; `library` doesn't limit picks.
    expect(
      await urls(show({ source: "picked", picked, order: "newest", library: "senior" })),
    ).toEqual([
      `/api/juniors/photos/${junior.shown}`,
      `/api/storage/objects/library/${STAMP}-team`,
      `/api/storage/objects/library/${STAMP}-old`,
    ]);
    expect(await urls(show({ source: "picked", picked: [] }))).toEqual([]);
  });
});
