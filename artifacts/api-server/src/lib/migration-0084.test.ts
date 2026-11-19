/**
 * Migration 0084 (round 9, D17): Story on for every club, and new clubs start
 * with it on. Real-DB test (needs DATABASE_URL): inside a rolled-back
 * transaction it puts the column's default back to off, seeds clubs with
 * Story on and off, runs each statement on its own, twice over, and checks
 * only Story changes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db, socialSettingsTable, tenantsTable } from "@workspace/db";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const M0084 = read("lib/db/migrations/0084_story_on_all_clubs.sql")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const STAMP = Date.now();

class Rollback extends Error {}

describe("migration 0084", () => {
  it("is two standalone statements: Story on, then the default", () => {
    expect(M0084).toHaveLength(2);
    expect(M0084[0]).toContain(
      'UPDATE "social_settings" SET "size_story" = true WHERE "size_story" = false;',
    );
    expect(M0084[1]).toContain(
      'ALTER TABLE "social_settings" ALTER COLUMN "size_story" SET DEFAULT true;',
    );
    // One statement each, so the Production SQL runner runs all of each.
    for (const stmt of M0084) {
      const code = stmt
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect(code.split(";").filter((p) => p.trim()).length).toBe(1);
    }
  });

  it("switches Story on for every club, twice over, and nothing else", async () => {
    await db
      .transaction(async (tx) => {
        // As if the column defaulted off, so the second statement is seen to work.
        await tx.execute(
          sql.raw(`ALTER TABLE "social_settings" ALTER COLUMN "size_story" SET DEFAULT false`),
        );
        const tenants = await tx
          .insert(tenantsTable)
          .values(
            ["off", "on", "landscape", "new"].map((n, i) => ({
              slug: `mig-0084-${n}-${STAMP}`,
              centralClubId: 820_000 + ((STAMP + i) % 100_000),
              name: `Story ${n}`,
              plan: "pro" as const,
            })),
          )
          .returning();
        const [off, on, landscape, fresh] = tenants.map((t) => t.id);
        await tx.insert(socialSettingsTable).values([
          { tenantId: off!, sizeSquare: false, sizePortrait: true, sizeStory: false },
          { tenantId: on!, sizeSquare: false, sizePortrait: true, sizeStory: true },
          {
            tenantId: landscape!,
            sizeSquare: false,
            sizePortrait: true,
            sizeStory: false,
            sizeLandscape: true,
          },
        ]);

        for (let run = 0; run < 2; run++) {
          for (const stmt of M0084) await tx.execute(sql.raw(stmt));
        }
        // A club made after 0084 starts with Story on.
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
        const portraitAndStory = { square: false, portrait: true, story: true, landscape: false };
        expect(sizes(off!)).toEqual(portraitAndStory);
        expect(sizes(on!)).toEqual(portraitAndStory);
        // Only Story changes: an older Landscape switch stays as it was.
        expect(sizes(landscape!)).toEqual({ ...portraitAndStory, landscape: true });
        expect(sizes(fresh!)).toEqual(portraitAndStory);
        const [left] = (
          await tx.execute(
            sql.raw(`select count(*) filter (where not size_story) as n from social_settings`),
          )
        ).rows as { n: string | number }[];
        expect(Number(left!.n)).toBe(0);
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
  });
});
