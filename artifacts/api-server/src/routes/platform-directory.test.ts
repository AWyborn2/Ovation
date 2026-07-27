import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable } from "@workspace/db";

/**
 * Public club directory (`GET /platform/directory-clubs`). Seeds one active and
 * one suspended tenant and asserts the directory lists the active club (with a
 * usable https URL) and omits the suspended one. Independent of SIGNUP_MODE — the
 * directory stays browsable even when onboarding is off.
 *
 * Real-DB integration test: needs DATABASE_URL, following the supertest pattern
 * of the sibling platform-signup / platform-admin-tenants suites.
 */

const STAMP = Date.now();
const ACTIVE_SLUG = `dir-active-${STAMP}`.slice(0, 40);
const SUSPENDED_SLUG = `dir-susp-${STAMP}`.slice(0, 40);

describe("public club directory", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
    }
  });

  it("lists active clubs (with a site URL) and omits suspended ones", async () => {
    const [active] = await db
      .insert(tenantsTable)
      .values({
        slug: ACTIVE_SLUG,
        centralClubId: 999001,
        name: `Directory Active ${STAMP}`,
        tagline: "CRICKET CLUB · EST 1901",
      })
      .returning();
    createdIds.push(active!.id);

    const [suspended] = await db
      .insert(tenantsTable)
      .values({
        slug: SUSPENDED_SLUG,
        centralClubId: 999002,
        name: `Directory Suspended ${STAMP}`,
        suspendedAt: new Date(),
      })
      .returning();
    createdIds.push(suspended!.id);

    // The directory does not depend on onboarding being open.
    process.env.SIGNUP_MODE = "off";
    const res = await request(app).get("/api/platform/directory-clubs");
    delete process.env.SIGNUP_MODE;

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const listed = res.body as Array<{
      slug: string;
      name: string;
      tagline: string | null;
      url: string;
    }>;

    const activeEntry = listed.find((c) => c.slug === ACTIVE_SLUG);
    expect(activeEntry).toBeDefined();
    expect(activeEntry!.tagline).toBe("CRICKET CLUB · EST 1901");
    expect(activeEntry!.url).toMatch(/^https:\/\/.+/);
    expect(activeEntry!.url).toContain(ACTIVE_SLUG);

    expect(listed.some((c) => c.slug === SUSPENDED_SLUG)).toBe(false);

    // Sorted by name (locale compare) — names are strictly ascending.
    const names = listed.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
