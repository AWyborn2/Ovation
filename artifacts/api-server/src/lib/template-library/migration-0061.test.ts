/**
 * Migration 0061 carries the pilot over (ADR-011 T3.2). Real-DB test (needs
 * DATABASE_URL): inside a rolled-back transaction it rebuilds the pre-0060
 * card_templates state, runs the migration twice and checks the result.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, cardTemplatesTable, tenantsTable } from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";

const ROOT = path.resolve(__dirname, "../../../../..");
const MIGRATION = readFileSync(
  path.join(ROOT, "lib/db/migrations/0061_template_library.sql"),
  "utf8",
);
const statements = MIGRATION.split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const STAMP = Date.now();
let tenantId: number;

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `mig-0060-${STAMP}`,
      centralClubId: 800_000 + (STAMP % 100_000),
      name: "Pilot Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
});

afterAll(async () => {
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const indexExists = async (tx: typeof db | Tx, name: string) =>
  (
    await tx.execute(
      sql`select 1 from pg_indexes where schemaname = 'public' and indexname = ${name}`,
    )
  ).rows.length > 0;

describe("migration 0061", () => {
  it("marks the pilot's kind rows as defaults, unchanged, and swaps the unique index", async () => {
    const seen: Record<string, unknown> = {};
    await db
      .transaction(async (tx) => {
        // The state before 0060: one kind row per tenant and kind, no default
        // flag. (Extra copies only exist since 0060.)
        await tx.execute(
          sql.raw(`DELETE FROM "card_templates" WHERE source = 'kind' AND NOT "is_kind_default"`),
        );
        await tx.execute(sql.raw(`DROP INDEX IF EXISTS "card_templates_kind_default_unique"`));
        await tx.execute(
          sql.raw(
            `CREATE UNIQUE INDEX "card_templates_kind_unique" ON "card_templates" ("tenant_id", "base_kind") WHERE source = 'kind'`,
          ),
        );
        await tx.execute(sql.raw(`UPDATE "card_templates" SET "is_kind_default" = false`));
        const pilot = await tx
          .insert(cardTemplatesTable)
          .values(
            ["milestone", "matchDay"].map((kind) => ({
              tenantId,
              name: `${kind} template`,
              source: "kind",
              baseKind: kind,
              cardKinds: [kind],
              adjustments: placeholderDocument(kind),
              version: 7,
            })),
          )
          .returning();
        // A pack row must stay untouched.
        const [pack] = await tx
          .insert(cardTemplatesTable)
          .values({
            tenantId,
            name: "pack",
            source: "pack",
            packId: "club-kit-v1",
            packVariant: "square",
          })
          .returning();

        for (let run = 0; run < 2; run++) {
          for (const stmt of statements) await tx.execute(sql.raw(stmt));
        }

        const after = await tx
          .select()
          .from(cardTemplatesTable)
          .where(inArray(cardTemplatesTable.id, [...pilot.map((p) => p.id), pack!.id]));
        for (const before of pilot) {
          const row = after.find((r) => r.id === before.id)!;
          expect(row.isKindDefault).toBe(true);
          expect(row.version).toBe(7);
          expect(row.adjustments).toEqual(before.adjustments);
          expect(row.originTemplateId).toBeNull();
          expect(row.editedAt).toBeNull();
          expect(row.fitStatus).toBe("pass");
        }
        expect(after.find((r) => r.id === pack!.id)!.isKindDefault).toBe(false);
        seen.oldIndex = await indexExists(tx, "card_templates_kind_unique");
        seen.newIndex = await indexExists(tx, "card_templates_kind_default_unique");

        // Many copies of a kind are allowed now; a second default is not.
        await tx.insert(cardTemplatesTable).values({
          tenantId,
          name: "second milestone",
          source: "kind",
          baseKind: "milestone",
          cardKinds: ["milestone"],
          adjustments: placeholderDocument("milestone"),
        });
        const copies = await tx
          .select()
          .from(cardTemplatesTable)
          .where(
            and(
              eq(cardTemplatesTable.tenantId, tenantId),
              eq(cardTemplatesTable.baseKind, "milestone"),
            ),
          );
        seen.copies = copies.length;

        // Re-running after a club has made copies never promotes a copy or breaks
        // the one-default rule (the dev stack re-ran it after a renumbering).
        for (const stmt of statements) await tx.execute(sql.raw(stmt));
        const rerun = await tx
          .select()
          .from(cardTemplatesTable)
          .where(
            and(
              eq(cardTemplatesTable.tenantId, tenantId),
              eq(cardTemplatesTable.baseKind, "milestone"),
            ),
          );
        seen.defaultsAfterRerun = rerun.filter((r) => r.isKindDefault).map((r) => r.id);
        seen.pilotMilestone = pilot.find((p) => p.baseKind === "milestone")!.id;
        await expect(
          tx.transaction(async (inner) => {
            await inner.insert(cardTemplatesTable).values({
              tenantId,
              name: "second default",
              source: "kind",
              baseKind: "milestone",
              cardKinds: ["milestone"],
              isKindDefault: true,
            });
          }),
        ).rejects.toThrow();
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
    expect(seen.defaultsAfterRerun).toEqual([seen.pilotMilestone]);
    expect(seen).toMatchObject({ oldIndex: false, newIndex: true, copies: 2 });
  });
});

describe("ensure-constraints", () => {
  const source = readFileSync(path.join(ROOT, "scripts/src/ensure-constraints.ts"), "utf8");

  it("never re-creates the one-row-per-kind index, and checks it stays gone", () => {
    expect(source).not.toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "card_templates_kind_unique"/);
    expect(source).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "card_templates_kind_default_unique"/,
    );
    expect(source).toMatch(/dropIndexes: \["card_templates_kind_unique"\]/);
    expect(source).toMatch(/ABSENT_INDEXES[\s\S]*name: "card_templates_kind_unique"/);
  });

  it("the live database has the new index and not the old one", async () => {
    expect(await indexExists(db, "card_templates_kind_default_unique")).toBe(true);
    expect(await indexExists(db, "card_templates_kind_unique")).toBe(false);
  });
});
