import {
  db,
  playersTable,
  milestoneEventsTable,
  socialDraftsTable,
  capRegisterTable,
} from "@workspace/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { GRADE_TO_CAP_CATEGORY } from "./cap-sync";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";

// Fill-ins (playerId >= FILL_IN_THRESHOLD) are excluded from every stats
// derivation (match-aggregate.ts, points.ts, roundup.ts, stats.ts), so they
// never accumulate grade games and would otherwise read as a permanent 0 — i.e.
// a debut on every appearance — while never being issued a cap. The floor is
// defined once in @workspace/scorecard.

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

/**
 * A cap freshly issued by this commit's cap-sync. This is now only a FALLBACK
 * source for the debut card's cap number — the cap-register read below is the
 * primary source and already sees these rows, because cap-sync runs inside the
 * commit transaction and that transaction has closed by the time post-commit
 * social runs.
 */
export type CreatedCap = {
  capNumber: number;
  category: "male" | "female";
  playerId: number;
};

export type MatchMilestoneContext = {
  /** Tenant that committed the import — scopes the register read and every write. */
  tenantId: number;
  importId: number;
  grade: string;
  season: number;
  round: number | null;
  opponent: string | null;
  /**
   * Abandoned matches are excluded from every stats derivation
   * (match-aggregate.ts), so they award no grade game and mint no cap. Firing a
   * debut off one would emit a capless card AND burn the fire-once
   * `milestone_events` row, permanently suppressing the player's real debut a
   * week later.
   */
  abandoned: boolean;
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

// `newCap` was a fourth key here. The New Cap card kind was retired in favour
// of `debut` — the same moment, and Debut's fields are a superset (the debut
// card already carries the cap number issued by this commit's cap-sync) — so
// nothing emits a newCap milestone or draft any more.
const MATCH_BOARD_KEYS = ["debut", "century", "fiveFor"] as const;
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
 * Detects: A Grade / Female A Grade debut (carrying the player's cap number
 * READ BACK FROM the tenant's cap register), century (≥100 in an innings), and
 * five-wicket haul. Century / five-for apply to ANY grade; debut is
 * cap-register scoped. Caller gates on `socialSettings.engineMilestone`.
 *
 * Fire-once: existing match-milestone events for the involved players are loaded
 * and used to de-duplicate, so re-imports and undo→re-import cycles (which leave
 * milestone_events in place) never emit a moment twice.
 */
export async function detectAndQueueMatchMilestones(
  ctx: MatchMilestoneContext,
): Promise<void> {
  const {
    tenantId,
    importId,
    grade,
    season,
    round,
    opponent,
    abandoned,
    lines,
    createdCaps,
    gradeGamesBefore,
  } = ctx;
  const capCategory = GRADE_TO_CAP_CATEGORY[grade];
  // An abandoned match awards no grade game and mints no cap, so it can never
  // be a debut. Century / five-for are left alone deliberately — the innings
  // was still played, and that judgement is the club's, not this detector's.
  const isCapGrade = capCategory != null && !abandoned;

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
        eq(milestoneEventsTable.tenantId, tenantId),
        inArray(milestoneEventsTable.playerId, involvedIds),
        inArray(milestoneEventsTable.boardKey, [...MATCH_BOARD_KEYS]),
      ),
    );

  const seenDebut = new Set<string>(); // `${playerId}|${grade}`
  const seenInnings = new Set<string>(); // `${kind}|${playerId}|${grade}|${season}|${round}`
  for (const e of existing) {
    const pl = (e.payload ?? {}) as Record<string, unknown>;
    const g = String(pl.grade ?? "");
    const s = String(pl.season ?? "");
    const r = pl.round == null ? "null" : String(pl.round);
    if (e.boardKey === "debut") seenDebut.add(`${e.playerId}|${g}`);
    else if (e.boardKey === "century" || e.boardKey === "fiveFor")
      seenInnings.add(`${e.boardKey}|${e.playerId}|${g}|${s}|${r}`);
  }

  const roundKey = round == null ? "null" : String(round);
  const detected: Detected[] = [];

  // --- Debut: first-ever game in a cap-register grade (A / Female A Grade).
  if (isCapGrade && capCategory) {
    // The card's cap number comes from the REGISTER, not just from the caps this
    // commit happened to mint. cap-sync runs inside the commit transaction and
    // that transaction has already closed here, so this read sees both the caps
    // minted moments ago AND caps that already existed — a player linked to a
    // cap by an admin, a cap preserved through a rollback, or a debut detected
    // on a non-earliest match of a batch. Every one of those previously rendered
    // a debut card with no cap number.
    //
    // Tenant-filtered: cap_register is curated content, and reading it
    // unfiltered rendered one club's cap numbers as another club's debut
    // milestones once already (see routes/milestones.ts).
    const capRows = await db
      .select({
        playerId: capRegisterTable.playerId,
        capNumber: capRegisterTable.capNumber,
      })
      .from(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, tenantId),
          eq(capRegisterTable.category, capCategory),
          isNotNull(capRegisterTable.playerId),
        ),
      );
    const capByPlayerId = new Map<number, number>();
    for (const c of capRows) {
      if (c.playerId != null) capByPlayerId.set(c.playerId, c.capNumber);
    }

    const handled = new Set<number>();
    for (const l of lines) {
      if (handled.has(l.playerId)) continue;
      handled.add(l.playerId);
      // Fill-ins never accrue grade games and never receive a cap, so without
      // this floor every fill-in appearance reads as a fresh debut.
      if (l.playerId >= FILL_IN_THRESHOLD) continue;
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
            capByPlayerId.get(l.playerId) ??
            createdCaps.find((c) => c.playerId === l.playerId)?.capNumber ??
            null,
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
        tenantId,
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
      tenantId,
      engine: "milestone",
      status: "pending",
      cardInput: d.cardInput,
      appPath: `/players/${d.playerId}`,
      milestoneEventId: event.id,
      sourceImportId: importId,
    });
  }
}
