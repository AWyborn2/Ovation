import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  hatTricksTable,
  honourDisplaySettingsTable,
  milestoneBoardSettingsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Hat-tricks (honours kiosk redesign C2): the curated list's CRUD is
 * tenant-scoped and admin-only, and the honours display shows it as an
 * achievement list. Real-DB integration test; skipped without a database.
 */

const STAMP = Date.now();

type HatTrick = {
  id: number;
  bowler: string;
  grade: string;
  season: string | null;
  figures: string | null;
  opponent: string | null;
};

describe.skipIf(!process.env.DATABASE_URL)("hat-tricks", () => {
  const tenantIds: number[] = [];
  const adminIds: number[] = [];
  const cookies = new Map<number, string>();

  async function tenant(label: string, n: number): Promise<number> {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `ht-${label}-${STAMP}`,
        name: `ht-${label}-${STAMP}`,
        // Unique, and no central club: these tenants have no stats boards.
        centralClubId: 900_000 + (STAMP % 50_000) * 2 + n,
        readsFromCentral: true,
        plan: "club",
      })
      .returning();
    tenantIds.push(t!.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t!.id,
        username: `ht_${label}_${STAMP}`,
        displayName: "HT Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin!.id);
    cookies.set(
      t!.id,
      `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`,
    );
    return t!.id;
  }

  const as = (tenantId: number, admin = true) => {
    const agent = request(app);
    const wrap = (r: request.Test) => {
      r.set("x-tenant-id", String(tenantId));
      if (admin) r.set("Cookie", cookies.get(tenantId)!);
      return r;
    };
    return {
      get: (p: string) => wrap(agent.get(p)),
      post: (p: string) => wrap(agent.post(p)),
      patch: (p: string) => wrap(agent.patch(p)),
      delete: (p: string) => wrap(agent.delete(p)),
    };
  };

  let clubA: number;
  let clubB: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-hat-tricks";
    clubA = await tenant("a", 0);
    clubB = await tenant("b", 1);
  });

  afterAll(async () => {
    if (adminIds.length) await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    for (const id of tenantIds) {
      await db.delete(hatTricksTable).where(eq(hatTricksTable.tenantId, id));
      await db
        .delete(honourDisplaySettingsTable)
        .where(eq(honourDisplaySettingsTable.tenantId, id));
      await db
        .delete(milestoneBoardSettingsTable)
        .where(eq(milestoneBoardSettingsTable.tenantId, id));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
    }
  });

  it("adds, lists, edits and deletes a club's hat-tricks", async () => {
    const created = await as(clubA)
      .post("/api/hat-tricks")
      .send({
        bowler: "  Sam Spinner ",
        grade: "A Grade",
        season: "2019/20",
        figures: "5/23",
        opponent: " ",
      })
      .expect(201);
    const row = created.body as HatTrick;
    expect(row).toMatchObject({
      bowler: "Sam Spinner",
      grade: "A Grade",
      season: "2019/20",
      figures: "5/23",
      opponent: null,
    });
    expect(row).not.toHaveProperty("tenantId");

    await as(clubA)
      .post("/api/hat-tricks")
      .send({ bowler: "Pat Pace", grade: "B Grade", season: "2023/24" })
      .expect(201);

    const list = (await as(clubA, false).get("/api/hat-tricks").expect(200)).body as HatTrick[];
    // Newest season first.
    expect(list.map((r) => r.bowler)).toEqual(["Pat Pace", "Sam Spinner"]);

    const edited = await as(clubA)
      .patch(`/api/hat-tricks/${row.id}`)
      .send({ opponent: "Mandurah" })
      .expect(200);
    expect((edited.body as HatTrick).opponent).toBe("Mandurah");

    await as(clubA).delete(`/api/hat-tricks/${row.id}`).expect(204);
    const after = (await as(clubA).get("/api/hat-tricks").expect(200)).body as HatTrick[];
    expect(after.map((r) => r.bowler)).toEqual(["Pat Pace"]);
  });

  it("keeps each club's list to itself", async () => {
    const [mine] = (await as(clubA).get("/api/hat-tricks").expect(200)).body as HatTrick[];
    expect(((await as(clubB).get("/api/hat-tricks").expect(200)).body as HatTrick[]).length).toBe(
      0,
    );
    // Another club's admin can't edit or delete it.
    await as(clubB).patch(`/api/hat-tricks/${mine!.id}`).send({ bowler: "X" }).expect(404);
    await as(clubB).delete(`/api/hat-tricks/${mine!.id}`).expect(404);
  });

  it("needs an admin and a bowler and grade", async () => {
    await as(clubA, false).post("/api/hat-tricks").send({ bowler: "A", grade: "A" }).expect(401);
    await as(clubA).post("/api/hat-tricks").send({ bowler: "", grade: "A Grade" }).expect(400);
    await as(clubA).post("/api/hat-tricks").send({ bowler: "A" }).expect(400);
  });

  it("shows on the club's honours display as an achievement list", async () => {
    const bundle = (await as(clubA).get("/api/honour-display").expect(200)).body as {
      boards: Array<{
        id: string;
        layout: string;
        tallyLabel?: string | null;
        entries: Array<{ primaryText: string; meta?: { grade?: string | null } }>;
      }>;
    };
    const board = bundle.boards.find((b) => b.id === "hat_tricks");
    expect(board).toMatchObject({ layout: "achievements", tallyLabel: "1 hat-trick" });
    expect(board!.entries.map((e) => [e.primaryText, e.meta?.grade])).toEqual([
      ["Pat Pace", "B Grade"],
    ]);

    const other = (await as(clubB).get("/api/honour-display").expect(200)).body as {
      boards: Array<{ id: string }>;
    };
    expect(other.boards.find((b) => b.id === "hat_tricks")).toBeUndefined();
  });
});
