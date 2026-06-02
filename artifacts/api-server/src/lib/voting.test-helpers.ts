import {
  db,
  pool,
  awardsTable,
  awardWinnersTable,
  awardVotingConfigTable,
  awardBallotsTable,
  captainsTable,
  captainGradePermissionsTable,
  importsTable,
  matchesTable,
  matchPlayerLinesTable,
  playersTable,
  type AwardVotingConfigRow,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/** A self-contained voting scenario created in the real (dev) database. */
export type VotingScenario = {
  awardId: number;
  configId: number;
  captainId: number;
  importId: number;
  matchIds: number[];
  playerIds: number[];
  config: AwardVotingConfigRow;
  cleanup: () => Promise<void>;
};

let suffixCounter = 0;
function uniqueSuffix(): string {
  suffixCounter += 1;
  return `${Date.now().toString(36)}_${process.pid}_${suffixCounter}`;
}

export type ScenarioOptions = {
  grade?: string;
  season?: number;
  votingEnabled?: boolean;
  votingOpen?: boolean;
  tallyVisible?: boolean;
  autoHideAfterRounds?: number | null;
  /** How many players to create. */
  playerCount?: number;
  /** Round numbers to create as imported (non-abandoned) matches. */
  rounds?: number[];
};

/**
 * Creates an award, voting config, a captain (with grade permission), N players,
 * an import and the requested rounds (each a non-abandoned match with every
 * player on its scorecard). Returns ids plus a cleanup that removes everything.
 */
export async function createVotingScenario(
  opts: ScenarioOptions = {},
): Promise<VotingScenario> {
  const grade = opts.grade ?? "A Grade";
  const season = opts.season ?? 2099;
  const playerCount = opts.playerCount ?? 4;
  const rounds = opts.rounds ?? [1];
  const sfx = uniqueSuffix();

  const players = await db
    .insert(playersTable)
    .values(
      Array.from({ length: playerCount }, (_, i) => ({
        surname: `Test${sfx}`,
        givenName: `P${String(i + 1).padStart(2, "0")}`,
      })),
    )
    .returning();
  const playerIds = players.map((p) => p.id);

  const [award] = await db
    .insert(awardsTable)
    .values({
      key: `test_award_${sfx}`,
      title: `Test Award ${sfx}`,
      votingEnabled: true,
    })
    .returning();

  const [config] = await db
    .insert(awardVotingConfigTable)
    .values({
      awardId: award.id,
      season,
      votingEnabled: opts.votingEnabled ?? true,
      votingOpen: opts.votingOpen ?? true,
      grades: [grade],
      tallyVisible: opts.tallyVisible ?? false,
      autoHideAfterRounds: opts.autoHideAfterRounds ?? null,
    })
    .returning();

  const [captain] = await db
    .insert(captainsTable)
    .values({
      username: `test_captain_${sfx}`,
      displayName: `Test Captain ${sfx}`,
      passwordHash: "x",
    })
    .returning();
  await db
    .insert(captainGradePermissionsTable)
    .values({ captainId: captain.id, grade });

  const [imp] = await db
    .insert(importsTable)
    .values({
      filename: `test_${sfx}.xlsx`,
      grade,
      season,
      kind: "match",
      status: "committed",
    })
    .returning();

  const matchIds: number[] = [];
  for (const round of rounds) {
    const [match] = await db
      .insert(matchesTable)
      .values({
        importId: imp.id,
        grade,
        season,
        round,
        opponent: `Opp ${round}`,
        matchDate: "2099-01-01",
        abandoned: false,
      })
      .returning();
    matchIds.push(match.id);
    await db.insert(matchPlayerLinesTable).values(
      playerIds.map((pid) => ({
        matchId: match.id,
        playerId: pid,
      })),
    );
  }

  const cleanup = async (): Promise<void> => {
    // award cascade removes config, ballots and winners; import cascade removes
    // matches and their lines; captain cascade removes grade perms and ballots.
    await db.delete(awardsTable).where(eq(awardsTable.id, award.id));
    await db.delete(importsTable).where(eq(importsTable.id, imp.id));
    await db.delete(captainsTable).where(eq(captainsTable.id, captain.id));
    if (playerIds.length > 0) {
      await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
    }
  };

  return {
    awardId: award.id,
    configId: config.id,
    captainId: captain.id,
    importId: imp.id,
    matchIds,
    playerIds,
    config,
    cleanup,
  };
}

/** Insert a ballot directly (bypasses the route) for tally-computation tests. */
export async function insertBallot(args: {
  configId: number;
  captainId: number;
  grade: string;
  round: number;
  pick1PlayerId: number;
  pick2PlayerId: number;
  pick3PlayerId: number;
}): Promise<void> {
  await db.insert(awardBallotsTable).values(args);
}

export async function getWinners(awardId: number, season: number) {
  return db
    .select()
    .from(awardWinnersTable)
    .where(eq(awardWinnersTable.awardId, awardId));
}

export async function closePool(): Promise<void> {
  await pool.end();
}
