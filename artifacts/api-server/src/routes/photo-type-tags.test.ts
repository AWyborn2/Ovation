/**
 * Photo type tags: club photos carry type tags (batting, bowling, team, …) and
 * each card type prefers certain tags when its photo is picked automatically,
 * falling back to the old order when nothing matches. Covers the pick (player
 * step, grade step, random rules narrowed by a rule's photo type), bulk
 * tagging and the type filter, validation, tenant isolation, and re-picking
 * open auto drafts when a photo's types change. Real-DB integration test
 * (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  cardPhotoRulesTable,
  socialDraftsTable,
} from "@workspace/db";
import { preferredPhotoTypes } from "@workspace/scorecard";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { enrichDraft, fillMissingDraftPhotos, pickDraftPhoto } from "../lib/draft-enrich";
import { objectUrl } from "../lib/photo-store";

const STAMP = Date.now();
const GRADE = `Types Grade ${STAMP}`;
/** A grade whose photos carry no type tags (the old order). */
const PLAIN = `Plain Grade ${STAMP}`;
/** A grade for the random-rule pool. */
const POOL = `Pool Grade ${STAMP}`;

let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;
const playerIds: number[] = [];

/** Library photo ids by name. */
const photos: Record<string, number> = {};

async function libraryPhoto(
  name: string,
  opts: {
    tenant?: number;
    grade?: string | null;
    playerId?: number;
    takenAt: string;
    types?: string[];
  },
): Promise<number> {
  const tid = opts.tenant ?? tenantId;
  const [photo] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId: tid,
      objectPath: `/objects/library/types-${STAMP}-${name}`,
      thumbPath: `/objects/library/types-${STAMP}-${name}-thumb`,
      width: 100,
      height: 100,
      grade: opts.grade === undefined ? GRADE : opts.grade,
      takenAt: new Date(opts.takenAt),
      photoTypes: opts.types ?? [],
    })
    .returning();
  if (opts.playerId != null) {
    await db
      .insert(clubPhotoPlayersTable)
      .values({ tenantId: tid, photoId: photo.id, playerId: opts.playerId });
  }
  photos[name] = photo.id;
  return photo.id;
}

const urlOf = (name: string) => objectUrl(`/objects/library/types-${STAMP}-${name}`);

const api = (method: "get" | "post" | "put", path: string, as: "own" | "other" = "own") => {
  const agent = request(app);
  const url = `/api${path}`;
  const req =
    method === "get" ? agent.get(url) : method === "put" ? agent.put(url) : agent.post(url);
  return req
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));
};

const reload = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-photo-types";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `types-${STAMP}`, centralClubId: 9981, name: "Types Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `types-o-${STAMP}`, centralClubId: 9982, name: "Other", plan: "pro" })
    .returning();
  otherTenantId = o.id;
  for (const [tid, key] of [
    [tenantId, "a"],
    [otherTenantId, "b"],
  ] as const) {
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tid,
        username: `types_${key}_${STAMP}`,
        displayName: "Types Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    const c = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    if (tid === tenantId) cookie = c;
    else otherCookie = c;
  }

  const players = await db
    .insert(playersTable)
    .values([
      { surname: `Batter${STAMP}`, givenName: "Ada" },
      { surname: `Bowler${STAMP}`, givenName: "Bo" },
      { surname: `Plain${STAMP}`, givenName: "Cy" },
    ])
    .returning();
  playerIds.push(...players.map((p) => p.id));
  const [batter, bowler, plain] = playerIds;

  // The batter: an older batting milestone photo, a newer untagged one.
  await libraryPhoto("batter-milestone", {
    playerId: batter,
    takenAt: "2025-01-01",
    types: ["batting_milestone"],
  });
  await libraryPhoto("batter-newest", { playerId: batter, takenAt: "2025-03-01" });

  // The bowler: an older bowling photo, a newer batting one and a newer untagged one.
  await libraryPhoto("bowler-bowling", {
    playerId: bowler,
    takenAt: "2025-01-01",
    types: ["bowling"],
  });
  await libraryPhoto("bowler-batting", {
    playerId: bowler,
    takenAt: "2025-02-01",
    types: ["batting"],
  });
  await libraryPhoto("bowler-newest", { playerId: bowler, takenAt: "2025-03-01" });

  // A player with no typed photos.
  await libraryPhoto("plain-old", { playerId: plain, grade: PLAIN, takenAt: "2025-01-01" });
  await libraryPhoto("plain-new", { playerId: plain, grade: PLAIN, takenAt: "2025-02-01" });

  // GRADE photos: an older team-tagged shot vs a newer untyped team shot.
  await libraryPhoto("grade-team", { takenAt: "2024-06-01", types: ["team", "celebrating"] });
  await libraryPhoto("grade-newest", { takenAt: "2024-12-01" });

  // PLAIN grade: an untagged team shot, and a newer player action photo.
  await libraryPhoto("plain-team", { grade: PLAIN, takenAt: "2024-06-01" });

  // POOL grade: three bowling photos among six.
  for (let i = 0; i < 6; i++) {
    await libraryPhoto(`pool${i}`, {
      grade: POOL,
      takenAt: `2025-01-0${i + 1}`,
      types: i % 2 === 0 ? ["bowling"] : [],
    });
  }

  await libraryPhoto("elsewhere", {
    tenant: otherTenantId,
    takenAt: "2025-01-01",
    types: ["team"],
  });
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(cardPhotoRulesTable).where(inArray(cardPhotoRulesTable.tenantId, tenants));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenants));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

describe("card types steer the automatic pick", () => {
  it("a century prefers the player's batting milestone photo over a newer untagged one", async () => {
    const e = await enrichDraft({
      tenantId,
      engine: "ondemand",
      cardInput: { kind: "century", grade: GRADE, playerName: "Ada" },
      appPath: `/players/${playerIds[0]}`,
    });
    expect(e.photoUrl).toBe(urlOf("batter-milestone"));
    expect(e.photoSource).toBe("auto:library-player");
  });

  it("a five-for prefers bowling, skipping newer batting and untagged photos", async () => {
    const e = await enrichDraft({
      tenantId,
      engine: "ondemand",
      cardInput: { kind: "fiveFor", grade: GRADE, playerName: "Bo" },
      appPath: `/players/${playerIds[1]}`,
    });
    expect(e.photoUrl).toBe(urlOf("bowler-bowling"));
  });

  it("a runs milestone prefers batting and a wickets milestone bowling", async () => {
    const pick = (milestoneLabel: string) =>
      pickDraftPhoto(tenantId, {
        playerId: playerIds[1],
        grade: null,
        junior: false,
        kind: "milestone",
        photoTypes: preferredPhotoTypes({ kind: "milestone", milestoneLabel }),
      });
    expect((await pick("Runs"))?.url).toBe(urlOf("bowler-batting"));
    expect((await pick("Wickets"))?.url).toBe(urlOf("bowler-bowling"));
    // Games prefer celebrating/team photos; the bowler has none, so the newest.
    expect((await pick("Games"))?.url).toBe(urlOf("bowler-newest"));
  });

  it("a match summary prefers a team-tagged grade photo over a newer untagged one", async () => {
    const e = await enrichDraft({
      tenantId,
      engine: "matchSummary",
      cardInput: { kind: "matchSummary", matchTitle: `${GRADE} • Round 1` },
      appPath: "/matches/1",
    });
    expect(e.photoUrl).toBe(urlOf("grade-team"));
    expect(e.photoSource).toBe("auto:library-grade");
  });

  it("with no tagged photo it falls back to the old order", async () => {
    // The player's newest photo.
    const century = await enrichDraft({
      tenantId,
      engine: "ondemand",
      cardInput: { kind: "century", grade: PLAIN, playerName: "Cy" },
      appPath: `/players/${playerIds[2]}`,
    });
    expect(century.photoUrl).toBe(urlOf("plain-new"));
    // A team shot (no player tags) over a newer photo of a player.
    const summary = await enrichDraft({
      tenantId,
      engine: "matchSummary",
      cardInput: { kind: "matchSummary", matchTitle: `${PLAIN} • Round 2` },
      appPath: "/matches/2",
    });
    expect(summary.photoUrl).toBe(urlOf("plain-team"));
  });

  it("filling drafts that never got a photo uses the same preference", async () => {
    const [d] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "milestone",
        status: "awaiting_review",
        cardInput: { kind: "century", grade: GRADE, playerName: "Ada" },
        appPath: `/players/${playerIds[0]}`,
      })
      .returning();
    expect(await fillMissingDraftPhotos(tenantId)).toBeGreaterThanOrEqual(1);
    expect((await reload(d.id)).photoUrl).toBe(urlOf("batter-milestone"));
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.id, d.id));
  });

  it("a junior card still gets no photo", async () => {
    const e = await enrichDraft({
      tenantId,
      engine: "ondemand",
      cardInput: { kind: "century", grade: GRADE, playerName: "Ada", junior: true },
      appPath: `/players/${playerIds[0]}`,
    });
    expect(e.photoUrl).toBeNull();
  });
});

describe("a rule's photo type", () => {
  afterAll(async () => {
    await db.delete(cardPhotoRulesTable).where(eq(cardPhotoRulesTable.tenantId, tenantId));
  });

  it("saves and lists the type, and a fixed rule has none", async () => {
    const saved = await api("put", "/card-photo-rules").send({
      grade: POOL,
      cardKinds: ["ladder"],
      mode: "random",
      photoType: "bowling",
    });
    expect(saved.status).toBe(200);
    expect(saved.body[0]).toMatchObject({
      cardKind: "ladder",
      mode: "random",
      photoType: "bowling",
    });

    const fixed = await api("put", "/card-photo-rules").send({
      grade: POOL,
      cardKinds: ["countdown"],
      mode: "fixed",
      photoId: photos.pool0,
      photoType: "team",
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body[0].photoType).toBeNull();

    const listed = await api("get", "/card-photo-rules");
    const ladder = listed.body.find((r: { cardKind: string }) => r.cardKind === "ladder");
    expect(ladder.photoType).toBe("bowling");
  });

  it("narrows a random rule's pool and stays stable per draft", async () => {
    const bowling = new Set([urlOf("pool0"), urlOf("pool2"), urlOf("pool4")]);
    const pick = (seed: string) =>
      pickDraftPhoto(tenantId, {
        playerId: null,
        grade: POOL,
        junior: false,
        kind: "ladder",
        seed,
        photoTypes: preferredPhotoTypes({ kind: "ladder" }),
      });
    const picked = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const first = await pick(`ladder:${POOL}:${i}`);
      expect(first?.source).toBe("auto:rule-random");
      expect(await pick(`ladder:${POOL}:${i}`)).toEqual(first);
      expect(bowling.has(first!.url)).toBe(true);
      picked.add(first!.url);
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it("falls back to the whole grade pool when no photo has the type", async () => {
    await api("put", "/card-photo-rules").send({
      grade: POOL,
      cardKinds: ["weekendWrap"],
      mode: "random",
      photoType: "fielding",
    });
    const picked = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const p = await pickDraftPhoto(tenantId, {
        playerId: null,
        grade: POOL,
        junior: false,
        kind: "weekendWrap",
        seed: `wrap:${i}`,
      });
      picked.add(p!.url);
    }
    // Untyped photos are in the pool too.
    expect([...picked].some((u) => !u.match(/pool[024]$/))).toBe(true);
  });

  it("rejects an unknown photo type", async () => {
    const res = await api("put", "/card-photo-rules").send({
      grade: POOL,
      cardKinds: ["ladder"],
      mode: "random",
      photoType: "selfie",
    });
    expect(res.status).toBe(400);
  });
});

describe("bulk type tagging", () => {
  it("sets and removes a type on several photos, and the list filters by type", async () => {
    const ids = [photos.pool1, photos.pool3];
    const added = await api("post", "/club-photos/tags").send({
      photoIds: ids,
      addTypes: ["fielding"],
    });
    expect(added.status).toBe(200);
    for (const p of added.body) expect(p.photoTypes).toEqual(["fielding"]);

    const filtered = await api("get", "/club-photos?type=fielding");
    expect(filtered.status).toBe(200);
    expect(filtered.body.map((p: { id: number }) => p.id).sort()).toEqual([...ids].sort());

    // One type per photo: adding another replaces it.
    const replaced = await api("post", "/club-photos/tags").send({
      photoIds: ids,
      addTypes: ["celebrating"],
    });
    expect(replaced.status).toBe(200);
    for (const p of replaced.body) expect(p.photoTypes).toEqual(["celebrating"]);
    expect((await api("get", "/club-photos?type=fielding")).body).toEqual([]);

    const cleared = await api("post", "/club-photos/tags").send({
      photoIds: ids,
      removeTypes: ["celebrating"],
    });
    for (const p of cleared.body) expect(p.photoTypes).toEqual([]);
  });

  it("rejects adding more than one type at once", async () => {
    const res = await api("post", "/club-photos/tags").send({
      photoIds: [photos.pool1],
      addTypes: ["fielding", "team"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown types with 400", async () => {
    const tag = await api("post", "/club-photos/tags").send({
      photoIds: [photos.pool1],
      addTypes: ["selfie"],
    });
    expect(tag.status).toBe(400);
    expect((await api("get", "/club-photos?type=selfie")).status).toBe(400);
    const both = await api("post", "/club-photos/tags").send({
      photoIds: [photos.pool1],
      addTypes: ["team"],
      removeTypes: ["team"],
    });
    expect(both.status).toBe(400);
  });

  it("keeps each club to its own photos", async () => {
    const foreign = await api("post", "/club-photos/tags", "other").send({
      photoIds: [photos.pool1],
      addTypes: ["team"],
    });
    expect(foreign.status).toBe(404);
    const theirs = await api("get", "/club-photos?type=team", "other");
    expect(theirs.body.map((p: { id: number }) => p.id)).toEqual([photos.elsewhere]);
    const ours = await api("get", "/club-photos?type=team");
    expect(ours.body.map((p: { id: number }) => p.id)).not.toContain(photos.elsewhere);
  });

  it("re-picks open auto drafts when types change, never a manual photo", async () => {
    const [auto] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "milestone",
        status: "awaiting_review",
        cardInput: { kind: "fiveFor", grade: PLAIN, playerName: "Cy" },
        appPath: `/players/${playerIds[2]}`,
        photoUrl: urlOf("plain-new"),
        photoSource: "auto:library-player",
      })
      .returning();
    const [manual] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "milestone",
        status: "awaiting_review",
        cardInput: { kind: "fiveFor", grade: PLAIN, playerName: "Cy" },
        appPath: `/players/${playerIds[2]}`,
        photoUrl: "/api/storage/objects/mine",
        photoSource: "manual",
      })
      .returning();

    const res = await api("post", "/club-photos/tags").send({
      photoIds: [photos["plain-old"]],
      addTypes: ["bowling_milestone"],
    });
    expect(res.status).toBe(200);
    expect(await reload(auto.id)).toMatchObject({
      photoUrl: urlOf("plain-old"),
      photoSource: "auto:library-player",
    });
    expect(await reload(manual.id)).toMatchObject({
      photoUrl: "/api/storage/objects/mine",
      photoSource: "manual",
    });

    // Untagging sends the auto draft back to the newest photo.
    await api("post", "/club-photos/tags").send({
      photoIds: [photos["plain-old"]],
      removeTypes: ["bowling_milestone"],
    });
    expect((await reload(auto.id)).photoUrl).toBe(urlOf("plain-new"));
  });
});
