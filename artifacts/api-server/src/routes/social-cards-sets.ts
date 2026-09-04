import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { MatchDetail } from "@workspace/api-zod";
import { matchToSummaryInput } from "@workspace/scorecard";
import {
  db,
  cardSetsTable,
  socialDraftsTable,
  matchesTable,
  juniorMatchesTable,
} from "@workspace/db";
import {
  CreateCardSetBody,
  UpdateCardSetBody,
  UpdateCardSetParams,
  DeleteCardSetParams,
  GenerateCardSetBody,
  AutoseedCardSetBody,
} from "@workspace/api-zod";
import type { CardSetSlide } from "@workspace/db";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";

import {
  ensureSettings,
  CARD_SET_MIN_SLIDES,
  CARD_SET_MAX_SLIDES,
} from "../lib/social-cards-helpers";
import {
  GENERATE_GRADES,
  gradeLeaderInput,
  topLeaderRow,
  deriveAutoseedGroups,
  type AutoseedDraft,
} from "../lib/social-cards-generate";
import { upsertGeneratedCardSet } from "../lib/card-set-generate-store";
import { listRoundMatchIds } from "../lib/round-matches";
import { loadMatchDetailForRequest } from "../lib/match-detail";
import { loadGradeLeaderboard } from "../lib/grade-leaderboard";

/**
 * Social studio — multi-card / carousel sets, including the round-summary
 * generator (`POST /card-sets/generate`) and the approved-draft autoseeder
 * (`POST /card-sets/autoseed`). The generators read match detail and grade
 * leaderboards through the `lib/` loaders shared with the matches/grades routes
 * so the slides carry exactly the DTOs those routes serve. Mounted by
 * routes/social-cards.ts.
 */
const router: IRouter = Router();

// --- Multi-card / carousel sets --------------------------------------------
// Reading is public, but the public only ever sees PUBLISHED sets; admins see
// every set (drafts included) so they can keep editing. Authoring (create /
// update / delete) is admin-only.

router.get("/card-sets", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const admin = await resolveAdmin(req);
  const rows = await db
    .select()
    .from(cardSetsTable)
    .where(
      admin
        ? eq(cardSetsTable.tenantId, tenantId)
        : and(eq(cardSetsTable.tenantId, tenantId), eq(cardSetsTable.isPublished, true)),
    )
    .orderBy(asc(cardSetsTable.name));
  res.json(rows);
});

router.post("/card-sets", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const body = CreateCardSetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const isPublished = body.data.isPublished ?? false;
  if (
    isPublished &&
    (body.data.slides.length < CARD_SET_MIN_SLIDES ||
      body.data.slides.length > CARD_SET_MAX_SLIDES)
  ) {
    res.status(400).json({
      error: `A published carousel must have between ${CARD_SET_MIN_SLIDES} and ${CARD_SET_MAX_SLIDES} slides`,
    });
    return;
  }
  const [row] = await db
    .insert(cardSetsTable)
    .values({
      tenantId: getTenantId(req),
      name: body.data.name,
      platformSize: body.data.platformSize,
      slides: body.data.slides as unknown as CardSetSlide[],
      isPublished,
      updatedAt: new Date(),
    })
    .returning();
  res.status(201).json(row);
});

// Batch-assemble a carousel from a group of same-kind cards, server-side, and
// UPSERT one set keyed on the grouping columns so regeneration updates the same
// row. Reuses the shared input builders: `matchToSummaryInput` (@workspace/
// scorecard) for match summaries and `gradeLeaderInput` (the server twin of the
// carousel editor's inline builder) for grade leaderboards. New sets are drafts,
// like the other card-set routes.
router.post(
  "/card-sets/generate",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const body = GenerateCardSetBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const { kind, round, season, grades, platformSize } = body.data;

    // Gather the source rows and map each to a ShareCardInput. `group*` are the
    // idempotency key columns (null where a kind doesn't narrow by that column).
    let inputs: Array<Record<string, unknown>> = [];
    let name = "Generated set";
    let groupSeason: number | null = null;
    let groupRound: number | null = null;
    let groupGrade: string | null = null;

    if (kind === "matchSummary") {
      // A match-summary set is one grade's round, so it needs an unambiguous
      // (grade, season, round) — the same trio the carousel editor's "add all in
      // round" action operates on.
      if (round == null || season == null || !grades || grades.length !== 1) {
        res.status(400).json({
          error:
            "matchSummary generation requires round, season and exactly one grade",
        });
        return;
      }
      const grade = grades[0];
      const ids = await listRoundMatchIds(req, { grade, season, round });
      const details = await Promise.all(
        ids.map((id) => loadMatchDetailForRequest(req, id)),
      );
      inputs = details
        .filter((d): d is NonNullable<typeof d> => d != null)
        // `detail as MatchDetail` mirrors match-summary-drafter.ts — the loaded
        // DTO is the exact shape the /matches/:id route serializes as MatchDetail.
        .map((d) => matchToSummaryInput(d as MatchDetail) as Record<string, unknown>);
      groupSeason = season;
      groupRound = round;
      groupGrade = grade;
      name = `${grade} • Round ${round}`;
    } else {
      // gradeLeader: one top-player card per grade (all grades unless the request
      // names a subset). Category isn't in the body contract — default to Runs,
      // matching the editor's default. Grouping columns stay null (spans grades).
      const gradeList = grades && grades.length ? grades : [...GENERATE_GRADES];
      const boards = await Promise.all(
        gradeList.map((g) => loadGradeLeaderboard(req, g)),
      );
      gradeList.forEach((g, i) => {
        const top = topLeaderRow(boards[i] ?? [], "Runs");
        if (top) inputs.push(gradeLeaderInput(top, g, "Runs"));
      });
      name = "Grade leaderboards";
    }

    if (inputs.length === 0) {
      res.status(400).json({ error: "No source cards found for this selection" });
      return;
    }

    // Delegate assembly + idempotent grouping-key upsert to the shared core
    // (also used by /card-sets/autoseed) so there's ONE implementation.
    const { row, truncated } = await upsertGeneratedCardSet(
      tenantId,
      { sourceKind: kind, season: groupSeason, sourceRound: groupRound, grade: groupGrade },
      { name, platformSize, inputs },
    );
    if (truncated > 0) {
      req.log.warn(
        { kind, gathered: inputs.length, kept: row.slides.length, truncated },
        "card-set generate: clamped to max slides",
      );
    }

    res.json(row);
  },
);

// Auto-seed (C4): turn a round's APPROVED match-summary social drafts into one
// carousel per (season, round, grade), reusing the C3 generate core
// (`upsertGeneratedCardSet`) — same assembly + grouping-key idempotency, so
// re-running a round UPDATES the same set rather than double-posting. Gated by
// the dormant `autoseedCarousels` toggle (default off).
//
// Juniors isolation is enforced on TWO axes: (1) input gathering filters drafts
// by the `junior` flag, so a carousel's slides are all-junior or all-senior; and
// (2) junior sets persist under a distinct `sourceKind` ("matchSummaryJunior"),
// giving them a separate dedupe keyspace so a junior set can never overwrite a
// senior set (or vice-versa) that happens to share the same season/round/grade
// string. Isolation therefore holds at row identity, not just grade-string luck.
router.post(
  "/card-sets/autoseed",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const body = AutoseedCardSetBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const settings = await ensureSettings(tenantId);
    // Dormant unless the tenant has opted in — the endpoint is a no-op (not an
    // error) so an auto-invoking hook stays harmless while disabled.
    if (!settings.autoseedCarousels) {
      res.json({ generated: [], skipped: "disabled" });
      return;
    }

    const { round, season, grade, junior, platformSize } = body.data;

    // Gather this tenant's APPROVED match-summary drafts for the requested
    // junior-ness only (scoping by the flag keeps the two worlds apart).
    const drafts = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKind, "matchSummary"),
          eq(socialDraftsTable.status, "approved"),
          eq(socialDraftsTable.sourceMatchIsJunior, junior),
        ),
      );
    if (drafts.length === 0) {
      res.json({ generated: [], skipped: "no-approved-drafts" });
      return;
    }

    // Look up each draft's match to recover (season, round, grade) — drafts only
    // store the match id. Senior matches carry a numeric round; junior rounds are
    // free text, so parse (and skip unparseable ones).
    const matchIds = Array.from(
      new Set(drafts.map((d) => d.sourceMatchId).filter((id): id is number => id != null)),
    );
    const meta = new Map<number, { season: number; round: number; grade: string }>();
    if (matchIds.length > 0) {
      if (junior) {
        const rows = await db
          .select({
            id: juniorMatchesTable.id,
            season: juniorMatchesTable.seasonStartYear,
            round: juniorMatchesTable.round,
            ageGroup: juniorMatchesTable.ageGroup,
            grade: juniorMatchesTable.grade,
          })
          .from(juniorMatchesTable)
          .where(
            and(
              eq(juniorMatchesTable.tenantId, tenantId),
              inArray(juniorMatchesTable.id, matchIds),
            ),
          );
        for (const r of rows) {
          const rnd = r.round == null ? NaN : parseInt(r.round, 10);
          const g = r.ageGroup ?? r.grade;
          if (r.season == null || Number.isNaN(rnd) || g == null) continue;
          meta.set(r.id, { season: r.season, round: rnd, grade: g });
        }
      } else {
        const rows = await db
          .select({
            id: matchesTable.id,
            season: matchesTable.season,
            round: matchesTable.round,
            grade: matchesTable.grade,
          })
          .from(matchesTable)
          .where(inArray(matchesTable.id, matchIds));
        for (const r of rows) {
          if (r.round == null) continue; // finals (stage-only) have no round
          meta.set(r.id, { season: r.season, round: r.round, grade: r.grade });
        }
      }
    }

    // Annotate + filter to the requested scope; grade is optional (omitted =
    // seed every grade present in that round, one carousel each).
    const forGrouping: AutoseedDraft[] = [];
    for (const d of drafts) {
      if (d.sourceMatchId == null) continue;
      const m = meta.get(d.sourceMatchId);
      if (!m) continue;
      if (m.season !== season || m.round !== round) continue;
      if (grade != null && m.grade !== grade) continue;
      forGrouping.push({
        id: d.id,
        sourceMatchId: d.sourceMatchId,
        junior,
        season: m.season,
        round: m.round,
        grade: m.grade,
        input: d.cardInput as Record<string, unknown>,
      });
    }
    if (forGrouping.length === 0) {
      res.json({ generated: [], skipped: "no-drafts-in-scope" });
      return;
    }

    // One carousel per (junior, season, round, grade). Each group upserts through
    // the SAME core as /card-sets/generate.
    const groups = deriveAutoseedGroups(forGrouping);
    const generated = [];
    for (const g of groups) {
      // Junior sets persist under a DISTINCT sourceKind so junior and senior
      // sets occupy separate dedupe keyspaces in `card_sets_source_dedupe`.
      // Without this a junior autoseed and a senior /card-sets/generate sharing
      // the same (season, round, grade-string) would collide on one row and
      // clobber each other — the juniors-isolation invariant must hold at the
      // STORAGE layer (row identity), not just at in-memory gathering. Re-runs
      // derive the same sourceKind from the same junior flag, so regeneration
      // still finds + updates the correct junior row.
      const setSourceKind = g.junior ? "matchSummaryJunior" : "matchSummary";
      const { row, truncated } = await upsertGeneratedCardSet(
        tenantId,
        { sourceKind: setSourceKind, season: g.season, sourceRound: g.round, grade: g.grade },
        {
          name: `${g.grade} • Round ${g.round}`,
          platformSize,
          inputs: g.inputs,
        },
      );
      if (truncated > 0) {
        req.log.warn(
          { grade: g.grade, round: g.round, gathered: g.inputs.length, truncated },
          "card-set autoseed: clamped to max slides",
        );
      }
      generated.push(row);
    }

    res.json({ generated });
  },
);

router.put("/card-sets/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateCardSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCardSetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const isPublished = body.data.isPublished ?? false;
  if (
    isPublished &&
    (body.data.slides.length < CARD_SET_MIN_SLIDES ||
      body.data.slides.length > CARD_SET_MAX_SLIDES)
  ) {
    res.status(400).json({
      error: `A published carousel must have between ${CARD_SET_MIN_SLIDES} and ${CARD_SET_MAX_SLIDES} slides`,
    });
    return;
  }
  const [row] = await db
    .update(cardSetsTable)
    .set({
      name: body.data.name,
      platformSize: body.data.platformSize,
      slides: body.data.slides as unknown as CardSetSlide[],
      isPublished,
      updatedAt: new Date(),
    })
    .where(and(eq(cardSetsTable.id, params.data.id), eq(cardSetsTable.tenantId, getTenantId(req))))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Card set not found" });
    return;
  }
  res.json(row);
});

router.delete("/card-sets/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardSetsTable)
    .where(and(eq(cardSetsTable.id, params.data.id), eq(cardSetsTable.tenantId, getTenantId(req))))
    .returning({ id: cardSetsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card set not found" });
    return;
  }
  res.status(204).end();
});

export default router;
