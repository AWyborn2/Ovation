import {
  db,
  playersTable,
  milestoneEventsTable,
  socialDraftsTable,
} from "@workspace/db";
import { and, inArray } from "drizzle-orm";
import { GRADE_TO_CAP_CATEGORY } from "./cap-sync";

/** One player's batting/bowling figures for the committed match. */
export type MatchMilestoneLine = {
  playerId: number;
  runs: number | null;
  balls: number | null;
  notOut: boolean;
  wickets: number | null;
  runsConceded: number | null;
  overs: string | null;
};

/** A cap freshly issued by this commit's cap-sync (drives new-cap milestones). */
export type CreatedCap = {
  capNumber: number;
  category: "male" | "female";
  playerId: number;
  name: string;
};

export type MatchMilestoneContext = {
  importId: number;
  grade: string;
  season: number;
  round: number | null;
  opponent: string | null;
  lines: MatchMilestoneLine[];
  createdCaps: CreatedCap[];
  /**
   * Per-player game count in this match's grade BEFORE the commit. A player at 0
   * who appears in this match crossed 0→1 in that grade, i.e. a debut. Because
   * this is captured pre-commit, re-importing the same round never re-fires
   * (the player already shows ≥1 game).
   */
  gradeGamesBefore: Map<number, number>;
};

const MATCH_BOARD_KEYS = ["debut", "newCap", "century", "fiveFor"] as const;
type MatchBoardKey = (typeof MATCH_BOARD_KEYS)[number];

type Detected = {
  playerId: number;
  boardKey: MatchBoardKey;
  tierIndex: number;
  tierLabel: string;
  value: number;
  threshold: number;
  payload: Record<string, unknown>;
  cardInput: Record<string, unknown>;
};

/**
 * Detect and queue per-match milestone cards after a match commit. Mirrors the
 * career-crossing milestone flow in post-commit-social.ts: each milestone gets a
 * `milestone_events` row plus a `social_drafts` row (engine "milestone"), so it
 * runs through the same admin queue and posted/dismissed lifecycle.
 *
 * Detects: A Grade / Female A Grade debut, new cap #N, century (≥100 in an
 * innings), and five-wicket haul. Century / five-for apply to ANY grade; debut +
 * cap are cap-register scoped. Caller gates on `socialSettings.engineMilestone`.
 *
 * Fire-once: existing match-milestone events for the involved players are loaded
 * and used to de-duplicate, so re-imports and undo→re-import cycles (which leave
 * milestone_events in place) never emit a moment twice.
 */
export async function detectAndQueueMatchMilestones(
  ctx: MatchMilestoneContext,
): Promise<void> {
  const {
    importId,
    grade,
    season,
    round,
    opponent,
    lines,
    createdCaps,
    gradeGamesBefore,
  } = ctx;
  const isCapGrade = GRADE_TO_CAP_CATEGORY[grade] != null;

  const involvedIds = Array.from(
    new Set<number>([
      ...lines.map((l) => l.playerId),
      ...createdCaps.map((c) => c.playerId),
    ]),
  );
  if (involvedIds.length === 0) return;

  const playerRows = await db
    .select({
      id: playersTable.id,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
      imageUrl: playersTable.imageUrl,
    })
    .from(playersTable)
    .where(inArray(playersTable.id, involvedIds));
  const nameById = new Map<number, string>();
  const photoById = new Map<number, string | null>();
  for (const p of playerRows) {
    nameById.set(p.id, `${p.givenName} ${p.surname}`.trim());
    photoById.set(p.id, p.imageUrl ?? null);
  }
  const nameFor = (id: number) => nameById.get(id) ?? "Unknown";
  const photoFor = (id: number) => photoById.get(id) ?? null;

  // Already-emitted match milestones for these players — the de-dup basis.
  const existing = await db
    .select({
      playerId: milestoneEventsTable.playerId,
      boardKey: milestoneEventsTable.boardKey,
      value: milestoneEventsTable.value,
      payload: milestoneEventsTable.payload,
    })
    .from(milestoneEventsTable)
    .where(
      and(
        inArray(milestoneEventsTable.playerId, involvedIds),
        inArray(milestoneEventsTable.boardKey, [...MATCH_BOARD_KEYS]),
      ),
    );

  const seenDebut = new Set<string>(); // `${playerId}|${grade}`
  const seenNewCap = new Set<string>(); // `${category}|${capNumber}`
  const seenInnings = new Set<string>(); // `${kind}|${playerId}|${grade}|${season}|${round}`
  for (const e of existing) {
    const pl = (e.payload ?? {}) as Record<string, unknown>;
    const g = String(pl.grade ?? "");
    const s = String(pl.season ?? "");
    const r = pl.round == null ? "null" : String(pl.round);
    if (e.boardKey === "debut") seenDebut.add(`${e.playerId}|${g}`);
    else if (e.boardKey === "newCap")
      seenNewCap.add(`${String(pl.category ?? "")}|${e.value}`);
    else if (e.boardKey === "century" || e.boardKey === "fiveFor")
      seenInnings.add(`${e.boardKey}|${e.playerId}|${g}|${s}|${r}`);
  }

  const roundKey = round == null ? "null" : String(round);
  const detected: Detected[] = [];

  // --- Debut: first-ever game in a cap-register grade (A / Female A Grade).
  if (isCapGrade) {
    const handled = new Set<number>();
    for (const l of lines) {
      if (handled.has(l.playerId)) continue;
      handled.add(l.playerId);
      if ((gradeGamesBefore.get(l.playerId) ?? 0) > 0) continue;
      const key = `${l.playerId}|${grade}`;
      if (seenDebut.has(key)) continue;
      seenDebut.add(key);
      const name = nameFor(l.playerId);
      detected.push({
        playerId: l.playerId,
        boardKey: "debut",
        tierIndex: 4,
        tierLabel: `${grade} Debut`,
        value: 1,
        threshold: 0,
        payload: { name, grade, season, round, opponent },
        cardInput: {
          kind: "debut",
          playerName: name,
          grade,
          capNumber:
            createdCaps.find((c) => c.playerId === l.playerId)?.capNumber ?? null,
          season:
            season != null
              ? `${season}/${String((season + 1) % 100).padStart(2, "0")}`
              : null,
          opponent: opponent ?? null,
          round: round ?? null,
          photoUrl: photoFor(l.playerId),
        },
      });
    }
  }

  // --- New cap: caps freshly issued by this commit's cap-sync.
  for (const c of createdCaps) {
    const key = `${c.category}|${c.capNumber}`;
    if (seenNewCap.has(key)) continue;
    seenNewCap.add(key);
    const name = nameById.get(c.playerId) ?? c.name;
    detected.push({
      playerId: c.playerId,
      boardKey: "newCap",
      tierIndex: 0,
      tierLabel: `${grade} Cap #${c.capNumber}`,
      value: c.capNumber,
      threshold: 0,
      payload: {
        name,
        grade,
        season,
        round,
        opponent,
        category: c.category,
        capNumber: c.capNumber,
      },
      cardInput: {
        kind: "newCap",
        playerName: name,
        grade,
        category: c.category,
        capNumber: c.capNumber,
        photoUrl: photoFor(c.playerId),
      },
    });
  }

  // --- Century / five-wicket haul: per innings/spell in this match.
  const centHandled = new Set<number>();
  const fiveHandled = new Set<number>();
  for (const l of lines) {
    const runs = l.runs ?? 0;
    if (runs >= 100 && !centHandled.has(l.playerId)) {
      centHandled.add(l.playerId);
      const key = `century|${l.playerId}|${grade}|${season}|${roundKey}`;
      if (!seenInnings.has(key)) {
        seenInnings.add(key);
        const name = nameFor(l.playerId);
        detected.push({
          playerId: l.playerId,
          boardKey: "century",
          tierIndex: 1,
          tierLabel: "Century",
          value: runs,
          threshold: 100,
          payload: {
            name,
            grade,
            season,
            round,
            opponent,
            runs,
            balls: l.balls ?? null,
            notOut: l.notOut,
          },
          cardInput: {
            kind: "century",
            playerName: name,
            grade,
            runs,
            balls: l.balls ?? null,
            notOut: l.notOut,
            opponent: opponent ?? null,
            round: round ?? null,
            photoUrl: photoFor(l.playerId),
          },
        });
      }
    }

    const wkts = l.wickets ?? 0;
    if (wkts >= 5 && !fiveHandled.has(l.playerId)) {
      fiveHandled.add(l.playerId);
      const key = `fiveFor|${l.playerId}|${grade}|${season}|${roundKey}`;
      if (!seenInnings.has(key)) {
        seenInnings.add(key);
        const name = nameFor(l.playerId);
        const figures = `${wkts}/${l.runsConceded ?? "-"}`;
        detected.push({
          playerId: l.playerId,
          boardKey: "fiveFor",
          tierIndex: 2,
          tierLabel: "Five-Wicket Haul",
          value: wkts,
          threshold: 5,
          payload: {
            name,
            grade,
            season,
            round,
            opponent,
            wickets: wkts,
            runsConceded: l.runsConceded ?? null,
            overs: l.overs ?? null,
            figures,
          },
          cardInput: {
            kind: "fiveFor",
            playerName: name,
            grade,
            wickets: wkts,
            runsConceded: l.runsConceded ?? null,
            overs: l.overs ?? null,
            figures,
            opponent: opponent ?? null,
            round: round ?? null,
            photoUrl: photoFor(l.playerId),
          },
        });
      }
    }
  }

  for (const d of detected) {
    const [event] = await db
      .insert(milestoneEventsTable)
      .values({
        playerId: d.playerId,
        boardKey: d.boardKey,
        tierIndex: d.tierIndex,
        tierLabel: d.tierLabel,
        value: d.value,
        threshold: d.threshold,
        source: "import",
        sourceImportId: importId,
        payload: d.payload,
      })
      .returning();
    await db.insert(socialDraftsTable).values({
      engine: "milestone",
      status: "pending",
      cardInput: d.cardInput,
      appPath: `/players/${d.playerId}`,
      milestoneEventId: event.id,
      sourceImportId: importId,
    });
  }
}
