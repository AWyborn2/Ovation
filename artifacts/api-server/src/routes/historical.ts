import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  partnershipRecordsTable,
  partnerships50PlusTable,
  centuriesTable,
  fiveWicketHaulsTable,
  playerIdMapTable,
} from "@workspace/db";
import { getRequestCentralClubId, shouldReadCentral } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

// Public read surfaces for the curated historical lists loaded from the master
// database (partnership records, centuries, five-wicket hauls).
//
// Centuries and five-wicket hauls are derivable from scorecards, so central
// tenants get theirs computed from the central PCA database. Partnerships are
// NOT in central (no partnership data), so a central tenant gets an empty list
// — its own curated partnerships, which it hasn't added — rather than another
// club's. Native tenants (Halls Head) keep the curated tables in all three.

/** Map central participant GUIDs to a tenant's int player ids. */
async function playerIdMapForTenant(tenantId: number): Promise<Map<string, number>> {
  const rows = await db
    .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  return new Map(rows.map((r) => [r.participantId, r.playerId]));
}

router.get("/partnerships", async (req, res): Promise<void> => {
  // No partnership data in central — central tenants get their own (empty) list.
  if (await shouldReadCentral(req)) {
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

router.get("/centuries", async (req, res): Promise<void> => {
  if (await shouldReadCentral(req)) {
    const { centralCenturies } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const [rows, idMap] = await Promise.all([
      centralCenturies(await getRequestCentralClubId(req)),
      playerIdMapForTenant(tenantId),
    ]);
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
  if (await shouldReadCentral(req)) {
    const { centralFiveWicketHauls } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const [rows, idMap] = await Promise.all([
      centralFiveWicketHauls(await getRequestCentralClubId(req)),
      playerIdMapForTenant(tenantId),
    ]);
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
    .orderBy(asc(fiveWicketHaulsTable.grade), asc(fiveWicketHaulsTable.bowler), asc(fiveWicketHaulsTable.id));
  res.json(rows);
});

export default router;
