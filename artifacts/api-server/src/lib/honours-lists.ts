import { eq } from "drizzle-orm";
import { db, centuriesTable, fiveWicketHaulsTable } from "@workspace/db";
import { loadClubOverlay, resolveClubCorrections, type ClubOverlay } from "./club-overlay";
import { overlayHonours, type CuratedHonourRow } from "./club-overlay-surfaces";

/**
 * A central tenant's centuries or five-wicket hauls: the one list the public
 * Centuries / Five-Wicket Hauls pages and the honours display both show.
 *
 * Central rows are derived from the scorecards (seniors only, private players
 * never shown, confirmed merges folded). With an active club overlay they are
 * corrected and joined by the club's own history and curated honours before
 * its boundary (see `overlayHonours`).
 */
export type HonourListKind = "century" | "fiveFor";

export interface HonourListRow {
  /** The tenant player id (crosswalked), when known. */
  playerId: number | null;
  name: string;
  grade: string;
  /** "134*" or "6/23". */
  detail: string;
  /** "YYYY/YY". */
  season: string;
  /** The central match it came in, when it came from a scorecard. */
  matchId: number | null;
}

export async function centralHonourList(
  kind: HonourListKind,
  tenantId: number,
  clubId: number,
): Promise<HonourListRow[]> {
  const central = await import("@workspace/db/central-queries");
  const overlay = await loadClubOverlay(tenantId);
  if (overlay.active) return overlaidHonours(kind, overlay, tenantId, clubId);
  // Confirmed merges: a merged-away GUID's honours show under the keeper.
  const { merges, intByGuid } = overlay.identity;
  if (kind === "century") {
    return (await central.centralCenturies(clubId, merges)).map((c) => ({
      playerId: intByGuid.get(c.participantId) ?? null,
      name: c.displayName ?? "",
      grade: c.grade,
      detail: c.score,
      season: c.season,
      matchId: c.matchId,
    }));
  }
  return (await central.centralFiveWicketHauls(clubId, merges)).map((f) => ({
    playerId: intByGuid.get(f.participantId) ?? null,
    name: f.displayName ?? "",
    grade: f.grade,
    detail: f.figures,
    season: f.season,
    matchId: f.matchId,
  }));
}

/**
 * The list with the club overlay applied: central rows from the boundary on
 * (a correction can add or remove one), the club's own match-grain history and
 * curated honours before it. Only called when the overlay is active.
 */
async function overlaidHonours(
  kind: HonourListKind,
  overlay: ClubOverlay,
  tenantId: number,
  clubId: number,
): Promise<HonourListRow[]> {
  const central = await import("@workspace/db/central-queries");
  const { identity, data } = overlay;
  const [rows, resolved, curated] = await Promise.all([
    kind === "century"
      ? central.centralCenturies(clubId, identity.merges)
      : central.centralFiveWicketHauls(clubId, identity.merges),
    resolveClubCorrections(overlay, tenantId, clubId),
    // The tenant's own curated honours — only consulted for seasons before a
    // boundary, so skip the read when there is none.
    data.boundaries.length === 0
      ? Promise.resolve<CuratedHonourRow[]>([])
      : kind === "century"
        ? db
            .select({
              playerId: centuriesTable.playerId,
              grade: centuriesTable.grade,
              name: centuriesTable.batsman,
              detail: centuriesTable.score,
              season: centuriesTable.season,
            })
            .from(centuriesTable)
            .where(eq(centuriesTable.tenantId, tenantId))
        : db
            .select({
              playerId: fiveWicketHaulsTable.playerId,
              grade: fiveWicketHaulsTable.grade,
              name: fiveWicketHaulsTable.bowler,
              detail: fiveWicketHaulsTable.figures,
              season: fiveWicketHaulsTable.season,
            })
            .from(fiveWicketHaulsTable)
            .where(eq(fiveWicketHaulsTable.tenantId, tenantId)),
  ]);
  // Central names + privacy for the players the plain rows don't already
  // name: the corrected ones and the club-history ones with a central GUID.
  const keepers = new Set<string>();
  for (const c of resolved.lines) keepers.add(identity.canonicalOf(c.after.participantId));
  for (const r of data.history) {
    if (r.grain !== "match") continue;
    const guid = identity.guidForPlayerId(r.playerId);
    if (guid !== null && !guid.startsWith("club:")) keepers.add(guid);
  }
  const names =
    keepers.size > 0 ? await central.centralPlayerNames([...keepers], identity.merges) : new Map();
  return overlayHonours({
    kind,
    rows,
    corrected: resolved.lines,
    identity,
    boundaries: data.boundaries,
    history: data.history,
    curated,
    names,
    isSeniorGrade: central.isSeniorAppGrade,
  }).map((r) => ({
    playerId:
      (r.participantId === null ? undefined : identity.intByGuid.get(r.participantId)) ??
      r.playerId,
    name: r.displayName ?? "",
    grade: r.grade,
    detail: r.detail,
    season: r.season,
    matchId: r.matchId ?? null,
  }));
}

/** Opponent names by central match id, from the club's side. */
export async function centralOpponentsByMatch(clubId: number): Promise<Map<number, string>> {
  const { centralClubMatches } = await import("@workspace/db/central-queries");
  const out = new Map<number, string>();
  for (const m of await centralClubMatches(clubId)) {
    const name = m.opponentClub?.shortName ?? m.opponentClub?.name ?? m.opponent;
    if (name) out.set(m.id, name);
  }
  return out;
}
