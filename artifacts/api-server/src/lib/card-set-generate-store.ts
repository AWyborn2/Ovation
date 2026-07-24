/**
 * Shared DB-bound core for server-side carousel-set generation. This is the ONE
 * assembly + idempotent-upsert implementation used by BOTH generation paths:
 *   - POST /card-sets/generate  (C3 — batch a round's summaries / grade leaders)
 *   - POST /card-sets/autoseed  (C4 — seed a round's APPROVED match-summary drafts)
 *
 * The pure slide assembly (`assembleSlides`) and clamp live in the DB-free
 * `social-cards-generate.ts`; this module adds the transactional upsert that
 * needs a database, keyed on the grouping columns so re-running a generation
 * UPDATES the same `card_sets` row rather than piling up duplicates.
 */

import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  cardSetsTable,
  type CardSetRow,
  type CardSetSlide,
} from "@workspace/db";
import { assembleSlides } from "./social-cards-generate";
import { CARD_SET_MAX_SLIDES } from "./social-cards-helpers";

/**
 * The idempotency key columns for a generated set. `season`/`sourceRound`/`grade`
 * are null where the kind doesn't narrow by that column (e.g. a gradeLeader set
 * spans grades and has no round). Mirrors the `card_sets_source_dedupe` partial
 * unique index.
 */
export type GeneratedCardSetKey = {
  sourceKind: string;
  season: number | null;
  sourceRound: number | null;
  grade: string | null;
};

/**
 * Assemble `inputs` into (at most `CARD_SET_MAX_SLIDES`) slides and UPSERT one
 * `card_sets` row on the grouping key. A select-then-write in one transaction
 * handles the nullable key columns (a plain unique index treats NULLs as
 * distinct); the partial unique index is the DB-level guard for the fully-keyed
 * case + concurrent races. Regeneration refreshes slides + name in place and
 * preserves the set's publish state so a live set is never silently unpublished.
 *
 * Returns the row plus how many inputs were clamped off (so the caller can log).
 * Callers must guard the empty-inputs case themselves (this never writes an
 * empty set — callers should skip / 400 before delegating here).
 */
export async function upsertGeneratedCardSet(
  tenantId: number,
  key: GeneratedCardSetKey,
  set: { name: string; platformSize: string; inputs: CardSetSlide["input"][] },
): Promise<{ row: CardSetRow; truncated: number }> {
  const { slides, truncated } = assembleSlides(set.inputs, CARD_SET_MAX_SLIDES);

  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: cardSetsTable.id, isPublished: cardSetsTable.isPublished })
      .from(cardSetsTable)
      .where(
        and(
          eq(cardSetsTable.tenantId, tenantId),
          eq(cardSetsTable.sourceKind, key.sourceKind),
          key.season == null
            ? isNull(cardSetsTable.season)
            : eq(cardSetsTable.season, key.season),
          key.sourceRound == null
            ? isNull(cardSetsTable.sourceRound)
            : eq(cardSetsTable.sourceRound, key.sourceRound),
          key.grade == null
            ? isNull(cardSetsTable.grade)
            : eq(cardSetsTable.grade, key.grade),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(cardSetsTable)
        .set({
          name: set.name,
          platformSize: set.platformSize,
          slides,
          updatedAt: new Date(),
        })
        .where(eq(cardSetsTable.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await tx
      .insert(cardSetsTable)
      .values({
        tenantId,
        name: set.name,
        platformSize: set.platformSize,
        slides,
        isPublished: false,
        sourceKind: key.sourceKind,
        season: key.season,
        sourceRound: key.sourceRound,
        grade: key.grade,
        updatedAt: new Date(),
      })
      .returning();
    return created;
  });

  return { row, truncated };
}
