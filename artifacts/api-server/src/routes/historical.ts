import { Router, type IRouter } from "express";
import { asc, desc } from "drizzle-orm";
import {
  db,
  partnershipRecordsTable,
  partnerships50PlusTable,
  centuriesTable,
  fiveWicketHaulsTable,
} from "@workspace/db";

const router: IRouter = Router();

// Public read surfaces for the curated historical lists loaded from the master
// database (partnership records, centuries, five-wicket hauls).

router.get("/partnerships", async (_req, res): Promise<void> => {
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

router.get("/centuries", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(centuriesTable)
    .orderBy(asc(centuriesTable.grade), asc(centuriesTable.batsman), asc(centuriesTable.id));
  res.json(rows);
});

router.get("/five-wicket-hauls", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(fiveWicketHaulsTable)
    .orderBy(asc(fiveWicketHaulsTable.grade), asc(fiveWicketHaulsTable.bowler), asc(fiveWicketHaulsTable.id));
  res.json(rows);
});

export default router;
