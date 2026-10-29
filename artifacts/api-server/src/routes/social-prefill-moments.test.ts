/**
 * Create a Card's century / five-for prefill (Ash, 28 Oct 2026):
 * `GET /social-prefill/moments` lists the recent performances the achievements
 * engine drafted, newest first, with the card input it drafted. Senior only,
 * this club's only, nothing older than the window. Real-DB test (needs
 * DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { adminsTable, db, socialDraftsTable, tenantsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { MOMENT_PREFILL_DAYS } from "./social-prefill";

const STAMP = Date.now();
const tenants: number[] = [];
const admins: number[] = [];
const cookies: string[] = [];

const century = {
  kind: "century",
  playerName: "Zachary Dreckow",
  grade: "A Grade",
  runs: 104,
  balls: 98,
  notOut: true,
  opponent: "Mandurah",
  round: 4,
  photoUrl: null,
  match: { homeTeam: "Halls Head" },
};
const fiveFor = {
  kind: "fiveFor",
  playerName: "Sam Keeper",
  grade: "B Grade",
  wickets: 5,
  runsConceded: 24,
  overs: "9.2",
  figures: "5/24",
  opponent: "Rockingham",
  round: 3,
  photoUrl: null,
};

const draft = (tenantId: number, cardInput: object, extra: Record<string, unknown> = {}) => ({
  tenantId,
  engine: "milestone",
  status: "awaiting_review",
  cardInput,
  appPath: "",
  ...extra,
});

const get = (i: number) =>
  request(app)
    .get("/api/social-prefill/moments")
    .set("Cookie", cookies[i]!)
    .set("x-tenant-id", String(tenants[i]));

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-moments";
  for (const [i, name] of ["Moments Club", "Other Moments Club"].entries()) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `moments-${i}-${STAMP}`,
        centralClubId: 6_000_000 + (STAMP % 100_000) * 2 + i,
        name,
        plan: "pro",
      })
      .returning();
    tenants.push(t!.id);
    const [a] = await db
      .insert(adminsTable)
      .values({
        tenantId: t!.id,
        username: `moments${i}_${STAMP}`,
        displayName: name,
        passwordHash: "x",
      })
      .returning();
    admins.push(a!.id);
    cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: a!.id, issuedAt: Date.now() })}`);
  }
  const [mine, theirs] = tenants as [number, number];
  const old = new Date(Date.now() - (MOMENT_PREFILL_DAYS + 5) * 86_400_000);
  await db.insert(socialDraftsTable).values([
    draft(mine, century, {
      appPath: "/players/4301",
      createdAt: new Date(Date.now() - 2 * 86_400_000),
    }),
    // Dismissed still lists: the admin is making the card by hand.
    draft(mine, fiveFor, { status: "dismissed", subjectPlayerId: 4302 }),
    // Not listed: a junior's, another kind, too old, another club's.
    draft(mine, { ...century, playerName: "Junior Kid" }, { sourceMatchIsJunior: true }),
    draft(mine, { ...fiveFor, playerName: "Junior Flag", junior: true }),
    draft(mine, { kind: "milestone", playerName: "Career Man" }),
    draft(mine, { ...century, playerName: "Old Timer" }, { createdAt: old }),
    draft(theirs, { ...century, playerName: "Their Player" }),
    // A fill-in is never the card's player.
    draft(
      mine,
      { ...century, playerName: "Fill In" },
      {
        appPath: "/players/90001",
        createdAt: new Date(Date.now() - 3 * 86_400_000),
      },
    ),
  ]);
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(adminsTable).where(inArray(adminsTable.id, admins));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

describe("GET /social-prefill/moments", () => {
  it("lists this club's recent senior 100s and five-fors, newest first, with the engine's card", async () => {
    const res = await get(0);
    expect(res.status).toBe(200);
    const names = res.body.map((m: { playerName: string }) => m.playerName);
    expect(names).toEqual(["Sam Keeper", "Zachary Dreckow", "Fill In"]);
    const [five, hundred, fillIn] = res.body;
    expect(five).toMatchObject({
      kind: "fiveFor",
      playerId: 4302,
      grade: "B Grade",
      round: 3,
      opponent: "Rockingham",
    });
    expect(five.input).toMatchObject({ figures: "5/24", overs: "9.2" });
    expect(hundred).toMatchObject({ kind: "century", playerId: 4301 });
    expect(hundred.input).toMatchObject({ runs: 104, balls: 98, notOut: true });
    expect(hundred.input.match).toEqual({ homeTeam: "Halls Head" });
    expect(fillIn.playerId).toBeNull();
  });

  it("never shows another club's moments", async () => {
    const res = await get(1);
    expect(res.status).toBe(200);
    expect(res.body.map((m: { playerName: string }) => m.playerName)).toEqual(["Their Player"]);
  });

  it("is for the club's admins only", async () => {
    const res = await request(app)
      .get("/api/social-prefill/moments")
      .set("x-tenant-id", String(tenants[0]));
    expect([401, 403]).toContain(res.status);
  });
});
