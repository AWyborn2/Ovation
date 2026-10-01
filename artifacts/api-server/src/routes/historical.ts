import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  partnershipRecordsTable,
  partnerships50PlusTable,
  centuriesTable,
  fiveWicketHaulsTable,
} from "@workspace/db";
import { dataSource } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";
import { loadClubOverlay, resolveClubCorrections, type ClubOverlay } from "../lib/club-overlay";
import {
  overlayHonours,
  type CuratedHonourRow,
  type OverlayHonourRow,
} from "../lib/club-overlay-surfaces";

const router: IRouter = Router();

// Public read surfaces for the curated historical lists loaded from the master
// database (partnership records, centuries, five-wicket hauls).
//
// Centuries and five-wicket hauls are derivable from scorecards, so central
// tenants get theirs computed from the central PCA database. Partnerships are
// NOT in central (no partnership data), so a central tenant gets an empty list
// — its own curated partnerships, which it hasn't added — rather than another
// club's. Native tenants (Halls Head) keep the curated tables in all three.

router.get("/partnerships", async (req, res): Promise<void> => {
  // No partnership data in central — central tenants get their own (empty) list.
  const source = await dataSource(req);
  if (source.kind === "central") {
    res.json({ records: [], fiftyPlus: [] });
    return;
  }
  const [records, fiftyPlus] = await Promise.all([
    db
      .select()
      .from(partnershipRecordsTable)
      .orderBy(
        asc(partnershipRecordsTable.grade),
        desc(partnershipRecordsTable.runs),
        asc(partnershipRecordsTable.id),
      ),
    db
      .select()
      .from(partnerships50PlusTable)
      .orderBy(desc(partnerships50PlusTable.runs), asc(partnerships50PlusTable.id)),
  ]);
  res.json({ records, fiftyPlus });
});

/**
 * A central tenant's centuries (or five-wicket hauls) with its club overlay
 * applied: central rows from the boundary on (a correction can add or remove
 * one), the club's own match-grain history and curated honours before it.
 * Only called when the overlay is active.
 */
async function overlaidHonours(
  kind: "century" | "fiveFor",
  overlay: ClubOverlay,
  tenantId: number,
  clubId: number,
): Promise<(OverlayHonourRow & { resolvedPlayerId: number | null })[]> {
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
    ...r,
    resolvedPlayerId:
      (r.participantId === null ? undefined : identity.intByGuid.get(r.participantId)) ??
      r.playerId,
  }));
}

router.get("/centuries", async (req, res): Promise<void> => {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralCenturies } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const overlay = await loadClubOverlay(tenantId);
    if (overlay.active) {
      const rows = await overlaidHonours("century", overlay, tenantId, source.clubId);
      res.json(
        rows.map((c, i) => ({
          id: i + 1,
          tenantId,
          playerId: c.resolvedPlayerId,
          grade: c.grade,
          batsman: c.displayName ?? "",
          score: c.detail,
          season: c.season,
        })),
      );
      return;
    }
    // Confirmed merges: a merged-away GUID's hundreds show under the keeper.
    const { merges, intByGuid: idMap } = overlay.identity;
    const rows = await centralCenturies(source.clubId, merges);
    res.json(
      rows.map((c, i) => ({
        id: i + 1,
        tenantId,
        playerId: idMap.get(c.participantId) ?? null,
        grade: c.grade,
        batsman: c.displayName ?? "",
        score: c.score,
        season: c.season,
      })),
    );
    return;
  }
  const rows = await db
    .select()
    .from(centuriesTable)
    .orderBy(asc(centuriesTable.grade), asc(centuriesTable.batsman), asc(centuriesTable.id));
  res.json(rows);
});

router.get("/five-wicket-hauls", async (req, res): Promise<void> => {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralFiveWicketHauls } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const overlay = await loadClubOverlay(tenantId);
    if (overlay.active) {
      const rows = await overlaidHonours("fiveFor", overlay, tenantId, source.clubId);
      res.json(
        rows.map((f, i) => ({
          id: i + 1,
          tenantId,
          playerId: f.resolvedPlayerId,
          grade: f.grade,
          bowler: f.displayName ?? "",
          figures: f.detail,
          season: f.season,
        })),
      );
      return;
    }
    const { merges, intByGuid: idMap } = overlay.identity;
    const rows = await centralFiveWicketHauls(source.clubId, merges);
    res.json(
      rows.map((f, i) => ({
        id: i + 1,
        tenantId,
        playerId: idMap.get(f.participantId) ?? null,
        grade: f.grade,
        bowler: f.displayName ?? "",
        figures: f.figures,
        season: f.season,
      })),
    );
    return;
  }
  const rows = await db
    .select()
    .from(fiveWicketHaulsTable)
    .orderBy(
      asc(fiveWicketHaulsTable.grade),
      asc(fiveWicketHaulsTable.bowler),
      asc(fiveWicketHaulsTable.id),
    );
  res.json(rows);
});

export default router;
