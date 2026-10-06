import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
  shirtNumberUploadsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Season shirt numbers — spreadsheet and registration-export uploads (plan U4;
 * R4, R5, R7, R8, R11; F1; KTD8). Preview, per-row resolutions, the duplicate
 * policy, idempotent commits, discard, tenant isolation and the file limits.
 * Both clubs are central-read tenants, so this also proves uploads are not
 * fenced to native-stats clubs.
 *
 * Real-DB integration test (needs DATABASE_URL; runs in CI's API job). The one
 * name-match check against central display names seeds central.players and
 * only runs when the databases are local, like curated-player-link-isolation.
 */

const isLocalDb = (() => {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    const centralHost = new URL(process.env.CENTRAL_DATABASE_URL ?? "").hostname;
    const local = ["localhost", "127.0.0.1", "::1", "postgres"];
    return local.includes(host) && local.includes(centralHost);
  } catch {
    return false;
  }
})();

const STAMP = Date.now();
const GUID = (n: number) =>
  `96${String(STAMP).slice(-6)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = 2031;

type PreviewRow = {
  rowIndex: number;
  name: string;
  participantId: string | null;
  number: string | null;
  status: string;
  playerId: number | null;
  candidates: { playerId?: number | null; name: string }[];
  existingEntryId: number | null;
  existingNumber: string | null;
  numberChange: boolean;
  duplicate: boolean;
  duplicateWith?: string[];
  errors: string[];
};
type Preview = {
  id: number;
  side: string;
  kind: string;
  season: number;
  fileName: string;
  rows: PreviewRow[];
  counts: Record<string, number>;
  unrecognisedHeaders: string[];
  errors: string[];
  truncated: boolean;
};

describe("shirt numbers: uploads", () => {
  let tenantId: number;
  let otherTenantId: number;
  const adminIds: number[] = [];
  let cookie: string;
  /** A second admin of the same club, so the file-limit checks get their own rate bucket. */
  let limitsCookie: string;
  let otherCookie: string;
  /** Player ids in the club's space (its crosswalk). */
  const P = { alice: 960_001, bea: 960_002, cy: 960_003, dee: 960_004, eve: 960_005 };

  const as = (r: request.Test, c = cookie, t = () => tenantId) =>
    r.set("x-tenant-id", String(t())).set("Cookie", c);
  const settings = (body: object) =>
    as(request(app).patch("/api/shirt-numbers/settings")).send(body).expect(200);
  const upload = (
    content: string | Buffer,
    opts: { kind?: string; season?: number; fileName?: string; c?: string } = {},
  ) =>
    as(request(app).post("/api/shirt-numbers/uploads"), opts.c ?? cookie)
      .field("kind", opts.kind ?? "numbers")
      .field("season", String(opts.season ?? SEASON))
      .attach("file", Buffer.isBuffer(content) ? content : Buffer.from(content), {
        filename: opts.fileName ?? "numbers.csv",
      });
  const preview = async (content: string, opts: Parameters<typeof upload>[1] = {}) => {
    const r = await upload(content, opts);
    expect(r.status).toBe(200);
    return r.body as Preview;
  };
  const commit = (id: number, resolutions: object[] = []) =>
    as(request(app).post(`/api/shirt-numbers/uploads/${id}/commit`)).send({ resolutions });
  const register = (season = SEASON) =>
    db
      .select()
      .from(shirtNumbersTable)
      .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)));
  const uploadRow = async (id: number) =>
    (await db.select().from(shirtNumberUploadsTable).where(eq(shirtNumberUploadsTable.id, id)))[0]!;

  async function makeTenant(slug: string, clubId: number) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `${slug}-${STAMP}`,
        centralClubId: clubId,
        readsFromCentral: true,
        name: `Upload Club ${slug}`,
        plan: "pro",
      })
      .returning();
    return t.id;
  }
  async function makeAdmin(tid: number, name: string) {
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tid,
        username: `shirt_upload_${name}_${STAMP}`,
        displayName: name,
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    return `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-shirt-uploads";
    tenantId = await makeTenant("shirt-uploads", 9961);
    otherTenantId = await makeTenant("shirt-uploads-other", 9962);
    await db
      .insert(playerIdMapTable)
      .values(
        Object.values(P).map((playerId, i) => ({ tenantId, participantId: GUID(i + 1), playerId })),
      );
    cookie = await makeAdmin(tenantId, "main");
    limitsCookie = await makeAdmin(tenantId, "limits");
    otherCookie = await makeAdmin(otherTenantId, "other");
  });

  afterAll(async () => {
    const tenants = [tenantId, otherTenantId];
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, tenants));
    await db
      .delete(shirtNumberUploadsTable)
      .where(inArray(shirtNumberUploadsTable.tenantId, tenants));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, tenants));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenants));
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  });

  it("requests without an admin session get 401", async () => {
    const anon = (r: request.Test) => r.set("x-tenant-id", String(tenantId));
    await anon(request(app).post("/api/shirt-numbers/uploads"))
      .attach("file", Buffer.from("Name,Number\n"), "n.csv")
      .expect(401);
    await anon(request(app).post("/api/shirt-numbers/uploads/1/commit"))
      .send({ resolutions: [] })
      .expect(401);
    await anon(request(app).delete("/api/shirt-numbers/uploads/1")).expect(401);
  });

  it("refuses uploads while the feature is off", async () => {
    const r = await upload("Name,Number\nAlice A,7\n");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/turned off/);
    await settings({ enabled: true, duplicatePolicy: "warn", rolloverPolicy: "carry" });
    await as(request(app).patch("/api/shirt-numbers/settings"), otherCookie, () => otherTenantId)
      .send({ enabled: true })
      .expect(200);
  });

  it("F1: previews, then commits matched, held and discarded rows (central-read club)", async () => {
    const [heldSeed] = await db
      .insert(shirtNumbersTable)
      .values({ tenantId, season: SEASON, name: "Pre Held", participantId: GUID(9) })
      .returning();

    const p = await preview(
      [
        "Name,Participant ID,Number",
        `Alice A,${GUID(1).toUpperCase()},7`,
        "Held Newbie,,12",
        "Bad Row,,abc",
        "Gone Guy,,15",
        `Pre Held,${GUID(9).toUpperCase()},33`,
      ].join("\n"),
    );
    expect(p).toMatchObject({ side: "senior", kind: "numbers", season: SEASON, truncated: false });
    expect(p.fileName).toBe("numbers.csv");
    expect(p.errors).toEqual([]);
    const byIdx = new Map(p.rows.map((r) => [r.rowIndex, r]));
    expect(byIdx.get(1)).toMatchObject({
      status: "matched",
      playerId: P.alice,
      participantId: GUID(1),
    });
    expect(byIdx.get(2)).toMatchObject({ status: "new", playerId: null });
    expect(byIdx.get(3)).toMatchObject({ status: "invalid", number: null });
    expect(byIdx.get(3)!.errors.length).toBeGreaterThan(0);
    // An upper-case participant id finds the lower-case held entry.
    expect(byIdx.get(5)).toMatchObject({
      status: "new",
      participantId: GUID(9),
      existingEntryId: heldSeed.id,
      existingNumber: null,
    });
    expect(p.counts).toMatchObject({ total: 5, matched: 1, new: 3, invalid: 1 });

    // Nothing is written by the preview.
    expect((await register()).map((e) => e.name)).toEqual(["Pre Held"]);

    const c = await commit(p.id, [{ rowIndex: 4, action: "discard" }]);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({
      uploadId: p.id,
      created: 2,
      updated: 1,
      linked: 1,
      held: 2,
      discarded: 2,
      warnings: [],
    });

    const rows = await register();
    const byName = new Map(rows.map((e) => [e.name, e]));
    expect([...byName.keys()].sort()).toEqual(["Alice A", "Held Newbie", "Pre Held"]);
    expect(byName.get("Alice A")).toMatchObject({
      playerId: P.alice,
      participantId: GUID(1),
      number: "7",
      source: "upload",
    });
    expect(byName.get("Held Newbie")).toMatchObject({ playerId: null, number: "12" });
    expect(byName.get("Pre Held")).toMatchObject({ id: heldSeed.id, number: "33" });

    const stored = await uploadRow(p.id);
    expect(stored.status).toBe("committed");
    expect(stored.payload).toBeNull();
  });

  it("committing the same upload twice is refused and adds nothing", async () => {
    const p = await preview("Name,Participant ID,Number\nBea B," + GUID(2) + ",4\n");
    await commit(p.id).expect(200);
    const before = (await register()).length;
    const again = await commit(p.id);
    expect(again.status).toBe(409);
    expect((await register()).length).toBe(before);
  });

  it("re-uploading the same sheet updates in place instead of duplicating", async () => {
    const p = await preview(`Name,Participant ID,Number\nAlice A,${GUID(1)},9\nHeld Newbie,,12\n`);
    const alice = p.rows.find((r) => r.name === "Alice A")!;
    expect(alice).toMatchObject({ numberChange: true, existingNumber: "7" });
    expect(p.rows.find((r) => r.name === "Held Newbie")).toMatchObject({ numberChange: false });
    expect(p.counts.numberChanges).toBe(1);

    const c = await commit(p.id);
    expect(c.body).toMatchObject({ created: 0, updated: 1 });
    const rows = await register();
    expect(rows.filter((e) => e.name === "Held Newbie")).toHaveLength(1);
    expect(rows.find((e) => e.playerId === P.alice)?.number).toBe("9");
  });

  it("a row can be linked to a chosen player or held instead of its match", async () => {
    const p = await preview(`Name,Participant ID,Number\nCy C,${GUID(3)},51\nDee Unknown,,52\n`);
    const c = await commit(p.id, [
      { rowIndex: 1, action: "hold" },
      { rowIndex: 2, action: "link", playerId: P.dee },
    ]);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ created: 2, linked: 1, held: 1 });
    const rows = await register();
    expect(rows.find((e) => e.name === "Cy C")).toMatchObject({
      playerId: null,
      participantId: GUID(3),
    });
    expect(rows.find((e) => e.name === "Dee Unknown")).toMatchObject({ playerId: P.dee });
  });

  it("refuses bad resolutions: a player outside the club, an invalid row, a missing player", async () => {
    const p = await preview("Name,Number\nOutsider Person,61\nBroken Row,xyz\n");
    expect((await commit(p.id, [{ rowIndex: 1, action: "link", playerId: 1 }])).status).toBe(400);
    expect((await commit(p.id, [{ rowIndex: 2, action: "hold" }])).status).toBe(400);
    expect((await commit(p.id, [{ rowIndex: 1, action: "link" }])).status).toBe(400);
    expect((await commit(p.id, [{ rowIndex: 99, action: "hold" }])).status).toBe(400);
    expect((await uploadRow(p.id)).status).toBe("pending");
    await as(request(app).delete(`/api/shirt-numbers/uploads/${p.id}`)).expect(204);
  });

  it("R11 (block): a duplicate number refuses the whole commit, listing the row; warn applies it", async () => {
    await settings({ duplicatePolicy: "block" });
    // Alice wears 9 this season.
    const p = await preview(`Name,Participant ID,Number\nEve E,${GUID(5)},9\nFresh Face,,70\n`);
    const eve = p.rows.find((r) => r.name === "Eve E")!;
    expect(eve).toMatchObject({ duplicate: true, duplicateWith: ["Alice A"] });
    expect(p.counts.duplicates).toBe(1);

    const blocked = await commit(p.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.warnings).toHaveLength(1);
    expect(blocked.body.warnings[0].message).toMatch(/Row 1/);
    expect(blocked.body.warnings[0].names).toEqual(["Alice A"]);
    const rows = await register();
    expect(rows.some((e) => e.name === "Eve E" || e.name === "Fresh Face")).toBe(false);
    expect((await uploadRow(p.id)).status).toBe("pending");

    await settings({ duplicatePolicy: "warn" });
    const applied = await commit(p.id);
    expect(applied.status).toBe(200);
    expect(applied.body.created).toBe(2);
    expect(applied.body.warnings).toHaveLength(1);
    expect(applied.body.warnings[0]).toMatchObject({ number: "9" });
    expect(applied.body.warnings[0].names.sort()).toEqual(["Alice A", "Eve E"]);
  });

  it("R5: a registration upload ignores numbers; new entries carry last season's number", async () => {
    const target = SEASON + 1;
    await db.insert(shirtNumbersTable).values({
      tenantId,
      season: target - 1,
      name: "Reg Carry",
      participantId: GUID(21),
      number: "21",
    });
    const p = await preview(
      `First Name,Last Name,Participant ID,Number\nReg,Carry,${GUID(21)},44\nReg,Plain,,45\n`,
      { kind: "registration", season: target, fileName: "registrations.csv" },
    );
    expect(p.kind).toBe("registration");
    expect(p.rows.map((r) => r.number)).toEqual([null, null]);

    const c = await commit(p.id);
    expect(c.body).toMatchObject({ created: 2, held: 2 });
    const rows = await register(target);
    expect(rows.find((e) => e.name === "Reg Carry")).toMatchObject({
      number: "21",
      source: "registration",
    });
    expect(rows.find((e) => e.name === "Reg Plain")).toMatchObject({ number: null });
  });

  it("an unknown header set previews with an error listing the headers found", async () => {
    const p = await preview("Foo,Bar\n1,2\n");
    expect(p.rows).toEqual([]);
    expect(p.errors[0]).toContain("Foo");
    expect(p.errors[0]).toContain("Bar");
    expect(p.unrecognisedHeaders).toEqual(["Foo", "Bar"]);
    const c = await commit(p.id);
    expect(c.body).toMatchObject({ created: 0, updated: 0 });
  });

  it("discard clears the preview; it cannot then be committed or discarded again", async () => {
    const p = await preview("Name,Number\nDiscard Me,77\n");
    await as(request(app).delete(`/api/shirt-numbers/uploads/${p.id}`)).expect(204);
    const stored = await uploadRow(p.id);
    expect(stored.status).toBe("discarded");
    expect(stored.payload).toBeNull();
    expect((await commit(p.id)).status).toBe(409);
    await as(request(app).delete(`/api/shirt-numbers/uploads/${p.id}`)).expect(404);
    expect((await register()).some((e) => e.name === "Discard Me")).toBe(false);
  });

  it("another club cannot commit or discard this club's pending upload (404)", async () => {
    const p = await preview("Name,Number\nPrivate Pending,80\n");
    const other = () => otherTenantId;
    await as(request(app).post(`/api/shirt-numbers/uploads/${p.id}/commit`), otherCookie, other)
      .send({ resolutions: [] })
      .expect(404);
    await as(request(app).delete(`/api/shirt-numbers/uploads/${p.id}`), otherCookie, other).expect(
      404,
    );
    expect((await uploadRow(p.id)).status).toBe("pending");
    await as(request(app).delete(`/api/shirt-numbers/uploads/${p.id}`)).expect(204);
  });

  it("rejects an oversized file (413), another file type, two files, or over 1,000 rows (400)", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, "a");
    expect((await upload(big, { c: limitsCookie })).status).toBe(413);

    const txt = await upload("Name,Number\nA B,1\n", { fileName: "numbers.txt", c: limitsCookie });
    expect(txt.status).toBe(400);

    const two = await as(request(app).post("/api/shirt-numbers/uploads"), limitsCookie)
      .field("kind", "numbers")
      .field("season", String(SEASON))
      .attach("file", Buffer.from("Name,Number\nA B,1\n"), "a.csv")
      .attach("file", Buffer.from("Name,Number\nC D,2\n"), "b.csv");
    expect(two.status).toBe(400);

    const lines = ["Name,Number"];
    for (let i = 0; i < 1001; i++) lines.push(`Player ${i},1`);
    const many = await upload(lines.join("\n"), { c: limitsCookie });
    expect(many.status).toBe(400);
    expect(many.body.error).toMatch(/1,000/);

    const badKind = await upload("Name,Number\nA B,1\n", { kind: "other", c: limitsCookie });
    expect(badKind.status).toBe(400);
    const badSeason = await as(request(app).post("/api/shirt-numbers/uploads"), limitsCookie)
      .field("kind", "numbers")
      .field("season", "next")
      .attach("file", Buffer.from("Name,Number\nA B,1\n"), "a.csv");
    expect(badSeason.status).toBe(400);
  });

  it.skipIf(!isLocalDb)(
    "matches an exact central display name; never applies a near-name suggestion",
    async () => {
      const name = `Upload${STAMP} Example`;
      await db.execute(sql`
        insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
        values (${GUID(4)}, ${name}, 0, null, '2024/25', '2024/25', 1)
      `);
      try {
        const p = await preview(`Name,Number\n${name},90\nUpload${STAMP} Exampl,91\n`, {
          season: SEASON + 5,
          c: limitsCookie,
        });
        expect(p.rows[0]).toMatchObject({ status: "matched", playerId: P.dee });
        expect(p.rows[1].status).toBe("suggested");
        expect(p.rows[1].playerId).toBeNull();
        expect(p.rows[1].candidates[0]).toMatchObject({ playerId: P.dee, name });
        await as(request(app).delete(`/api/shirt-numbers/uploads/${p.id}`), limitsCookie).expect(
          204,
        );
      } finally {
        await db.execute(sql`delete from central.players where participant_id = ${GUID(4)}`);
      }
    },
  );
});
