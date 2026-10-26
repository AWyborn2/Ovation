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
import { centralHonourList } from "../lib/honours-lists";

const router: IRouter = Router();

// Public read surfaces for the curated historical lists loaded from the master
// database (partnership records, centuries, five-wicket hauls).
//
// Centuries and five-wicket hauls are derivable from scorecards, so central
// tenants get theirs computed from the central PCA database. Partnerships are
// NOT in central (no partnership data), so every tenant reads its OWN curated
// partnership rows — Halls Head keeps its records after reading central; a club
// that hasn't added any gets an empty list, never another club's.

router.get("/partnerships", async (req, res): Promise<void> => {
  // Curated, tenant-scoped rows whichever source the tenant's stats come from.
  const tenantId = getTenantId(req);
  const [records, fiftyPlus] = await Promise.all([
    db
      .select()
      .from(partnershipRecordsTable)
      .where(eq(partnershipRecordsTable.tenantId, tenantId))
      .orderBy(
        asc(partnershipRecordsTable.grade),
        desc(partnershipRecordsTable.runs),
        asc(partnershipRecordsTable.id),
      ),
    db
      .select()
      .from(partnerships50PlusTable)
      .where(eq(partnerships50PlusTable.tenantId, tenantId))
      .orderBy(desc(partnerships50PlusTable.runs), asc(partnerships50PlusTable.id)),
  ]);
  res.json({ records, fiftyPlus });
});

router.get("/centuries", async (req, res): Promise<void> => {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const tenantId = getTenantId(req);
    const rows = await centralHonourList("century", tenantId, source.clubId);
    res.json(
      rows.map((c, i) => ({
        id: i + 1,
        tenantId,
        playerId: c.playerId,
        grade: c.grade,
        batsman: c.name,
        score: c.detail,
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
    const tenantId = getTenantId(req);
    const rows = await centralHonourList("fiveFor", tenantId, source.clubId);
    res.json(
      rows.map((f, i) => ({
        id: i + 1,
        tenantId,
        playerId: f.playerId,
        grade: f.grade,
        bowler: f.name,
        figures: f.detail,
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
