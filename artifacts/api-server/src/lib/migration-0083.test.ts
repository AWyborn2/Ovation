/**
 * Migrations 0082 and 0083 (portrait and story sizes plan, Stage 6, D3): new
 * clubs start with Square off, and Square goes off for every club, Portrait
 * switched on first wherever it was off. Real-DB test (needs DATABASE_URL):
 * inside a rolled-back transaction it puts the database back as it was before
 * 0082 (Square on by default), seeds clubs with and without Portrait, counts
 * them with the read-only query, runs each migration statement on its own,
 * twice over, and checks every club keeps a feed size.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db, socialSettingsTable, tenantsTable } from "@workspace/db";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const split = (file: string) =>
  file
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
const M0082 = split(read("lib/db/migrations/0082_new_clubs_portrait_feed.sql"));
const M0083 = split(read("lib/db/migrations/0083_square_off_all_clubs.sql"));
const COUNT = read("scripts/sql/count-club-sizes.sql");

const STAMP = Date.now();

class Rollback extends Error {}

type Counts = { clubs: number; square_on: number; portrait_on: number; no_feed_size: number };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const count = async (tx: Tx): Promise<Counts> => {
  const row = (await tx.execute(sql.raw(COUNT))).rows[0] as Record<string, string | number>;
  return {
    clubs: Number(row.clubs),
    square_on: Number(row.square_on),
    portrait_on: Number(row.portrait_on),
    no_feed_size: Number(row.no_feed_size),
  };
};

describe("migrations 0082 and 0083", () => {
  it("are one statement per run and in the plan's order", () => {
    expect(M0082).toHaveLength(1);
    expect(M0083).toHaveLength(2);
    expect(M0083[0]).toContain(
      'UPDATE "social_settings" SET "size_portrait" = true WHERE "size_square" = true AND "size_portrait" = false;',
    );
    expect(M0083[1]).toContain(
      'UPDATE "social_settings" SET "size_square" = false WHERE "size_square" = true AND "size_portrait" = true;',
    );
  });

  it("switch Square off for every club, Portrait on first where it was off, twice over", async () => {
    await db
      .transaction(async (tx) => {
        // The database as it was before 0082: Square on by default.
        await tx.execute(
          sql.raw(`ALTER TABLE "social_settings" ALTER COLUMN "size_square" SET DEFAULT true`),
        );
        const tenants = await tx
          .insert(tenantsTable)
          .values(
            ["both", "no-portrait", "square-off", "story-only", "default", "new"].map((n, i) => ({
              slug: `mig-0083-${n}-${STAMP}`,
              centralClubId: 810_000 + ((STAMP + i) % 100_000),
              name: `Sizes ${n}`,
              plan: "pro" as const,
            })),
          )
          .returning();
        const [both, noPortrait, squareOff, storyOnly, byDefault, fresh] = tenants.map((t) => t.id);
        await tx.insert(socialSettingsTable).values([
          { tenantId: both!, sizeSquare: true, sizePortrait: true, sizeStory: true },
          { tenantId: noPortrait!, sizeSquare: true, sizePortrait: false, sizeStory: true },
          { tenantId: squareOff!, sizeSquare: false, sizePortrait: true, sizeStory: false },
          {
            tenantId: storyOnly!,
            sizeSquare: true,
            sizePortrait: false,
            sizeStory: false,
            sizeLandscape: true,
          },
        ]);
        // A club made before 0082 takes the old default: Square on.
        await tx.insert(socialSettingsTable).values({ tenantId: byDefault!, sizePortrait: false });

        const before = await count(tx);
        expect(before.square_on).toBeGreaterThanOrEqual(4);

        for (let run = 0; run < 2; run++) {
          for (const stmt of M0082) await tx.execute(sql.raw(stmt));
          for (const stmt of M0083) await tx.execute(sql.raw(stmt));
        }

        // A club made after 0082 starts with Square off, and Portrait on.
        await tx.insert(socialSettingsTable).values({ tenantId: fresh! });

        const rows = await tx
          .select()
          .from(socialSettingsTable)
          .where(
            inArray(
              socialSettingsTable.tenantId,
              tenants.map((t) => t.id),
            ),
          );
        const by = new Map(rows.map((r) => [r.tenantId, r]));
        const sizes = (id: number) => {
          const r = by.get(id)!;
          return {
            square: r.sizeSquare,
            portrait: r.sizePortrait,
            story: r.sizeStory,
            landscape: r.sizeLandscape,
          };
        };
        expect(sizes(both!)).toEqual({
          square: false,
          portrait: true,
          story: true,
          landscape: false,
        });
        expect(sizes(noPortrait!)).toEqual({
          square: false,
          portrait: true,
          story: true,
          landscape: false,
        });
        expect(sizes(squareOff!)).toEqual({
          square: false,
          portrait: true,
          story: false,
          landscape: false,
        });
        // Only Square and Portrait change: Story and Landscape stay as they were.
        expect(sizes(storyOnly!)).toEqual({
          square: false,
          portrait: true,
          story: false,
          landscape: true,
        });
        expect(sizes(byDefault!)).toEqual({
          square: false,
          portrait: true,
          story: true,
          landscape: false,
        });
        expect(sizes(fresh!)).toEqual({
          square: false,
          portrait: true,
          story: true,
          landscape: false,
        });

        const after = await count(tx);
        expect(after.square_on).toBe(0);
        expect(after.clubs).toBe(before.clubs + 1);
        // The migration never leaves a club without a feed size; other tests'
        // clubs in this database are counted too, so it may only go down.
        expect(after.no_feed_size).toBeLessThanOrEqual(before.no_feed_size);
        for (const r of rows) expect(r.sizeSquare || r.sizePortrait).toBe(true);
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
  });
});
