import { and, eq, isNull } from "drizzle-orm";
import { db, playerCurationTable, type MergeStatus } from "@workspace/db";
import type { CentralIdentityEvidence } from "@workspace/db/central-queries";
import { buildCurationOverlay, findMergeProblem } from "./central-curation";
import { getTenantCentralClubId, TenantNotFoundError } from "./tenant";

/**
 * Duplicate-player suggestions (hybrid stats plan U7, R9/R10, KTD2).
 *
 * PlayHQ sometimes mints two participant GUIDs for one person, which splits
 * their career in central. This engine finds likely splits for a tenant's
 * central club and records them as `suggested` curation merges for an admin to
 * confirm or reject. Only a CONFIRMED merge folds careers (club-overlay.ts);
 * suggesting changes nothing a visitor sees.
 *
 * A pair is a candidate only when ALL of these hold:
 *   - both GUIDs played (senior) for the club;
 *   - they never appear in the same central match (either side) — two GUIDs
 *     on one scorecard are two people, whatever their names;
 *   - their display names reduce to the same "Initial Surname";
 *   - neither is private;
 *   - no curation row already links them, in either direction and in any
 *     state. A rejected pair is therefore never re-suggested; an admin
 *     reopens it instead.
 * A name match alone never suggests a pair: the never-in-the-same-match
 * evidence is required. Candidates rank by season adjacency, then grade
 * overlap, then combined games.
 *
 * Confirmed merges already on file are applied first, so a merged group is
 * judged as one player (its matches are the union of its members').
 *
 * Nothing here writes to central, and nothing here drafts social cards: a
 * suggestion is a review state only, and confirming one goes through the
 * curation route, which never touches the draft sweep (KTD8).
 */

/** Per-GUID evidence the engine judges (the central read's shape). */
export type EvidenceInput = Pick<
  CentralIdentityEvidence,
  "participantId" | "displayName" | "isPrivate" | "games" | "seasons" | "grades" | "allMatchIds"
>;

/** One GUID's evidence as the review screen shows it. */
export interface GuidEvidence {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  games: number;
  /** Season labels ("2024/25"), ascending. */
  seasons: string[];
  grades: string[];
}

/** A candidate pair: `duplicate` would fold into `keeper`. */
export interface DuplicateCandidate {
  keeper: GuidEvidence;
  duplicate: GuidEvidence;
  /** Seasons between the two careers (0 when they overlap); null when unknown. */
  seasonGap: number | null;
  sharedGrades: string[];
}

/** A tenant curation row, as far as the planner cares. */
export interface ExistingMergeRow {
  participantId: string;
  mergedIntoParticipantId: string | null;
  mergeStatus: MergeStatus | null;
}

/** A new suggestion to persist: `participantId` points at `keeperId`. */
export interface PlannedSuggestion {
  participantId: string;
  keeperId: string;
}

/** 2024 -> "2024/25". */
export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * The "initial surname" a display name reduces to ("Chris Phelps" and
 * "C. Phelps" both give "c phelps"), or null when there is no surname to
 * compare. Accents and punctuation inside the surname are dropped.
 */
export function nameKey(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const tokens = displayName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length < 2) return null;
  return `${tokens[0]![0]} ${tokens[tokens.length - 1]}`;
}

export function toGuidEvidence(e: EvidenceInput): GuidEvidence {
  return {
    participantId: e.participantId,
    displayName: e.displayName,
    isPrivate: e.isPrivate,
    games: e.games,
    seasons: [...e.seasons].sort((a, b) => a - b).map(seasonLabel),
    grades: [...e.grades].sort((a, b) => a.localeCompare(b)),
  };
}

/** Smallest distance between two sets of season start years (0 when they share one). */
export function seasonGapOf(a: readonly number[], b: readonly number[]): number | null {
  if (a.length === 0 || b.length === 0) return null;
  let best = Infinity;
  for (const x of a) for (const y of b) best = Math.min(best, Math.abs(x - y));
  return best;
}

export function sharedGradesOf(a: readonly string[], b: readonly string[]): string[] {
  const bs = new Set(b);
  return [...new Set(a)].filter((g) => bs.has(g)).sort((x, y) => x.localeCompare(y));
}

/** Best candidates first: adjacent seasons, then shared grades, then more games. */
function compareCandidates(x: DuplicateCandidate, y: DuplicateCandidate): number {
  const gx = x.seasonGap ?? Infinity;
  const gy = y.seasonGap ?? Infinity;
  if (gx !== gy) return gx - gy;
  if (x.sharedGrades.length !== y.sharedGrades.length) {
    return y.sharedGrades.length - x.sharedGrades.length;
  }
  const games = (c: DuplicateCandidate) => c.keeper.games + c.duplicate.games;
  if (games(x) !== games(y)) return games(y) - games(x);
  const key = (c: DuplicateCandidate) => `${c.keeper.participantId}|${c.duplicate.participantId}`;
  return key(x).localeCompare(key(y));
}

/**
 * Candidate duplicate pairs among a club's GUIDs, best first. `merges` are the
 * tenant's CONFIRMED merges (merged-away GUID -> keeper, chains collapsed):
 * each merged group is judged as one player under its keeper.
 */
export function findDuplicateCandidates(
  evidence: readonly EvidenceInput[],
  merges: ReadonlyMap<string, string>,
): DuplicateCandidate[] {
  // Fold each confirmed group into one player under its keeper.
  const membersByKeeper = new Map<string, EvidenceInput[]>();
  for (const e of evidence) {
    const keeper = merges.get(e.participantId) ?? e.participantId;
    const list = membersByKeeper.get(keeper) ?? [];
    list.push(e);
    membersByKeeper.set(keeper, list);
  }
  const groups: EvidenceInput[] = [];
  for (const [keeper, members] of membersByKeeper) {
    const own = members.find((m) => m.participantId === keeper) ?? members[0]!;
    groups.push({
      participantId: keeper,
      displayName: own.displayName,
      isPrivate: members.some((m) => m.isPrivate),
      games: members.reduce((n, m) => n + m.games, 0),
      seasons: [...new Set(members.flatMap((m) => m.seasons))],
      grades: [...new Set(members.flatMap((m) => m.grades))],
      allMatchIds: [...new Set(members.flatMap((m) => m.allMatchIds))],
    });
  }

  // Bucket public groups by name key; only same-key groups can pair.
  const buckets = new Map<string, (EvidenceInput & { matchSet: Set<number> })[]>();
  for (const g of groups) {
    if (g.isPrivate) continue;
    const key = nameKey(g.displayName);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push({ ...g, matchSet: new Set(g.allMatchIds) });
    buckets.set(key, list);
  }

  const out: DuplicateCandidate[] = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const [small, large] = a.matchSet.size <= b.matchSet.size ? [a, b] : [b, a];
        let shared = false;
        for (const m of small.matchSet) {
          if (large.matchSet.has(m)) {
            shared = true;
            break;
          }
        }
        if (shared) continue; // on one scorecard together: two people
        const aKeeps =
          a.games > b.games || (a.games === b.games && a.participantId < b.participantId);
        const [keeper, duplicate] = aKeeps ? [a, b] : [b, a];
        out.push({
          keeper: toGuidEvidence(keeper),
          duplicate: toGuidEvidence(duplicate),
          seasonGap: seasonGapOf(keeper.seasons, duplicate.seasons),
          sharedGrades: sharedGradesOf(keeper.grades, duplicate.grades),
        });
      }
    }
  }
  return out.sort(compareCandidates);
}

/**
 * Which candidates to persist as new `suggested` rows. A curation row holds at
 * most one merge link per GUID, so a pair is written as duplicate -> keeper
 * when the duplicate is free, else keeper -> duplicate when the keeper is, and
 * skipped when neither is. A pair already linked in either direction (any
 * state — so rejected pairs stay rejected) is skipped, and so is any link that
 * would loop. Idempotent: running it again over its own output plans nothing.
 */
export function planNewSuggestions(
  candidates: readonly DuplicateCandidate[],
  existing: readonly ExistingMergeRow[],
): PlannedSuggestion[] {
  const outgoing = new Map<string, string>(); // any state
  const liveEdges = new Map<string, string>(); // not rejected (what can chain)
  for (const r of existing) {
    if (!r.mergedIntoParticipantId) continue;
    outgoing.set(r.participantId, r.mergedIntoParticipantId);
    if (r.mergeStatus !== "rejected") liveEdges.set(r.participantId, r.mergedIntoParticipantId);
  }

  const planned: PlannedSuggestion[] = [];
  for (const c of candidates) {
    const k = c.keeper.participantId;
    const d = c.duplicate.participantId;
    if (outgoing.get(d) === k || outgoing.get(k) === d) continue; // already known
    const tryLink = (from: string, to: string): boolean => {
      if (outgoing.has(from)) return false;
      if (findMergeProblem(liveEdges, from, to) !== null) return false;
      outgoing.set(from, to);
      liveEdges.set(from, to);
      planned.push({ participantId: from, keeperId: to });
      return true;
    };
    if (!tryLink(d, k)) tryLink(k, d);
  }
  return planned;
}

/** A persisted merge row with both GUIDs' evidence, for the review screen. */
export interface DuplicatePair extends Omit<DuplicateCandidate, "keeper" | "duplicate"> {
  participantId: string;
  keeperParticipantId: string;
  status: MergeStatus;
  updatedAt: string;
  keeper: GuidEvidence;
  duplicate: GuidEvidence;
}

export interface DuplicateReview {
  suggested: DuplicatePair[];
  confirmed: DuplicatePair[];
  rejected: DuplicatePair[];
}

const PRIVATE_NAME = "Private player";

/** Evidence for a GUID with nothing on file for the club (e.g. data reloaded). */
function emptyEvidence(participantId: string): GuidEvidence {
  return { participantId, displayName: null, isPrivate: false, games: 0, seasons: [], grades: [] };
}

/** Hide a private GUID's name on the review screen (its stats stay hidden everywhere). */
function masked(e: GuidEvidence): GuidEvidence {
  return e.isPrivate ? { ...e, displayName: PRIVATE_NAME } : e;
}

/**
 * Shape a tenant's merge rows into the review lists. Evidence is per raw GUID
 * (as PlayHQ has it), so a confirmed pair still shows what each GUID brought.
 * Suggested pairs keep the engine's ranking; the others are newest first.
 */
export function buildDuplicateReview(
  rows: readonly (ExistingMergeRow & { updatedAt: Date })[],
  evidence: readonly EvidenceInput[],
): DuplicateReview {
  const byId = new Map(evidence.map((e) => [e.participantId, toGuidEvidence(e)]));
  const raw = new Map(evidence.map((e) => [e.participantId, e]));
  const review: DuplicateReview = { suggested: [], confirmed: [], rejected: [] };
  for (const r of rows) {
    if (!r.mergedIntoParticipantId || !r.mergeStatus) continue;
    const dupRaw = raw.get(r.participantId);
    const keepRaw = raw.get(r.mergedIntoParticipantId);
    const pair: DuplicatePair = {
      participantId: r.participantId,
      keeperParticipantId: r.mergedIntoParticipantId,
      status: r.mergeStatus,
      updatedAt: r.updatedAt.toISOString(),
      keeper: masked(
        byId.get(r.mergedIntoParticipantId) ?? emptyEvidence(r.mergedIntoParticipantId),
      ),
      duplicate: masked(byId.get(r.participantId) ?? emptyEvidence(r.participantId)),
      seasonGap: dupRaw && keepRaw ? seasonGapOf(keepRaw.seasons, dupRaw.seasons) : null,
      sharedGrades: dupRaw && keepRaw ? sharedGradesOf(keepRaw.grades, dupRaw.grades) : [],
    };
    review[r.mergeStatus].push(pair);
  }
  review.suggested.sort(compareCandidates);
  const newest = (a: DuplicatePair, b: DuplicatePair) => b.updatedAt.localeCompare(a.updatedAt);
  review.confirmed.sort(newest);
  review.rejected.sort(newest);
  return review;
}

async function loadCurationRows(tenantId: number) {
  return db
    .select({
      participantId: playerCurationTable.participantId,
      overrideDisplayName: playerCurationTable.overrideDisplayName,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
      mergeStatus: playerCurationTable.mergeStatus,
      updatedAt: playerCurationTable.updatedAt,
    })
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId));
}

/**
 * Run the engine for a tenant: persist any new suggestions (idempotently),
 * then return the review lists. A tenant with no central club has nothing to
 * review.
 */
export async function refreshDuplicateReview(tenantId: number): Promise<DuplicateReview> {
  let clubId: number;
  try {
    clubId = await getTenantCentralClubId(tenantId);
  } catch (err) {
    if (err instanceof TenantNotFoundError) return { suggested: [], confirmed: [], rejected: [] };
    throw err;
  }
  const { centralClubIdentityEvidence } = await import("@workspace/db/central-queries");
  const evidence = await centralClubIdentityEvidence(clubId);

  let rows = await loadCurationRows(tenantId);
  const merges = buildCurationOverlay(rows).canonicalByGuid;
  const plan = planNewSuggestions(findDuplicateCandidates(evidence, merges), rows);
  if (plan.length > 0) {
    const now = new Date();
    for (const p of plan) {
      // Insert, or fill a rename-only row; a row that gained a merge link in
      // the meantime (a concurrent run or an admin) is left alone.
      await db
        .insert(playerCurationTable)
        .values({
          tenantId,
          participantId: p.participantId,
          mergedIntoParticipantId: p.keeperId,
          mergeStatus: "suggested",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [playerCurationTable.tenantId, playerCurationTable.participantId],
          set: { mergedIntoParticipantId: p.keeperId, mergeStatus: "suggested", updatedAt: now },
          setWhere: and(
            eq(playerCurationTable.tenantId, tenantId),
            isNull(playerCurationTable.mergedIntoParticipantId),
          ),
        });
    }
    rows = await loadCurationRows(tenantId);
  }
  return buildDuplicateReview(rows, evidence);
}
