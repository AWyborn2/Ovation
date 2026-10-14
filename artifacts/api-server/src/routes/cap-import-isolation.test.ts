import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  capRegisterTable,
  platformAdminsTable,
  tenantsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

/**
 * Cap register CSV import against real Postgres (platform admin console).
 *
 *   - only a platform admin reaches the routes (a club admin is refused);
 *   - a pre-digital player made by the history import is linked by exact name;
 *     an unknown name is still written, unlinked;
 *   - a bad file writes nothing; a missing label is refused;
 *   - a second import into a list that already has caps is refused;
 *   - the batch list shows the batch; another club sees none and can't undo it;
 *   - undo is refused while a later cap exists, then removes exactly the batch.
 *
 * Real-DB integration (CI's API job: DATABASE_URL points at a throwaway
 * Postgres with migrations applied).
 */

const isLocalDb = (() => {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    return ["localhost", "127.0.0.1", "::1", "postgres"].includes(host);
  } catch {
    return false;
  }
})();

const STAMP = Date.now();
const EMAIL = `cap-import+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
const CLUB_A = 9851;
const CLUB_B = 9852;

const CAPS_CSV = [
  "category,cap_number,name,games_a_grade",
  "male,1,Leigh McIntosh,196",
  "male,2,Nobody Known,2",
  "female,1,Matilda Gray,41",
  "",
].join("\r\n");

describe.skipIf(!isLocalDb)("cap register import (platform admin)", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let a: number;
  let b: number;
  let batchId = "";

  const base = (tenantId: number) => `/api/platform/admin/tenants/${tenantId}/cap-import`;
  const historyBase = (tenantId: number) =>
    `/api/platform/admin/tenants/${tenantId}/history-import`;

  const upload = (
    tenantId: number,
    action: "preview" | "commit",
    csv: string,
    fields: Record<string, string> = {},
    cookie = platformCookie,
  ) => {
    let r = request(app)
      .post(`${base(tenantId)}/${action}`)
      .set("Cookie", cookie);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach("file", Buffer.from(csv, "utf8"), "caps.csv");
  };

  const caps = (tenantId: number) =>
    db.select().from(capRegisterTable).where(eq(capRegisterTable.tenantId, tenantId));

  async function makeTenant(label: string, club: number): Promise<number> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `cap-import-${label}-${STAMP}`,
        centralClubId: club,
        name: `Cap Import ${label}`,
        readsFromCentral: true,
      })
      .returning();
    return row.id;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-cap-import";
    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    a = await makeTenant("a", CLUB_A);
    b = await makeTenant("b", CLUB_B);
    const [ca] = await db
      .insert(adminsTable)
      .values({ tenantId: a, username: "owner", displayName: "Club", passwordHash })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;

    // A pre-digital player for exact-name linking: a boundary, then one season row.
    await request(app)
      .put(`${historyBase(a)}/boundaries`)
      .set("Cookie", platformCookie)
      .send({ boundaries: [{ grade: null, startSeason: 2005 }] })
      .expect(200);
    await request(app)
      .post(`${historyBase(a)}/commit`)
      .set("Cookie", platformCookie)
      .field("template", "season")
      .field("label", "early seasons")
      .attach(
        "file",
        Buffer.from("player,grade,season,games,runs\r\nLeigh McIntosh,B Grade,2001/02,15,451\r\n"),
        "history.csv",
      )
      .expect(201);
  });

  afterAll(async () => {
    await purgeTestTenants([a, b]);
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("refuses anyone but a platform admin, including the club's own admin", async () => {
    for (const cookie of [undefined, clubAdminCookie]) {
      const withCookie = (r: request.Test) => (cookie ? r.set("Cookie", cookie) : r);
      await withCookie(request(app).get("/api/platform/admin/cap-import/template")).expect(401);
      await withCookie(request(app).get(`${base(a)}/batches`)).expect(401);
      await withCookie(request(app).delete(`${base(a)}/batches/20261014T023215Z`)).expect(401);
      if (cookie) {
        await upload(a, "preview", CAPS_CSV, {}, cookie).expect(401);
        await upload(a, "commit", CAPS_CSV, { label: "x" }, cookie).expect(401);
      }
    }
    expect(await caps(a)).toHaveLength(0);
  });

  it("serves the CSV template", async () => {
    const res = await request(app)
      .get("/api/platform/admin/cap-import/template")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text.split("\r\n")[0]).toBe("category,cap_number,name,games_a_grade");
  });

  it("answers 404 for an unknown tenant and 400 for a missing file", async () => {
    await upload(999_999_999, "preview", CAPS_CSV).expect(404);
    await request(app)
      .post(`${base(a)}/preview`)
      .set("Cookie", platformCookie)
      .expect(400);
  });

  it("previews: links the pre-digital player by exact name and leaves the rest unlinked", async () => {
    const res = await upload(a, "preview", CAPS_CSV).expect(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.rowCount).toBe(3);
    const byName = Object.fromEntries(
      (res.body.caps as Array<{ name: string; status: string; playerId: number | null }>).map(
        (c) => [c.name, c],
      ),
    );
    expect(byName["Leigh McIntosh"]).toMatchObject({ status: "linked" });
    expect(byName["Leigh McIntosh"]!.playerId).toBeGreaterThan(0);
    expect(byName["Nobody Known"]).toMatchObject({ status: "unmatched", playerId: null });
    expect(await caps(a)).toHaveLength(0);
  });

  it("refuses a bad file (nothing written) and a missing label", async () => {
    const bad =
      "category,cap_number,name,games_a_grade\r\nmale,1,Al Smith,3\r\nmale,1,Bo Jones,4\r\n";
    const res = await upload(a, "commit", bad, { label: "bad" }).expect(422);
    expect(res.body.preview.errors.length).toBeGreaterThan(0);
    await upload(a, "commit", CAPS_CSV, { label: "   " }).expect(400);
    expect(await caps(a)).toHaveLength(0);
  });

  it("commits as one labelled batch: confirmed, linked, marked, and only for that club", async () => {
    const res = await upload(a, "commit", CAPS_CSV, { label: "WKBCC caps" }).expect(201);
    batchId = res.body.batchId;
    expect(batchId).toMatch(/^\d{8}T\d{6}Z$/);
    expect(res.body).toMatchObject({ label: "WKBCC caps", written: 3, linked: 1, unlinked: 2 });

    const rows = await caps(a);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "confirmed" && !r.autoCreated)).toBe(true);
    expect(rows.every((r) => r.capNote === `CSV import [${batchId}] WKBCC caps`)).toBe(true);
    const leigh = rows.find((r) => r.name === "Leigh McIntosh")!;
    expect(leigh).toMatchObject({
      category: "male",
      capNumber: 1,
      gamesAGrade: 196,
      inStats: true,
    });
    expect(leigh.playerId).not.toBeNull();
    expect(await caps(b)).toHaveLength(0);
  });

  it("refuses a second import into lists that already have caps", async () => {
    const res = await upload(a, "preview", CAPS_CSV).expect(200);
    expect(res.body.errors.join(" ")).toMatch(/already has/);
    await upload(a, "commit", CAPS_CSV, { label: "again" }).expect(422);
    expect(await caps(a)).toHaveLength(3);
  });

  it("lists the batch for its club only, and another club can't undo it", async () => {
    const mine = await request(app)
      .get(`${base(a)}/batches`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(mine.body).toEqual([
      expect.objectContaining({
        id: batchId,
        label: "WKBCC caps",
        male: 2,
        female: 1,
        linked: 1,
        unlinked: 2,
      }),
    ]);
    const theirs = await request(app)
      .get(`${base(b)}/batches`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(theirs.body).toEqual([]);
    await request(app)
      .delete(`${base(b)}/batches/${batchId}`)
      .set("Cookie", platformCookie)
      .expect(404);
    expect(await caps(a)).toHaveLength(3);
  });

  it("refuses undo while a later cap exists, then removes exactly the batch", async () => {
    await request(app)
      .delete(`${base(a)}/batches/not-a-token`)
      .set("Cookie", platformCookie)
      .expect(400);

    const [later] = await db
      .insert(capRegisterTable)
      .values({
        tenantId: a,
        capNumber: 3,
        category: "male",
        name: "Hand Entered",
        status: "pending",
      })
      .returning();
    const blocked = await request(app)
      .delete(`${base(a)}/batches/${batchId}`)
      .set("Cookie", platformCookie)
      .expect(409);
    expect(blocked.body.error).toMatch(/later cap/);
    expect(await caps(a)).toHaveLength(4);

    await db.delete(capRegisterTable).where(eq(capRegisterTable.id, later!.id));
    const res = await request(app)
      .delete(`${base(a)}/batches/${batchId}`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.body).toEqual({ batchId, capsRemoved: 3 });
    expect(await caps(a)).toHaveLength(0);
    const again = await db
      .select()
      .from(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, a),
          eq(capRegisterTable.capNote, `CSV import [${batchId}] WKBCC caps`),
        ),
      );
    expect(again).toHaveLength(0);
  });
});
