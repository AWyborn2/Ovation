import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { db, adminsTable, importsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FIXTURES = join(process.cwd(), "..", "..", "attached_assets");
const ROUND1 = "A_Grade_Round_1_-_Abandoned_1780356716493.xlsx";
const ROUND2 = "A_Grade_Round_2_1780356716494.xlsx";

describe("season batch import — upload/preview (integration)", () => {
  let adminId: number;
  let adminCookie: string;
  const holderIds: number[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-batch-flow";
    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_batch_${Date.now()}`,
        displayName: "Batch Test Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    if (holderIds.length > 0) {
      for (const id of holderIds) {
        await db.delete(importsTable).where(eq(importsTable.id, id));
      }
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  it("requires admin auth", async () => {
    const res = await request(app).post("/api/imports/match-batch");
    expect(res.status).toBe(401);
  });

  it("previews multiple .xlsx scorecards as one batch", async () => {
    const res = await request(app)
      .post("/api/imports/match-batch")
      .set("Cookie", adminCookie)
      .attach("files", join(FIXTURES, ROUND1))
      .attach("files", join(FIXTURES, ROUND2));

    expect(res.status).toBe(200);
    holderIds.push(res.body.importId);

    expect(res.body.files).toHaveLength(2);
    // Both A Grade scorecards map to a grade+season+round → committable.
    expect(res.body.committableMatches).toBe(2);
    for (const f of res.body.files) {
      expect(f.committable).toBe(true);
      expect(f.grade).toBe("A Grade");
      expect(typeof f.round).toBe("number");
    }
    // The abandoned round-1 file should be flagged abandoned (still committable).
    const statuses = res.body.files.map((f: { status: string }) => f.status).sort();
    expect(statuses).toContain("abandoned");

    // Players are de-duplicated across the batch (one row per unique name).
    const keys = new Set(
      res.body.players.map(
        (p: { surname: string; givenName: string }) =>
          `${p.surname}|${p.givenName}`.toLowerCase(),
      ),
    );
    expect(keys.size).toBe(res.body.players.length);
    expect(res.body.players.length).toBeGreaterThan(0);

    // A pending holder row was created (kind=match-batch), not committed data.
    const [holder] = await db
      .select()
      .from(importsTable)
      .where(eq(importsTable.id, res.body.importId));
    expect(holder.kind).toBe("match-batch");
    expect(holder.status).toBe("pending");
  });

  it("expands a .zip of scorecards", async () => {
    const zip = new JSZip();
    zip.file(ROUND1, readFileSync(join(FIXTURES, ROUND1)));
    zip.file(ROUND2, readFileSync(join(FIXTURES, ROUND2)));
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const res = await request(app)
      .post("/api/imports/match-batch")
      .set("Cookie", adminCookie)
      .attach("files", buf, "season.zip");

    expect(res.status).toBe(200);
    holderIds.push(res.body.importId);
    expect(res.body.files).toHaveLength(2);
    expect(res.body.committableMatches).toBe(2);
  });

  it("dedupes the same round appearing twice in one batch", async () => {
    const res = await request(app)
      .post("/api/imports/match-batch")
      .set("Cookie", adminCookie)
      .attach("files", join(FIXTURES, ROUND2))
      .attach("files", join(FIXTURES, ROUND2));

    expect(res.status).toBe(200);
    holderIds.push(res.body.importId);
    expect(res.body.files).toHaveLength(2);
    // First wins; the second copy is excluded as duplicateInBatch.
    expect(res.body.committableMatches).toBe(1);
    const statuses = res.body.files.map((f: { status: string }) => f.status);
    expect(statuses).toContain("duplicateInBatch");
  });

  it("cancelling a pending batch deletes only the holder row", async () => {
    const res = await request(app)
      .post("/api/imports/match-batch")
      .set("Cookie", adminCookie)
      .attach("files", join(FIXTURES, ROUND2));
    expect(res.status).toBe(200);
    const id = res.body.importId as number;

    const del = await request(app)
      .delete(`/api/imports/${id}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(204);

    const rows = await db
      .select()
      .from(importsTable)
      .where(eq(importsTable.id, id));
    expect(rows).toHaveLength(0);
  });
});
