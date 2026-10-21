/**
 * What the library draws its thumbnails with (ADR-011 §3 "Browse", T3.10).
 *
 * The club's latest SENIOR draft input of the kind, so a club browsing
 * templates sees its own cards. Juniors never feed previews: a draft from a
 * junior match, or whose input carries any junior flag (a junior day slide,
 * a junior row), is skipped, and so is a saved carousel (its input is the
 * whole set). With no such draft the client draws the kind's
 * sample in the club's identity (`sampleCardInput(kind, clubName)`), so the
 * server answers `source: "sample"` with no input.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, socialDraftsTable } from "@workspace/db";
import { templateKindFor } from "@workspace/scorecard/kind-templates";

export type PreviewInput =
  | { kind: string; source: "draft"; draftId: number; input: unknown }
  | { kind: string; source: "sample"; input: null };

export async function previewInputFor(tenantId: number, kind: string): Promise<PreviewInput> {
  // The Match Summary template also draws Results cards, so either feeds it.
  const kinds = templateKindFor(kind) === "matchSummary" ? ["matchSummary", "results"] : [kind];
  const [draft] = await db
    .select({ id: socialDraftsTable.id, input: socialDraftsTable.cardInput })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        ne(socialDraftsTable.status, "dismissed"),
        eq(socialDraftsTable.sourceMatchIsJunior, false),
        inArray(sql`${socialDraftsTable.cardInput}->>'kind'`, kinds),
        sql`not jsonb_path_exists(${socialDraftsTable.cardInput}, '$.** ? (@.junior == true)')`,
        // A saved carousel's input is the whole set, not one card.
        sql`not (${socialDraftsTable.cardInput} ? 'weekendCarousel')`,
      ),
    )
    .orderBy(desc(socialDraftsTable.createdAt), desc(socialDraftsTable.id))
    .limit(1);
  if (!draft) return { kind, source: "sample", input: null };
  return { kind, source: "draft", draftId: draft.id, input: draft.input };
}
