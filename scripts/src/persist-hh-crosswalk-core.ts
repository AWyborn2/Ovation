/**
 * persist-hh-crosswalk-core.ts — PURE planning logic behind
 * scripts/src/persist-hh-crosswalk.ts. No database access and no I/O, so every
 * rule is unit-tested (persist-hh-crosswalk.test.ts).
 *
 * Input: the matcher's per-player classification (hh-central-crosswalk-core
 * `linkNativeToCentral`), central privacy flags, the central matches each GUID
 * appears in for the club, and what tenant 1 already has in `player_id_map` /
 * `player_curation`. Output: the exact rows to write, the rows already in
 * place, and a review list of everything deliberately NOT written.
 *
 * Rules (plan U4, KTD2, KTD3):
 *   - CLEAN, non-fill-in players are persisted. Fill-ins (id >= 90000) are
 *     never mapped.
 *   - SPLIT IDENTITIES: an AMBIGUOUS player whose assigned lines are spread over
 *     2+ GUIDs is the same person under several central identities (the native
 *     register already merged them). It is persisted like a CLEAN player —
 *     keeper map row + merges — only when ALL hold:
 *       · no other native player has lines assigned to any of its GUIDs
 *         (else SHARED_GUID);
 *       · every GUID has at least one strong/medium line (else WEAK_ONLY);
 *       · no GUID is private (else PRIVATE_GUID);
 *       · no two of its GUIDs appear in the same central match for the club —
 *         two GUIDs on one scorecard are two people (else SAME_MATCH).
 *     Any other AMBIGUOUS player (single GUID, weak evidence …) goes to the
 *     review list as AMBIGUOUS.
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
 *     private, the secondary carries real (strong/medium) scorecard evidence,
 *     and the two never share a central match.
 */
import { isFillIn, type ParticipantEvidence, type PlayerLink } from "./hh-central-crosswalk-core";

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
  // Split-identity (AMBIGUOUS across the player's own GUIDs) refusals:
  | "SHARED_GUID"
  | "WEAK_ONLY"
  | "PRIVATE_GUID"
  | "SAME_MATCH"
  // Keeper row refusals:
  | "KEEPER_CLAIMED_BY_MULTIPLE_NATIVE"
  | "KEEPER_IS_MERGED_AWAY"
  | "EXISTING_MAP_DIFFERS"
  | "NATIVE_ID_TAKEN"
  // Per-merge refusals (CLEAN players' minor secondary GUIDs):
  | "MERGE_SHARED_GUID"
  | "MERGE_PRIVATE"
  | "MERGE_WEAK_EVIDENCE"
  | "MERGE_SAME_MATCH"
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
    /** Every player the matcher classed AMBIGUOUS (split-resolved ones included). */
    ambiguous: number;
    /** AMBIGUOUS split identities that passed every check and are persisted. */
    splitResolved: number;
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
  /**
   * Participant GUID → the club's central match ids it appears in (any
   * scorecard/roster row). Two GUIDs sharing a match are two people. A GUID
   * missing from the map is treated as appearing in no match.
   */
  centralMatchesByGuid: Map<string, Set<number>>;
  existingMap: ExistingMapRow[];
  existingCuration: ExistingCurationRow[];
}

/** Keep this in step with detectConflicts' "significant" notion: real evidence only. */
const hasSolidEvidence = (c: { strong: number; medium: number }): boolean =>
  c.strong + c.medium > 0;

/** Central matches both GUIDs appear in, ascending. */
function sharedMatches(byGuid: Map<string, Set<number>>, a: string, b: string): number[] {
  const x = byGuid.get(a);
  const y = byGuid.get(b);
  if (!x || !y) return [];
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].filter((m) => big.has(m)).sort((p, q) => p - q);
}

export function planPersistence(input: PersistPlanInput): PersistPlan {
  const { links, privateByGuid, centralMatchesByGuid } = input;
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
    counts: {
      clean: 0,
      ambiguous: 0,
      splitResolved: 0,
      skippedFillIn: 0,
      mapRows: 0,
      mergeRows: 0,
    },
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
  const otherClaimants = (g: string, nativeId: number): number[] =>
    [...(claimants.get(g) ?? [])].filter((id) => id !== nativeId).sort((a, b) => a - b);

  /**
   * Split-identity gate for an AMBIGUOUS player spread over 2+ GUIDs. Returns
   * the first failed condition (checked in a fixed order), or null when the
   * player is safe to persist as keeper + merges.
   */
  const splitRefusal = (l: PlayerLink): Omit<ReviewRow, "nativePlayerId"> | null => {
    const cands: ParticipantEvidence[] = l.candidates;
    for (const c of cands) {
      const others = otherClaimants(c.participantId, l.nativePlayerId);
      if (others.length > 0) {
        return {
          participantId: c.participantId,
          reason: "SHARED_GUID",
          detail: `also assigned to native player(s) ${others.join(", ")}`,
        };
      }
    }
    for (const c of cands) {
      if (!hasSolidEvidence(c)) {
        return {
          participantId: c.participantId,
          reason: "WEAK_ONLY",
          detail: `${c.lines} weak line(s) only (presence/name tie-break)`,
        };
      }
    }
    for (const c of cands) {
      if (isPrivate(c.participantId)) {
        return {
          participantId: c.participantId,
          reason: "PRIVATE_GUID",
          detail: "central marks this participant private",
        };
      }
    }
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i]!.participantId;
        const b = cands[j]!.participantId;
        const shared = sharedMatches(centralMatchesByGuid, a, b);
        if (shared.length > 0) {
          return {
            participantId: b,
            reason: "SAME_MATCH",
            detail: `${a} and ${b} both appear in central match(es) ${shared.join(", ")} — two people`,
          };
        }
      }
    }
    return null;
  };

  for (const l of links) {
    if (isFillIn(l.nativePlayerId) || l.status === "EXCLUDED_FILL_IN") {
      plan.counts.skippedFillIn += 1;
      continue;
    }
    const nativeId = l.nativePlayerId;
    const reviewRow = (reason: ReviewReason, detail: string, pid: string | null): void => {
      plan.review.push({ nativePlayerId: nativeId, participantId: pid, reason, detail });
    };

    let split = false;
    if (l.status === "AMBIGUOUS") {
      plan.counts.ambiguous += 1;
      if (l.candidates.length < 2 || !l.participantId) {
        reviewRow("AMBIGUOUS", l.notes.join("; "), l.participantId);
        continue;
      }
      const refusal = splitRefusal(l);
      if (refusal) {
        plan.review.push({ nativePlayerId: nativeId, ...refusal });
        continue;
      }
      split = true;
    } else if (l.status === "CLEAN" && l.participantId) {
      plan.counts.clean += 1;
    } else {
      continue;
    }

    const keeper = l.participantId;
    const review = (reason: ReviewReason, detail: string, pid: string | null = keeper): void =>
      reviewRow(reason, detail, pid);

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
    if (split) plan.counts.splitResolved += 1;

    // ---- Merges of the player's other GUIDs into the keeper ------------
    // (For a split identity the gate above already proved every GUID safe; the
    // per-merge checks below then only ever trip on existing curation rows.)
    for (const c of l.candidates) {
      const g = c.participantId;
      if (g === keeper) continue;
      const others = otherClaimants(g, nativeId);
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
      const shared = sharedMatches(centralMatchesByGuid, keeper, g);
      if (shared.length > 0) {
        review(
          "MERGE_SAME_MATCH",
          `${g} and keeper ${keeper} both appear in central match(es) ${shared.join(", ")}`,
          g,
        );
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
