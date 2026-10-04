// Platform-admin player privacy overrides
// (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md, D4 / P8).
//
// Real database: the override is saved app-side and applied to central.players through the
// central_projector role — so this also proves the app never needs a central write path of its own.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, platformAdminsTable, playerPrivacyOverridesTable } from "@workspace/db";
import { closeCentralProjectorPool } from "@workspace/db/playhq-ingest";
import { hashPassword } from "../lib/auth";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const STAMP = Date.now();
const EMAIL = `privacy+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
const PUBLIC_P = randomUUID();
const PRIVATE_P = randomUUID();
const NAME = `Privacytest ${STAMP}`;

const admin = {
  query: (text: string, params?: unknown[]) => db.$client.query(text, params),
};
let cookie: string;
let platformAdminId: number;
const saved = {
  url: process.env.CENTRAL_PROJECTOR_DATABASE_URL,
  ssl: process.env.CENTRAL_PROJECTOR_DB_SSL,
};

const flag = async (id: string) =>
  (await admin.query(`select is_private from central.players where participant_id = $1`, [id]))
    .rows[0]?.is_private;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-player-privacy";
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "central-projector.sql"), "utf8"));
  await admin.query(`alter role central_projector with password 'test'`);
  const u = new URL(process.env.CENTRAL_DATABASE_URL!);
  u.username = "central_projector";
  u.password = "test";
  process.env.CENTRAL_PROJECTOR_DATABASE_URL = u.toString();
  process.env.CENTRAL_PROJECTOR_DB_SSL = "0";

  await admin.query(
    `insert into central.players (participant_id, display_name, is_private, matches)
     values ($1, $3, 0, 40), ($2, $4, 1, 3)`,
    [PUBLIC_P, PRIVATE_P, `${NAME} Public`, `${NAME} Hidden`],
  );
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Super", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  cookie = String(login.headers["set-cookie"][0]).split(";")[0]!;
});

afterAll(async () => {
  await closeCentralProjectorPool();
  process.env.CENTRAL_PROJECTOR_DATABASE_URL = saved.url;
  process.env.CENTRAL_PROJECTOR_DB_SSL = saved.ssl;
  await db
    .delete(playerPrivacyOverridesTable)
    .where(eq(playerPrivacyOverridesTable.participantId, PUBLIC_P));
  await db
    .delete(playerPrivacyOverridesTable)
    .where(eq(playerPrivacyOverridesTable.participantId, PRIVATE_P));
  await admin.query(`delete from central.players where participant_id = any($1::text[])`, [
    [PUBLIC_P, PRIVATE_P],
  ]);
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

describe("platform player privacy overrides", () => {
  it("is platform-admin only", async () => {
    const r = await request(app).get("/api/platform/admin/player-privacy?q=Privacytest");
    expect(r.status).toBe(401);
  });

  it("searches central players by name, private ones included", async () => {
    const r = await request(app)
      .get(`/api/platform/admin/player-privacy?q=${encodeURIComponent(NAME)}`)
      .set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body.projectorConfigured).toBe(true);
    expect(r.body.players.map((p: { participantId: string }) => p.participantId).sort()).toEqual(
      [PUBLIC_P, PRIVATE_P].sort(),
    );
    expect(
      r.body.players.find((p: { participantId: string }) => p.participantId === PRIVATE_P),
    ).toMatchObject({
      isPrivate: true,
      override: null,
    });
  });

  it("finds a player by participant GUID", async () => {
    const r = await request(app)
      .get(`/api/platform/admin/player-privacy?q=${PUBLIC_P}`)
      .set("Cookie", cookie);
    expect(r.body.players).toEqual([expect.objectContaining({ participantId: PUBLIC_P })]);
  });

  it("making a player private applies to central straight away", async () => {
    const r = await request(app)
      .put(`/api/platform/admin/player-privacy/${PUBLIC_P}`)
      .set("Cookie", cookie)
      .send({ isPrivate: true, reason: "Parent request" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ isPrivate: true, reason: "Parent request", applied: true });
    expect(await flag(PUBLIC_P)).toBe(1);
  });

  it("an override is the only thing that lowers the flag", async () => {
    const r = await request(app)
      .put(`/api/platform/admin/player-privacy/${PRIVATE_P}`)
      .set("Cookie", cookie)
      .send({ isPrivate: false });
    expect(r.body).toMatchObject({ isPrivate: false, applied: true });
    expect(await flag(PRIVATE_P)).toBe(0);
  });

  it("lists overrides with their applied state", async () => {
    const r = await request(app).get("/api/platform/admin/player-privacy").set("Cookie", cookie);
    const mine = r.body.overrides.filter((o: { participantId: string }) =>
      ([PUBLIC_P, PRIVATE_P] as string[]).includes(o.participantId),
    );
    expect(mine).toHaveLength(2);
    expect(mine.every((o: { applied: boolean }) => o.applied)).toBe(true);
    expect(r.body.players).toEqual([]);
  });

  it("rejects unknown players and malformed ids", async () => {
    const unknown = await request(app)
      .put(`/api/platform/admin/player-privacy/${randomUUID()}`)
      .set("Cookie", cookie)
      .send({ isPrivate: true });
    expect(unknown.status).toBe(404);
    const bad = await request(app)
      .put("/api/platform/admin/player-privacy/not-a-guid")
      .set("Cookie", cookie)
      .send({ isPrivate: true });
    expect(bad.status).toBe(400);
  });

  it("removing an override leaves the central flag as it is", async () => {
    const r = await request(app)
      .delete(`/api/platform/admin/player-privacy/${PUBLIC_P}`)
      .set("Cookie", cookie);
    expect(r.status).toBe(204);
    expect(await flag(PUBLIC_P)).toBe(1);
    const again = await request(app)
      .delete(`/api/platform/admin/player-privacy/${PUBLIC_P}`)
      .set("Cookie", cookie);
    expect(again.status).toBe(404);
  });
});
