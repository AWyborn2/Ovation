/**
 * P9 (match-day carousel content) — Gold Foil, Bold Type, Neon Night and Sunset
 * are hidden: the card template listing never shows them, a club whose stored
 * default names one reads and auto-queues Club Kit, and a hidden row can't be
 * chosen. Stored rows are never rewritten. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, adminsTable, cardTemplatesTable, tenantsTable } from "@workspace/db";
import { resolvePackIdForKind } from "@workspace/scorecard";
import { LEGACY_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { ACTIVE_PACKS, PACKS } from "../lib/design-packs";
import { resolveDraftPack } from "../lib/draft-enrich";

const STAMP = Date.now();
let tenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-legacy-packs";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `legacy-packs-${STAMP}`,
      centralClubId: 9994,
      name: "Legacy Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `legacy_${STAMP}`, displayName: "L", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
  await db.delete(adminsTable).where(inArray(adminsTable.id, [adminId]));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const list = () =>
  request(app)
    .get("/api/card-templates")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId));
const patch = (id: number, body: object) =>
  request(app)
    .patch(`/api/card-templates/${id}`)
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId))
    .send(body);

type Listed = {
  id: number;
  source: string;
  packId: string | null;
  cardKinds: string[];
  isActive: boolean;
  isDefault: boolean;
  defaultForKinds: string[] | null;
};

const packRow = async (packId: string) => {
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.source, "pack"),
        eq(cardTemplatesTable.packId, packId),
      ),
    );
  return rows.sort((a, b) => a.id - b.id)[0];
};

describe("legacy design packs are hidden (P9)", () => {
  it("keeps every pack registered but offers only the active ones", () => {
    for (const id of LEGACY_PACK_IDS) {
      expect(PACKS.some((p) => p.id === id)).toBe(true);
      expect(ACTIVE_PACKS.some((p) => p.id === id)).toBe(false);
    }
    expect(ACTIVE_PACKS.map((p) => p.id)).toEqual(
      expect.arrayContaining(["broadcast-dark-v1", "club-kit-v1"]),
    );
  });

  it("never lists a legacy pack row", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const packIds = new Set((res.body as Listed[]).map((r) => r.packId));
    expect(packIds.has("club-kit-v1")).toBe(true);
    for (const id of LEGACY_PACK_IDS) expect(packIds.has(id)).toBe(false);
  });

  it.each(LEGACY_PACK_IDS)(
    "reads and auto-queues a stored %s default as Club Kit, row untouched",
    async (legacy) => {
      await list(); // materialises the pack rows
      await db
        .update(cardTemplatesTable)
        .set({ defaultForKinds: [] })
        .where(eq(cardTemplatesTable.tenantId, tenantId));
      const stored = await packRow(legacy);
      await db
        .update(cardTemplatesTable)
        .set({ defaultForKinds: ["matchDay", "century"] })
        .where(eq(cardTemplatesTable.id, stored.id));

      const listed = (await list()).body as Listed[];
      expect(resolvePackIdForKind(listed, "matchDay")).toBe("club-kit-v1");
      expect(resolvePackIdForKind(listed, "century")).toBe("club-kit-v1");
      expect(await resolveDraftPack(tenantId, "matchDay")).toBe("club-kit-v1");
      expect((await packRow(legacy)).defaultForKinds).toEqual(["matchDay", "century"]);

      // The hidden row can't be chosen.
      expect((await patch(stored.id, { defaultForKinds: ["ladder"] })).status).toBe(404);

      // Choosing a visible pack clears the old claim as before.
      const bd = await packRow("broadcast-dark-v1");
      expect((await patch(bd.id, { defaultForKinds: ["matchDay"] })).status).toBe(200);
      expect((await packRow(legacy)).defaultForKinds).toEqual(["century"]);
      expect(await resolveDraftPack(tenantId, "matchDay")).toBe("broadcast-dark-v1");
    },
  );
});
