import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  awardsTable,
  awardWinnersTable,
  awardVotingConfigTable,
  awardBallotsTable,
  captainsTable,
  matchesTable,
  type AwardVotingConfigRow,
} from "@workspace/db";
import {
  UpsertAwardVotingConfigBody,
  UpsertAwardVotingConfigParams,
  UpdateAwardVotingConfigBody,
  UpdateAwardVotingConfigParams,
  DeleteAwardVotingConfigParams,
  ListAwardVotingConfigsParams,
  GetVotingConfigTallyParams,
  ListVotingConfigBallotsParams,
  FinaliseVotingConfigParams,
  SubmitBallotBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireCaptain, type RequestWithCaptain } from "../middlewares/require-captain";
import {
  computeTally,
  isTallyVisible,
  loadPlayerNames,
  loadRoundsForGrade,
  type TallyEntry,
} from "../lib/voting";

const router: IRouter = Router();

function serializeConfig(c: AwardVotingConfigRow) {
  return {
    id: c.id,
    awardId: c.awardId,
    season: c.season,
    votingEnabled: c.votingEnabled,
    votingOpen: c.votingOpen,
    grades: c.grades,
    tallyVisible: c.tallyVisible,
    autoHideAfterRounds: c.autoHideAfterRounds ?? null,
    finalisedAt: c.finalisedAt ? c.finalisedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

async function tallyResponse(
  config: AwardVotingConfigRow,
  award: { id: number; key: string; title: string },
  forcedVisible: boolean,
) {
  const { entries, winnerPlayerIds, roundsPlayed } = await computeTally(config);
  const visible = forcedVisible || isTallyVisible(config, roundsPlayed);
  return {
    configId: config.id,
    awardId: award.id,
    awardKey: award.key,
    awardTitle: award.title,
    season: config.season,
    visible,
    votingOpen: config.votingOpen,
    finalised: config.finalisedAt != null,
    roundsPlayed,
    entries: visible ? entries : ([] as TallyEntry[]),
    winnerPlayerIds: visible ? winnerPlayerIds : [],
  };
}

function normaliseGrades(grades: string[]): string[] {
  return [...new Set(grades.map((g) => g.trim()).filter((g) => g.length > 0))];
}

// ---- Admin: voting config ----

router.get("/awards/:id/voting", requireAdmin, async (req, res): Promise<void> => {
  const params = ListAwardVotingConfigsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.awardId, params.data.id))
    .orderBy(desc(awardVotingConfigTable.season));
  res.json(rows.map(serializeConfig));
});

router.post("/awards/:id/voting", requireAdmin, async (req, res): Promise<void> => {
  const params = UpsertAwardVotingConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpsertAwardVotingConfigBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [award] = await db.select().from(awardsTable).where(eq(awardsTable.id, params.data.id));
  if (!award) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  const grades = normaliseGrades(body.data.grades);
  const values = {
    awardId: params.data.id,
    season: body.data.season,
    votingEnabled: body.data.votingEnabled ?? true,
    votingOpen: body.data.votingOpen ?? true,
    grades,
    tallyVisible: body.data.tallyVisible ?? false,
    autoHideAfterRounds: body.data.autoHideAfterRounds ?? null,
  };
  const [existing] = await db
    .select()
    .from(awardVotingConfigTable)
    .where(
      and(
        eq(awardVotingConfigTable.awardId, params.data.id),
        eq(awardVotingConfigTable.season, body.data.season),
      ),
    );
  let row: AwardVotingConfigRow;
  if (existing) {
    [row] = await db
      .update(awardVotingConfigTable)
      .set(values)
      .where(eq(awardVotingConfigTable.id, existing.id))
      .returning();
  } else {
    [row] = await db.insert(awardVotingConfigTable).values(values).returning();
  }
  // Keep the award's votingEnabled flag in sync so it shows as a voted award.
  if (values.votingEnabled && !award.votingEnabled) {
    await db
      .update(awardsTable)
      .set({ votingEnabled: true })
      .where(eq(awardsTable.id, award.id));
  }
  res.json(serializeConfig(row));
});

router.patch("/voting-configs/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAwardVotingConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAwardVotingConfigBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const patch: Partial<AwardVotingConfigRow> = {};
  if (body.data.votingEnabled !== undefined) patch.votingEnabled = body.data.votingEnabled;
  if (body.data.votingOpen !== undefined) patch.votingOpen = body.data.votingOpen;
  if (body.data.grades !== undefined) patch.grades = normaliseGrades(body.data.grades);
  if (body.data.tallyVisible !== undefined) patch.tallyVisible = body.data.tallyVisible;
  if (body.data.autoHideAfterRounds !== undefined) {
    patch.autoHideAfterRounds = body.data.autoHideAfterRounds;
  }
  if (Object.keys(patch).length === 0) {
    const [row] = await db
      .select()
      .from(awardVotingConfigTable)
      .where(eq(awardVotingConfigTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json(serializeConfig(row));
    return;
  }
  const [row] = await db
    .update(awardVotingConfigTable)
    .set(patch)
    .where(eq(awardVotingConfigTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  res.json(serializeConfig(row));
});

router.delete("/voting-configs/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAwardVotingConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/voting-configs/:id/tally", requireAdmin, async (req, res): Promise<void> => {
  const params = GetVotingConfigTallyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [config] = await db
    .select()
    .from(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.id, params.data.id));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  const [award] = await db.select().from(awardsTable).where(eq(awardsTable.id, config.awardId));
  if (!award) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  res.json(await tallyResponse(config, award, true));
});

router.get("/voting-configs/:id/ballots", requireAdmin, async (req, res): Promise<void> => {
  const params = ListVotingConfigBallotsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ballots = await db
    .select({
      id: awardBallotsTable.id,
      captainId: awardBallotsTable.captainId,
      captainName: captainsTable.displayName,
      grade: awardBallotsTable.grade,
      round: awardBallotsTable.round,
      pick1PlayerId: awardBallotsTable.pick1PlayerId,
      pick2PlayerId: awardBallotsTable.pick2PlayerId,
      pick3PlayerId: awardBallotsTable.pick3PlayerId,
      updatedAt: awardBallotsTable.updatedAt,
    })
    .from(awardBallotsTable)
    .innerJoin(captainsTable, eq(captainsTable.id, awardBallotsTable.captainId))
    .where(eq(awardBallotsTable.configId, params.data.id))
    .orderBy(asc(awardBallotsTable.grade), asc(awardBallotsTable.round));

  const names = await loadPlayerNames(
    ballots.flatMap((b) => [b.pick1PlayerId, b.pick2PlayerId, b.pick3PlayerId]),
  );
  const nameOf = (id: number) => names.get(id) ?? `#${id}`;
  res.json(
    ballots.map((b) => ({
      id: b.id,
      captainId: b.captainId,
      captainName: b.captainName,
      grade: b.grade,
      round: b.round,
      pick1PlayerId: b.pick1PlayerId,
      pick2PlayerId: b.pick2PlayerId,
      pick3PlayerId: b.pick3PlayerId,
      pick1Name: nameOf(b.pick1PlayerId),
      pick2Name: nameOf(b.pick2PlayerId),
      pick3Name: nameOf(b.pick3PlayerId),
      updatedAt: b.updatedAt.toISOString(),
    })),
  );
});

router.post("/voting-configs/:id/finalise", requireAdmin, async (req, res): Promise<void> => {
  const params = FinaliseVotingConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [config] = await db
    .select()
    .from(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.id, params.data.id));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  const [award] = await db.select().from(awardsTable).where(eq(awardsTable.id, config.awardId));
  if (!award) {
    res.status(404).json({ error: "Award not found" });
    return;
  }

  const { winnerPlayerIds } = await computeTally(config);
  const names = await loadPlayerNames(winnerPlayerIds);

  // Replace any previously-finalised winners for this award+season so finalise
  // is idempotent and reflects the latest tally.
  await db
    .delete(awardWinnersTable)
    .where(
      and(
        eq(awardWinnersTable.awardId, award.id),
        eq(awardWinnersTable.season, config.season),
      ),
    );
  if (winnerPlayerIds.length > 0) {
    await db.insert(awardWinnersTable).values(
      winnerPlayerIds.map((playerId, i) => ({
        awardId: award.id,
        season: config.season,
        playerId,
        name: names.get(playerId) ?? `#${playerId}`,
        displayOrder: i,
      })),
    );
  }
  await db
    .update(awardVotingConfigTable)
    .set({ votingOpen: false, finalisedAt: new Date() })
    .where(eq(awardVotingConfigTable.id, config.id));

  const winners = await db
    .select()
    .from(awardWinnersTable)
    .where(eq(awardWinnersTable.awardId, award.id))
    .orderBy(
      desc(awardWinnersTable.season),
      asc(awardWinnersTable.displayOrder),
      asc(awardWinnersTable.id),
    );
  res.json({ ...award, votingEnabled: award.votingEnabled, winners });
});

// ---- Public: visible tallies ----

router.get("/award-tallies", async (_req, res): Promise<void> => {
  const configs = await db
    .select()
    .from(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.votingEnabled, true));
  if (configs.length === 0) {
    res.json([]);
    return;
  }
  const awards = await db
    .select()
    .from(awardsTable)
    .where(inArray(awardsTable.id, [...new Set(configs.map((c) => c.awardId))]));
  const awardById = new Map(awards.map((a) => [a.id, a]));

  const out = [];
  for (const config of configs) {
    const award = awardById.get(config.awardId);
    if (!award) continue;
    const tally = await tallyResponse(config, award, false);
    if (tally.visible) out.push(tally);
  }
  res.json(out);
});

// ---- Captain: voting board + ballot submission ----

router.get("/captain/voting", requireCaptain, async (req, res): Promise<void> => {
  const r = req as RequestWithCaptain;
  const captain = r.captain!;
  const myGrades = r.captainGrades ?? [];
  if (myGrades.length === 0) {
    res.json([]);
    return;
  }
  const configs = await db
    .select()
    .from(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.votingEnabled, true))
    .orderBy(desc(awardVotingConfigTable.season));

  const myBallots = await db
    .select()
    .from(awardBallotsTable)
    .where(eq(awardBallotsTable.captainId, captain.id));

  const out = [];
  for (const config of configs) {
    const trackedForMe = config.grades.filter((g) => myGrades.includes(g));
    if (trackedForMe.length === 0) continue;
    const [award] = await db
      .select({ id: awardsTable.id, title: awardsTable.title })
      .from(awardsTable)
      .where(eq(awardsTable.id, config.awardId));
    if (!award) continue;

    const finalised = config.finalisedAt != null;
    const locked = !config.votingOpen || finalised;
    const grades = [];
    for (const grade of trackedForMe) {
      const rounds = await loadRoundsForGrade(grade, config.season);
      grades.push({
        grade,
        rounds: rounds.map((rd) => {
          const ballot = myBallots.find(
            (b) =>
              b.configId === config.id && b.grade === grade && b.round === rd.round,
          );
          return {
            round: rd.round,
            matchId: rd.matchId,
            opponent: rd.opponent,
            matchDate: rd.matchDate,
            players: rd.players,
            locked,
            ballot: ballot
              ? {
                  id: ballot.id,
                  configId: ballot.configId,
                  captainId: ballot.captainId,
                  grade: ballot.grade,
                  round: ballot.round,
                  pick1PlayerId: ballot.pick1PlayerId,
                  pick2PlayerId: ballot.pick2PlayerId,
                  pick3PlayerId: ballot.pick3PlayerId,
                  updatedAt: ballot.updatedAt.toISOString(),
                }
              : null,
          };
        }),
      });
    }
    out.push({
      configId: config.id,
      awardId: award.id,
      awardTitle: award.title,
      season: config.season,
      votingOpen: config.votingOpen,
      grades,
    });
  }
  res.json(out);
});

router.post("/captain/ballots", requireCaptain, async (req, res): Promise<void> => {
  const r = req as RequestWithCaptain;
  const captain = r.captain!;
  const myGrades = r.captainGrades ?? [];
  const body = SubmitBallotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { configId, grade, round, pick1PlayerId, pick2PlayerId, pick3PlayerId } = body.data;

  const picks = [pick1PlayerId, pick2PlayerId, pick3PlayerId];
  if (new Set(picks).size !== 3) {
    res.status(400).json({ error: "The three picks must be different players" });
    return;
  }
  if (!myGrades.includes(grade)) {
    res.status(403).json({ error: "You are not permitted to vote for this grade" });
    return;
  }
  const [config] = await db
    .select()
    .from(awardVotingConfigTable)
    .where(eq(awardVotingConfigTable.id, configId));
  if (!config) {
    res.status(404).json({ error: "Voting config not found" });
    return;
  }
  if (!config.votingEnabled || !config.votingOpen || config.finalisedAt != null) {
    res.status(409).json({ error: "Voting is closed for this award" });
    return;
  }
  if (!config.grades.includes(grade)) {
    res.status(400).json({ error: "This grade is not tracked by the award" });
    return;
  }

  // The round must be an imported, non-abandoned match for this grade+season,
  // and every pick must have actually played it.
  const [match] = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.grade, grade),
        eq(matchesTable.season, config.season),
        eq(matchesTable.round, round),
        eq(matchesTable.abandoned, false),
      ),
    );
  if (!match) {
    res.status(409).json({ error: "That round has no imported scorecard yet" });
    return;
  }
  const eligible = await loadRoundsForGrade(grade, config.season);
  const thisRound = eligible.find((rd) => rd.round === round);
  const eligibleIds = new Set((thisRound?.players ?? []).map((p) => p.playerId));
  if (!picks.every((id) => eligibleIds.has(id))) {
    res.status(400).json({ error: "All picks must be players who played that match" });
    return;
  }

  const [existing] = await db
    .select()
    .from(awardBallotsTable)
    .where(
      and(
        eq(awardBallotsTable.configId, configId),
        eq(awardBallotsTable.captainId, captain.id),
        eq(awardBallotsTable.grade, grade),
        eq(awardBallotsTable.round, round),
      ),
    );
  let row;
  if (existing) {
    [row] = await db
      .update(awardBallotsTable)
      .set({ pick1PlayerId, pick2PlayerId, pick3PlayerId, updatedAt: new Date() })
      .where(eq(awardBallotsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(awardBallotsTable)
      .values({
        configId,
        captainId: captain.id,
        grade,
        round,
        pick1PlayerId,
        pick2PlayerId,
        pick3PlayerId,
      })
      .returning();
  }
  res.json({
    id: row.id,
    configId: row.configId,
    captainId: row.captainId,
    grade: row.grade,
    round: row.round,
    pick1PlayerId: row.pick1PlayerId,
    pick2PlayerId: row.pick2PlayerId,
    pick3PlayerId: row.pick3PlayerId,
    updatedAt: row.updatedAt.toISOString(),
  });
});

export default router;
