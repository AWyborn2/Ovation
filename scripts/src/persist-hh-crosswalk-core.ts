/**
 * persist-hh-crosswalk-core.ts — PURE planning logic behind
 * scripts/src/persist-hh-crosswalk.ts. No database access and no I/O, so every
 * rule is unit-tested (persist-hh-crosswalk.test.ts).
 *
 * Input: the matcher's per-player classification (hh-central-crosswalk-core
 * `linkNativeToCentral`), central privacy flags, and what tenant 1 already has
 * in `player_id_map` / `player_curation`. Output: the exact rows to write, the
 * rows already in place, and a review list of everything deliberately NOT
 * written.
 *
 * Rules (plan U4, KTD2, KTD3):
 *   - Only CLEAN, non-fill-in players are persisted. AMBIGUOUS players go to the
 *     review list only. Fill-ins (id >= 90000) are never mapped.
 *   - The keeper GUID is the player's top candidate (most assigned lines — the
 *     order `classifyPlayer` already sorts by). Tenant 1's crosswalk row maps
 *     keeper → native `players.id`, so every curated link stays valid.
 *   - Every other GUID assigned to that player becomes a curation merge into the
 *     keeper (`player_curation.merged_into_participant_id`). The crosswalk stays
 *     1:1 — merged-away GUIDs get no new crosswalk row here.
 *   - Nothing that already exists is overwritten: a different existing mapping
 *     or merge is reported for review, never replaced. Re-running is a no-op.
 *   - A merge is only written when it is safe to fold two GUIDs into one person:
 *     the secondary GUID is claimed by no other native player, neither side is
 *     private, and the secondary carries real (strong/medium) scorecard evidence.
 */
import { isFillIn, type PlayerLink } from "./hh-central-crosswalk-core";

export interface ExistingMapRow {
  participantId: string;
  playerId: number;
}

export interface ExistingCurationRow {
  participantId: string;
  mergedIntoParticipantId: string | null;
}

export type ReviewReason =
  | "AMBIGUOUS"
  | "KEEPER_CLAIMED_BY_MULTIPLE_NATIVE"
  | "KEEPER_IS_MERGED_AWAY"
  | "EXISTING_MAP_DIFFERS"
  | "NATIVE_ID_TAKEN"
  | "MERGE_SHARED_GUID"
  | "MERGE_PRIVATE"
  | "MERGE_WEAK_EVIDENCE"
  | "MERGE_EXISTING_DIFFERS";

export interface ReviewRow {
  nativePlayerId: number;
  participantId: string | null;
  reason: ReviewReason;
  detail: string;
}

export interface PlannedMapRow {
  nativePlayerId: number;
  participantId: string;
  playerId: number;
}

export interface PlannedMerge {
  nativePlayerId: number;
  participantId: string;
  keeperParticipantId: string;
  /** Insert a new curation row, or set merged_into on an existing (unmerged) one. */
  kind: "insert" | "update";
}

export interface PersistPlan {
  mapInserts: PlannedMapRow[];
  mapUnchanged: PlannedMapRow[];
  merges: PlannedMerge[];
  mergesUnchanged: PlannedMerge[];
  review: ReviewRow[];
  counts: {
    clean: number;
    ambiguous: number;
    skippedFillIn: number;
    /** Keeper rows in place after commit (new + unchanged). */
    mapRows: number;
    /** Merges in place after commit (new + unchanged). */
    mergeRows: number;
  };
}

export interface PersistPlanInput {
  links: PlayerLink[];
  /** Participant GUID → central is_private. Unknown GUIDs count as not private. */
  privateByGuid: Map<string, boolean>;
  existingMap: ExistingMapRow[];
  existingCuration: ExistingCurationRow[];
}

/** Keep this in step with detectConflicts' "significant" notion: real evidence only. */
const hasSolidEvidence = (c: { strong: number; medium: number }): boolean =>
  c.strong + c.medium > 0;

export function planPersistence(input: PersistPlanInput): PersistPlan {
  const { links, privateByGuid } = input;
  const isPrivate = (g: string): boolean => privateByGuid.get(g) === true;
  const mapByGuid = new Map(input.existingMap.map((r) => [r.participantId, r.playerId]));
  const guidByPlayerId = new Map(input.existingMap.map((r) => [r.playerId, r.participantId]));
  const curationByGuid = new Map(
    input.existingCuration.map((r) => [r.participantId, r.mergedIntoParticipantId]),
  );

  const plan: PersistPlan = {
    mapInserts: [],
    mapUnchanged: [],
    merges: [],
    mergesUnchanged: [],
    review: [],
    counts: { clean: 0, ambiguous: 0, skippedFillIn: 0, mapRows: 0, mergeRows: 0 },
  };

  // Which native players claim each GUID at all (any candidate, any status bar
  // fill-ins), and which CLEAN players pick it as keeper.
  const claimants = new Map<string, Set<number>>();
  const keeperOf = new Map<string, number[]>();
  for (const l of links) {
    if (isFillIn(l.nativePlayerId) || l.status === "EXCLUDED_FILL_IN") continue;
    for (const c of l.candidates) {
      const s = claimants.get(c.participantId) ?? new Set<number>();
      s.add(l.nativePlayerId);
      claimants.set(c.participantId, s);
    }
    if (l.status === "CLEAN" && l.participantId) {
      const arr = keeperOf.get(l.participantId) ?? [];
      arr.push(l.nativePlayerId);
      keeperOf.set(l.participantId, arr);
    }
  }

  for (const l of links) {
    if (isFillIn(l.nativePlayerId) || l.status === "EXCLUDED_FILL_IN") {
      plan.counts.skippedFillIn += 1;
      continue;
    }
    if (l.status === "AMBIGUOUS") {
      plan.counts.ambiguous += 1;
      plan.review.push({
        nativePlayerId: l.nativePlayerId,
        participantId: l.participantId,
        reason: "AMBIGUOUS",
        detail: l.notes.join("; "),
      });
      continue;
    }
    if (l.status !== "CLEAN" || !l.participantId) continue;
    plan.counts.clean += 1;

    const keeper = l.participantId;
    const nativeId = l.nativePlayerId;
    const review = (reason: ReviewReason, detail: string, pid: string | null = keeper): void => {
      plan.review.push({ nativePlayerId: nativeId, participantId: pid, reason, detail });
    };

    // ---- Keeper crosswalk row -----------------------------------------
    const rivals = (keeperOf.get(keeper) ?? []).filter((id) => id !== nativeId);
    if (rivals.length > 0) {
      review(
        "KEEPER_CLAIMED_BY_MULTIPLE_NATIVE",
        `also the keeper for native player(s) ${rivals.join(", ")}`,
      );
      continue;
    }
    if (curationByGuid.get(keeper)) {
      review("KEEPER_IS_MERGED_AWAY", `already merged into ${curationByGuid.get(keeper)}`);
      continue;
    }
    const mapped = mapByGuid.get(keeper);
    if (mapped != null && mapped !== nativeId) {
      review("EXISTING_MAP_DIFFERS", `tenant 1 already maps this GUID to player ${mapped}`);
      continue;
    }
    const holder = guidByPlayerId.get(nativeId);
    if (holder != null && holder !== keeper) {
      review("NATIVE_ID_TAKEN", `player id ${nativeId} is already mapped to ${holder}`);
      continue;
    }
    const row = { nativePlayerId: nativeId, participantId: keeper, playerId: nativeId };
    if (mapped === nativeId) plan.mapUnchanged.push(row);
    else plan.mapInserts.push(row);

    // ---- Merges of the player's other GUIDs into the keeper ------------
    for (const c of l.candidates) {
      const g = c.participantId;
      if (g === keeper) continue;
      const others = [...(claimants.get(g) ?? [])].filter((id) => id !== nativeId);
      if (others.length > 0) {
        review("MERGE_SHARED_GUID", `also assigned to native player(s) ${others.join(", ")}`, g);
        continue;
      }
      if (isPrivate(g) || isPrivate(keeper)) {
        review("MERGE_PRIVATE", `private GUID in merge ${g} → ${keeper}`, g);
        continue;
      }
      if (!hasSolidEvidence(c)) {
        review("MERGE_WEAK_EVIDENCE", `${c.lines} weak line(s) only`, g);
        continue;
      }
      const existing = curationByGuid.get(g);
      const merge = {
        nativePlayerId: nativeId,
        participantId: g,
        keeperParticipantId: keeper,
      };
      if (existing === keeper) {
        plan.mergesUnchanged.push({ ...merge, kind: "update" });
      } else if (existing) {
        review("MERGE_EXISTING_DIFFERS", `already merged into ${existing}`, g);
      } else {
        plan.merges.push({ ...merge, kind: curationByGuid.has(g) ? "update" : "insert" });
      }
    }
  }

  plan.counts.mapRows = plan.mapInserts.length + plan.mapUnchanged.length;
  plan.counts.mergeRows = plan.merges.length + plan.mergesUnchanged.length;
  return plan;
}

/** Arguments the persist script accepts (anything else is refused). */
export const PERSIST_ALLOWED_FLAGS = new Set(["--tenant", "--commit", "--out", "--help", "-h"]);

export interface PersistArgs {
  tenantId: number;
  commit: boolean;
  out: string | undefined;
}

/**
 * Validate argv. `--tenant` is required (KTD9) and must be 1: this script only
 * knows Halls Head's native id space. Returns the parsed args or an error.
 */
export function parsePersistArgs(argv: string[]): PersistArgs | { error: string } {
  for (const a of argv) {
    const flag = a.split("=")[0] ?? a;
    if (!PERSIST_ALLOWED_FLAGS.has(flag)) return { error: `Unknown argument: ${a}` };
  }
  const tenantRaw = argv.find((a) => a.startsWith("--tenant="))?.slice("--tenant=".length);
  if (tenantRaw == null) return { error: "--tenant=1 is required." };
  if (tenantRaw !== "1") {
    return { error: `--tenant=${tenantRaw} refused: only Halls Head (tenant 1) is supported.` };
  }
  return {
    tenantId: 1,
    commit: argv.includes("--commit"),
    out: argv.find((a) => a.startsWith("--out="))?.slice("--out=".length),
  };
}
