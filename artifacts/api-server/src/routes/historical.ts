import { Router, type IRouter } from "express";
import { asc, desc } from "drizzle-orm";
import {
  db,
  partnershipRecordsTable,
  partnerships50PlusTable,
  centuriesTable,
  fiveWicketHaulsTable,
} from "@workspace/db";
import { dataSource } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";
import { loadClubIdentity } from "../lib/club-overlay";

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

router.get("/centuries", async (req, res): Promise<void> => {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralCenturies } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    // Confirmed merges: a merged-away GUID's hundreds show under the keeper.
    const { merges, intByGuid: idMap } = await loadClubIdentity(tenantId);
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
    const { merges, intByGuid: idMap } = await loadClubIdentity(tenantId);
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
