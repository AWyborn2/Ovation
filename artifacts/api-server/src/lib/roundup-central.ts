import { eq } from "drizzle-orm";
import { db, playerIdMapTable } from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { getTenantCentralClubId } from "./tenant";
import { resolveCuration } from "./central-curation";
import {
  BOARD_STAT_LABEL,
  TIER_LABELS,
  TIER_THRESHOLDS,
  type BoardKey,
} from "./milestone-detector";
import type { InningsRow, PerformerRow, RoundUpData } from "./roundup";

/**
 * Central-data clubs' round-up and season-recap figures (Social Studio). The
 * central reads live in `@workspace/db/central-queries` (senior grades only,
 * private players omitted, rows keyed by participant GUID); this module turns
 * them into the native row shapes `roundup.ts` builds cards from, so both read
 * paths produce the same card set and the same source keys.
 *
 * Identity follows the crosswalk pattern
 * (docs/solutions/architecture-patterns/central-read-player-identity-crosswalk.md):
 * the GUID resolves to the app player id through THIS tenant's `player_id_map`.
 * A GUID with no row (or one that maps to a fill-in id) keeps its card but
 * loses the player link — `playerId: null`, which `playerPath` turns into the
 * players list. Names come from the club's curation overlay first.
 */

/** One milestone card's figures, shared by the native and central recap paths. */
export type MilestoneCardRow = {
  playerId: number | null;
  playerName: string;
  tierLabel: string;
  tierIndex: number;
  milestoneLabel: string;
  value: number;
  threshold: number;
};

type Identity = {
  playerIdFor: (participantId: string) => number | null;
  nameFor: (participantId: string, displayName: string | null) => string;
};

/** The tenant's GUID → app id crosswalk plus its display-name overrides. */
async function loadIdentity(tenantId: number): Promise<Identity> {
  const [mapRows, curation] = await Promise.all([
    db
      .select({
        participantId: playerIdMapTable.participantId,
        playerId: playerIdMapTable.playerId,
      })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId)),
    resolveCuration(tenantId),
  ]);
  const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
  return {
    playerIdFor: (participantId) => {
      const id = intByGuid.get(participantId);
      return id != null && id > 0 && id < FILL_IN_THRESHOLD ? id : null;
    },
    nameFor: (participantId, displayName) =>
      curation.nameByGuid.get(participantId) ?? displayName ?? "Unknown",
  };
}

/** "M Brown" → { givenName: "M", surname: "Brown" }, so fullName() rebuilds it. */
function nameParts(name: string): { givenName: string; surname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { givenName: parts[0] ?? "", surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] ?? "" };
}

/**
 * Round-up inputs for a central club's (grade, season). Rows are ordered by
 * name then GUID so a tie for "top" resolves the same way on every run.
 */
export async function loadCentralGradeSeason(
  tenantId: number,
  grade: string,
  season: number,
): Promise<RoundUpData> {
  const { centralGradeSeasonSocial } = await import("@workspace/db/central-queries");
  const clubId = await getTenantCentralClubId(tenantId);
  const [raw, identity] = await Promise.all([
    centralGradeSeasonSocial(clubId, grade, season),
    loadIdentity(tenantId),
  ]);

  const byName = <T extends { participantId: string; displayName: string | null }>(
    rows: T[],
  ): Array<T & { name: string }> =>
    rows
      .map((r) => ({ ...r, name: identity.nameFor(r.participantId, r.displayName) }))
      .sort(
        (a, b) => a.name.localeCompare(b.name) || a.participantId.localeCompare(b.participantId),
      );

  const performers: PerformerRow[] = byName(raw.performers).map((r) => ({
    playerId: identity.playerIdFor(r.participantId),
    runs: r.runs,
    wickets: r.wickets,
    dismissals: r.dismissals,
    ...nameParts(r.name),
  }));
  const innings: InningsRow[] = byName(raw.innings).map((r) => ({
    playerId: identity.playerIdFor(r.participantId),
    ...nameParts(r.name),
    highScore: r.highScore,
    bestBowling: r.bestBowling,
  }));
  return { performers, innings, latestRound: raw.latestRound };
}

/**
 * Career tiers a central club's players crossed in a (grade, season). Uses the
 * same honour-board tiers and labels as the native import detector, so a
 * milestone card reads identically whichever path drafted it.
 */
export async function loadCentralRecapMilestones(
  tenantId: number,
  grade: string,
  season: number,
): Promise<MilestoneCardRow[]> {
  const { centralMilestones } = await import("@workspace/db/central-queries");
  const clubId = await getTenantCentralClubId(tenantId);
  const [raw, identity] = await Promise.all([
    centralMilestones(clubId, TIER_THRESHOLDS, { seniorOnly: true }),
    loadIdentity(tenantId),
  ]);

  const out: MilestoneCardRow[] = [];
  for (const m of raw) {
    // seniorOnly: junior / pathway matches add nothing to the running totals,
    // and private players and junior-grade crossings are already omitted.
    if (m.kind !== "career" || m.grade !== grade || m.season !== season) continue;
    const key = (m.boardKey ?? "games") as BoardKey;
    const tierIndex = m.tierIndex ?? 0;
    const threshold = m.threshold ?? m.value;
    out.push({
      playerId: identity.playerIdFor(m.participantId),
      playerName: identity.nameFor(m.participantId, m.displayName),
      tierLabel: TIER_LABELS[key]?.[tierIndex] ?? `${threshold} ${BOARD_STAT_LABEL[key]}`,
      tierIndex,
      milestoneLabel: BOARD_STAT_LABEL[key] ?? key,
      value: m.value,
      threshold,
    });
  }
  return out;
}
