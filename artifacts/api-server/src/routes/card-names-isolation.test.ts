import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, teamNameOverridesTable } from "@workspace/db";
import { centralCardClubs } from "@workspace/db/central-queries";
import { cardNameKey } from "@workspace/scorecard/card-names";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

/**
 * Team and competition names on cards (ADR-010 P1) over HTTP: admin-only,
 * validated, and tenant-scoped end to end — a club's short names reach its own
 * settings bundle (what every card preview renders with) and never another
 * club's. Real-DB integration test, like settings-isolation.test.ts.
 */

const STAMP = Date.now();
// Mandurah in the CI central fixture: a real central club both tenants can name.
const MANDURAH = 2;

describe("card names routes", () => {
  let t2: number;
  let t3: number;
  let cookie2: string;
  let cookie3: string;
  let centralClubName: string;

  beforeAll(async () => {
    const [club] = await centralCardClubs([MANDURAH]);
    if (!club?.name) throw new Error("Card names fixture club is missing");
    centralClubName = club.name;
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-card-names";
    const tenants = await db
      .insert(tenantsTable)
      .values([
        { slug: `card-names-t2-${STAMP}`, centralClubId: 97_911, name: "Card Names T2" },
        { slug: `card-names-t3-${STAMP}`, centralClubId: 97_912, name: "Card Names T3" },
      ])
      .returning();
    t2 = tenants[0]!.id;
    t3 = tenants[1]!.id;
    const admins = await db
      .insert(adminsTable)
      .values([
        { tenantId: t2, username: `cn_admin2_${STAMP}`, displayName: "A2", passwordHash: "x" },
        { tenantId: t3, username: `cn_admin3_${STAMP}`, displayName: "A3", passwordHash: "x" },
      ])
      .returning();
    const session = (adminId: number) =>
      `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
    cookie2 = session(admins[0]!.id);
    cookie3 = session(admins[1]!.id);
  });

  afterAll(async () => {
    await purgeTestTenants([t2, t3]);
  });

  const as = (tenant: number, cookie: string | null) => ({
    get: (path: string) => {
      const r = request(app).get(path).set("x-tenant-id", String(tenant));
      return cookie ? r.set("Cookie", cookie) : r;
    },
    put: (path: string, body: object) => {
      const r = request(app).put(path).set("x-tenant-id", String(tenant)).send(body);
      return cookie ? r.set("Cookie", cookie) : r;
    },
  });

  it("is admin-only", async () => {
    await as(t2, null).get("/api/social-settings/card-names").expect(401);
    await as(t2, null)
      .put("/api/social-settings/card-names/teams", { centralClubId: MANDURAH, shortName: "X" })
      .expect(401);
  });

  it("an admin can't write another club's names with its own session", async () => {
    // T3's session presented on T2's host is rejected outright.
    await as(t2, cookie3)
      .put("/api/social-settings/card-names/teams", { centralClubId: MANDURAH, shortName: "X" })
      .expect(401);
    const rows = await db
      .select()
      .from(teamNameOverridesTable)
      .where(eq(teamNameOverridesTable.tenantId, t2));
    expect(rows).toEqual([]);
  });

  it("validates the body", async () => {
    await as(t2, cookie2)
      .put("/api/social-settings/card-names/teams", {
        centralClubId: MANDURAH,
        shortName: "x".repeat(41),
      })
      .expect(400);
    await as(t2, cookie2)
      .put("/api/social-settings/card-names/competitions", { gradeKey: "", label: "Women's A" })
      .expect(400);
  });

  it("a club's names reach its own bundle and listing, never another club's", async () => {
    const saved = await as(t2, cookie2)
      .put("/api/social-settings/card-names/teams", {
        centralClubId: MANDURAH,
        gradeKey: null,
        shortName: "T2 Mandurah",
      })
      .expect(200);
    expect(saved.body.available).toBe(true);
    const row = saved.body.teams.find(
      (t: { centralClubId: number }) => t.centralClubId === MANDURAH,
    );
    expect(row).toMatchObject({ overrideName: "T2 Mandurah", name: "T2 Mandurah" });

    await as(t2, cookie2)
      .put("/api/social-settings/card-names/competitions", {
        gradeKey: "A Grade",
        label: "T2 A",
      })
      .expect(200);

    const key = cardNameKey(centralClubName);
    const bundle2 = await as(t2, null).get("/api/social-settings").expect(200);
    expect(bundle2.body.cardNames.teams[key]).toBe("T2 Mandurah");
    expect(bundle2.body.cardNames.competitions[cardNameKey("A Grade")]).toBe("T2 A");

    const bundle3 = await as(t3, null).get("/api/social-settings").expect(200);
    expect(JSON.stringify(bundle3.body.cardNames ?? {})).not.toContain("T2");
    const bundle1 = await as(1, null).get("/api/social-settings").expect(200);
    expect(JSON.stringify(bundle1.body.cardNames ?? {})).not.toContain("T2");

    const listing3 = await as(t3, cookie3).get("/api/social-settings/card-names").expect(200);
    expect(JSON.stringify(listing3.body)).not.toContain("T2");
  });

  it("a club's crest choice reaches its own cards only, and validates", async () => {
    const UPLOAD = "/api/storage/objects/uploads/t2-mandurah-crest";
    await as(t2, null)
      .put("/api/social-settings/card-names/crests", {
        centralClubId: MANDURAH,
        crestSource: "upload",
        crestUrl: UPLOAD,
      })
      .expect(401);
    await as(t2, cookie2)
      .put("/api/social-settings/card-names/crests", {
        centralClubId: MANDURAH,
        crestSource: "known",
        crestUrl: "https://not-known.test/crest.png",
      })
      .expect(400);
    const saved = await as(t2, cookie2)
      .put("/api/social-settings/card-names/crests", {
        centralClubId: MANDURAH,
        crestSource: "upload",
        crestUrl: UPLOAD,
      })
      .expect(200);
    expect(
      saved.body.teams.find((t: { centralClubId: number }) => t.centralClubId === MANDURAH),
    ).toMatchObject({ crestUrl: UPLOAD, crestSource: "upload" });
    const key = cardNameKey(centralClubName);
    const bundle2 = await as(t2, null).get("/api/social-settings").expect(200);
    expect(bundle2.body.cardNames.crestOverrides[key]).toBe(UPLOAD);
    const bundle3 = await as(t3, null).get("/api/social-settings").expect(200);
    expect(JSON.stringify(bundle3.body.cardNames ?? {})).not.toContain(UPLOAD);

    // Initials badge: an empty choice; reset removes it.
    await as(t2, cookie2)
      .put("/api/social-settings/card-names/crests", {
        centralClubId: MANDURAH,
        crestSource: "initials",
      })
      .expect(200);
    expect(
      (await as(t2, null).get("/api/social-settings").expect(200)).body.cardNames.crestOverrides[
        key
      ],
    ).toBe("");
    await as(t2, cookie2)
      .put("/api/social-settings/card-names/crests", {
        centralClubId: MANDURAH,
        crestSource: null,
      })
      .expect(200);
    expect(
      (await as(t2, null).get("/api/social-settings").expect(200)).body.cardNames?.crestOverrides,
    ).toBeUndefined();
  });

  it("lists the crests Ovation knows, admin-only", async () => {
    await as(t2, null).get("/api/social-settings/card-names/known-crests").expect(401);
    const res = await as(t2, cookie2)
      .get("/api/social-settings/card-names/known-crests")
      .expect(200);
    expect(Array.isArray(res.body.crests)).toBe(true);
  });

  it("clearing a name goes back to the automatic one", async () => {
    const cleared = await as(t2, cookie2)
      .put("/api/social-settings/card-names/teams", { centralClubId: MANDURAH, shortName: null })
      .expect(200);
    expect(
      cleared.body.teams.find((t: { centralClubId: number }) => t.centralClubId === MANDURAH),
    ).toBeUndefined();
    const bundle2 = await as(t2, null).get("/api/social-settings").expect(200);
    expect(bundle2.body.cardNames?.teams?.[cardNameKey(centralClubName)]).toBeUndefined();
  });
});
