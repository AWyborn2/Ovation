/**
 * Card photo rules: per (grade, card type) the club picks a fixed photo, a
 * random grade photo, or the card's featured player. Covers the admin routes
 * (CRUD, validation, tenant isolation), the pick itself (a rule beats the
 * automatic order, random is stable per draft, match results feature the top
 * scorer, juniors never get a photo) and re-picking open drafts when a rule
 * changes. Real-DB integration test (needs DATABASE_URL).
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
  importsTable,
  matchesTable,
  matchPlayerLinesTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  cardPhotoRulesTable,
  socialDraftsTable,
  socialSettingsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { enrichDraft, pickDraftPhoto } from "../lib/draft-enrich";
import { generateMatchSummaryDrafts } from "../lib/match-summary-drafter";
import { objectUrl } from "../lib/photo-store";

const STAMP = Date.now();
const GRADE = `Rules Grade ${STAMP}`;

let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;
const playerIds: number[] = [];
let importId: number;
let matchId: number;

/** Library photo ids by name. */
const photos: Record<string, number> = {};
let otherTenantPhotoId: number;

async function libraryPhoto(
  name: string,
  opts: { tenant?: number; grade?: string | null; playerId?: number; takenAt?: string } = {},
): Promise<number> {
  const tid = opts.tenant ?? tenantId;
  const [photo] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId: tid,
      objectPath: `/objects/library/rules-${STAMP}-${name}`,
      thumbPath: `/objects/library/rules-${STAMP}-${name}-thumb`,
      width: 100,
      height: 100,
      grade: opts.grade === undefined ? GRADE : opts.grade,
      takenAt: opts.takenAt ? new Date(opts.takenAt) : null,
    })
    .returning();
  if (opts.playerId != null) {
    await db
      .insert(clubPhotoPlayersTable)
      .values({ tenantId: tid, photoId: photo.id, playerId: opts.playerId });
  }
  return photo.id;
}

const urlOf = (name: string) => objectUrl(`/objects/library/rules-${STAMP}-${name}`);

const api = (method: "get" | "put" | "delete", path: string, as: "own" | "other" = "own") => {
  const agent = request(app);
  const url = `/api${path}`;
  const req =
    method === "get" ? agent.get(url) : method === "put" ? agent.put(url) : agent.delete(url);
  return req
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));
};

async function draft(over: Partial<typeof socialDraftsTable.$inferInsert> = {}) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "teamlist",
      status: "awaiting_review",
      cardInput: { kind: "teamList", grade: GRADE },
      appPath: "/fixtures",
      ...over,
    })
    .returning();
  return row;
}

const reload = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-card-photo-rules";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `rules-${STAMP}`, centralClubId: 9971, name: "Rules Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `rules-o-${STAMP}`, centralClubId: 9972, name: "Other", plan: "pro" })
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
        username: `rules_${key}_${STAMP}`,
        displayName: "Rules Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    const c = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    if (tid === tenantId) cookie = c;
    else otherCookie = c;
  }
  await db.insert(socialSettingsTable).values({
    tenantId,
    engineMatchSummary: true,
    matchSummaryGradeConfig: {},
  });

  const players = await db
    .insert(playersTable)
    .values([
      { surname: `Opener${STAMP}`, givenName: "Ada" },
      { surname: `Anchor${STAMP}`, givenName: "Bo" },
    ])
    .returning();
  playerIds.push(...players.map((p) => p.id));
  const [opener, anchor] = playerIds;

  // Six untagged grade photos for the random pick, one tagged photo per
  // player, and the photo a fixed rule will name.
  for (let i = 0; i < 6; i++) {
    photos[`team${i}`] = await libraryPhoto(`team${i}`, { takenAt: `2025-01-0${i + 1}` });
  }
  photos.opener = await libraryPhoto("opener", { playerId: opener, takenAt: "2025-02-01" });
  photos.anchor = await libraryPhoto("anchor", { playerId: anchor, takenAt: "2025-02-02" });
  photos.fixed = await libraryPhoto("fixed", { grade: null });
  photos.junior = await libraryPhoto("junior", { grade: "Under 15" });
  otherTenantPhotoId = await libraryPhoto("elsewhere", { tenant: otherTenantId });

  // A native match: the anchor top-scores (55 to 30).
  const [imp] = await db
    .insert(importsTable)
    .values({ filename: `rules-${STAMP}.xlsx`, kind: "match", grade: GRADE, season: 2025 })
    .returning();
  importId = imp.id;
  const [m] = await db
    .insert(matchesTable)
    .values({ importId, grade: GRADE, season: 2025, round: 4, opponent: "Rivals" })
    .returning();
  matchId = m.id;
  await db.insert(matchPlayerLinesTable).values([
    { matchId, playerId: opener, batted: true, battingPos: 1, runs: 30, bowled: true, wickets: 4 },
    { matchId, playerId: anchor, batted: true, battingPos: 2, runs: 55 },
  ]);
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(cardPhotoRulesTable).where(inArray(cardPhotoRulesTable.tenantId, tenants));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenants));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenants));
  if (matchId) await db.delete(matchesTable).where(eq(matchesTable.id, matchId));
  if (importId) await db.delete(importsTable).where(eq(importsTable.id, importId));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

describe("rule routes", () => {
  it("saves one rule per card type, upserts, lists and deletes, all tenant-scoped", async () => {
    expect((await api("get", "/card-photo-rules")).body).toEqual([]);

    const saved = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["weekendWrap", "ladder"],
      mode: "random",
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toHaveLength(2);
    expect(saved.body.map((r: { cardKind: string }) => r.cardKind).sort()).toEqual([
      "ladder",
      "weekendWrap",
    ]);

    // Saving the same (grade, kind) again replaces the rule rather than adding one.
    const replaced = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["ladder"],
      mode: "fixed",
      photoId: photos.fixed,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body[0]).toMatchObject({
      grade: GRADE,
      cardKind: "ladder",
      mode: "fixed",
      photoId: photos.fixed,
      photoThumbUrl: objectUrl(`/objects/library/rules-${STAMP}-fixed-thumb`),
    });
    const listed = await api("get", "/card-photo-rules");
    expect(listed.body).toHaveLength(2);

    // Another club sees none of them and can't delete them.
    expect((await api("get", "/card-photo-rules", "other")).body).toEqual([]);
    const ladder = listed.body.find((r: { cardKind: string }) => r.cardKind === "ladder");
    expect((await api("delete", `/card-photo-rules/${ladder.id}`, "other")).status).toBe(404);

    for (const r of listed.body) {
      expect((await api("delete", `/card-photo-rules/${r.id}`)).status).toBe(204);
    }
    expect((await api("get", "/card-photo-rules")).body).toEqual([]);
  });

  it("rejects a fixed rule without a photo, another club's photo, and junior photos", async () => {
    const noPhoto = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["ladder"],
      mode: "fixed",
    });
    expect(noPhoto.status).toBe(400);

    const foreign = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["ladder"],
      mode: "fixed",
      photoId: otherTenantPhotoId,
    });
    expect(foreign.status).toBe(404);

    const juniorPhoto = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["ladder"],
      mode: "fixed",
      photoId: photos.junior,
    });
    expect(juniorPhoto.status).toBe(422);

    const juniorGrade = await api("put", "/card-photo-rules").send({
      grade: "Under 15",
      cardKinds: ["matchSummary"],
      mode: "random",
    });
    expect(juniorGrade.status).toBe(422);

    expect((await api("get", "/card-photo-rules")).body).toEqual([]);
  });

  it("needs an admin", async () => {
    const res = await request(app)
      .get("/api/card-photo-rules")
      .set("x-tenant-id", String(tenantId));
    expect(res.status).toBe(401);
  });
});

describe("the pick", () => {
  afterAll(async () => {
    await db.delete(cardPhotoRulesTable).where(eq(cardPhotoRulesTable.tenantId, tenantId));
  });

  it("a fixed rule beats a photo tagged with the card's player", async () => {
    // No rule: the player's own tagged photo.
    expect(
      await pickDraftPhoto(tenantId, {
        playerId: playerIds[0],
        grade: GRADE,
        junior: false,
        kind: "century",
      }),
    ).toEqual({ url: urlOf("opener"), source: "auto:library-player" });

    await db.insert(cardPhotoRulesTable).values({
      tenantId,
      grade: GRADE,
      cardKind: "century",
      mode: "fixed",
      photoId: photos.fixed,
    });
    expect(
      await pickDraftPhoto(tenantId, {
        playerId: playerIds[0],
        grade: GRADE,
        junior: false,
        kind: "century",
      }),
    ).toEqual({ url: urlOf("fixed"), source: "auto:rule-fixed" });
  });

  it("a random rule is stable for a draft and varies across drafts", async () => {
    await db.insert(cardPhotoRulesTable).values({
      tenantId,
      grade: GRADE,
      cardKind: "gradeLeader",
      mode: "random",
    });
    const pick = (seed: string) =>
      pickDraftPhoto(tenantId, {
        playerId: null,
        grade: GRADE,
        junior: false,
        kind: "gradeLeader",
        seed,
      });
    const picked = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const first = await pick(`roundup:2025:${GRADE}:${i}`);
      const again = await pick(`roundup:2025:${GRADE}:${i}`);
      expect(first?.source).toBe("auto:rule-random");
      expect(again).toEqual(first);
      picked.add(first!.url);
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it("a junior card gets no photo, even with a rule", async () => {
    await db.insert(cardPhotoRulesTable).values({
      tenantId,
      grade: GRADE,
      cardKind: "matchSummary",
      mode: "fixed",
      photoId: photos.fixed,
    });
    expect(
      await pickDraftPhoto(tenantId, {
        playerId: null,
        grade: GRADE,
        junior: true,
        kind: "matchSummary",
      }),
    ).toBeNull();
    const e = await enrichDraft({
      tenantId,
      engine: "matchSummary",
      cardInput: { kind: "matchSummary", junior: true, matchTitle: `${GRADE} • Round 1` },
      appPath: "/juniors/matches/1",
      grade: GRADE,
    });
    expect(e.photoUrl).toBeNull();
    expect(e.photoSource).toBeNull();
  });
});

describe("match results feature the top scorer", () => {
  afterAll(async () => {
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
    await db.delete(cardPhotoRulesTable).where(eq(cardPhotoRulesTable.tenantId, tenantId));
  });

  it("drafts with the top scorer's photo, and re-picks an older draft when the rule arrives", async () => {
    // No rule yet: the automatic order gives a match result a grade photo.
    const first = await generateMatchSummaryDrafts(tenantId, [matchId]);
    expect(first.errors).toEqual([]);
    const [before] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, tenantId));
    expect(before.photoSource).toBe("auto:library-grade");

    // Saving a player rule re-picks the open draft: the anchor made 55.
    const saved = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["matchSummary"],
      mode: "player",
    });
    expect(saved.status).toBe(200);
    const after = await reload(before.id);
    expect(after.photoUrl).toBe(urlOf("anchor"));
    expect(after.photoSource).toBe("auto:rule-player");

    // A fresh draft of the same match picks the same way.
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.id, before.id));
    await generateMatchSummaryDrafts(tenantId, [matchId]);
    const [fresh] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, tenantId));
    expect(fresh.photoUrl).toBe(urlOf("anchor"));
    expect(fresh.photoSource).toBe("auto:rule-player");
  });
});

describe("changing a rule re-picks open auto drafts only", () => {
  it("replaces automatic picks, keeps manual and cleared photos, and skips other kinds", async () => {
    const auto = await draft({
      photoUrl: urlOf("team0"),
      photoSource: "auto:library-grade",
      sourceKey: `rules:${STAMP}:auto`,
    });
    const empty = await draft({ sourceKey: `rules:${STAMP}:empty` });
    const manual = await draft({ photoUrl: "/api/storage/objects/mine", photoSource: "manual" });
    const cleared = await draft({ photoSource: "none" });
    const posted = await draft({
      status: "posted",
      photoUrl: urlOf("team0"),
      photoSource: "auto:library-grade",
    });
    const otherKind = await draft({
      cardInput: { kind: "matchDay", grade: GRADE },
      photoUrl: urlOf("team0"),
      photoSource: "auto:library-grade",
    });
    const junior = await draft({
      sourceMatchIsJunior: true,
      photoSource: null,
    });

    const saved = await api("put", "/card-photo-rules").send({
      grade: GRADE,
      cardKinds: ["teamList"],
      mode: "fixed",
      photoId: photos.fixed,
    });
    expect(saved.status).toBe(200);

    for (const d of [auto, empty]) {
      const row = await reload(d.id);
      expect(row.photoUrl).toBe(urlOf("fixed"));
      expect(row.photoSource).toBe("auto:rule-fixed");
    }
    expect(await reload(manual.id)).toMatchObject({
      photoUrl: "/api/storage/objects/mine",
      photoSource: "manual",
    });
    expect(await reload(cleared.id)).toMatchObject({ photoUrl: null, photoSource: "none" });
    for (const d of [posted, otherKind]) {
      expect((await reload(d.id)).photoUrl).toBe(urlOf("team0"));
    }
    expect((await reload(junior.id)).photoUrl).toBeNull();

    // Removing the rule sends the drafts back to the automatic order.
    const rule = saved.body[0];
    expect((await api("delete", `/card-photo-rules/${rule.id}`)).status).toBe(204);
    const back = await reload(auto.id);
    expect(back.photoSource).toBe("auto:library-grade");
    expect((await reload(manual.id)).photoSource).toBe("manual");
  });
});
