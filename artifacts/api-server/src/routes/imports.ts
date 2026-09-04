import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, importsTable } from "@workspace/db";
import { shouldReadCentral } from "../lib/tenant";
import { requireAdmin } from "../middlewares/require-admin";
import { IMPORT_SUMMARY_COLUMNS } from "../lib/import-commit";
import csvRouter from "./imports-csv";
import scorecardRouter from "./imports-scorecard";
import batchRouter from "./imports-batch";

/**
 * `/imports` — the admin import surface, composed from one router per upload
 * kind. This module owns only the import log and the composition; the
 * handlers live in:
 *
 *  - `imports-csv.ts`       PlayCricket CSV season snapshot, plus the generic
 *                           `POST /imports/:id/commit` and `DELETE /imports/:id`
 *  - `imports-scorecard.ts` single .xlsx match scorecard upload/preview
 *  - `imports-batch.ts`     whole-season batch upload / revalidate / commit,
 *                           and `undo-season`
 *
 * and the shared commit/rollback core in `lib/import-commit.ts`. Sub-routers
 * are mounted in the order the routes were originally registered.
 */
const router: IRouter = Router();

// The import log is admin-only: filenames, grades and seasons of every upload
// are operational detail, not public stats. It also lives in the native
// (tenant #1) tables, so a central tenant gets an empty list rather than the
// demo club's history.
router.get("/imports", requireAdmin, async (req, res): Promise<void> => {
  if (await shouldReadCentral(req)) {
    res.json([]);
    return;
  }
  const rows = await db
    .select(IMPORT_SUMMARY_COLUMNS)
    .from(importsTable)
    .orderBy(desc(importsTable.importedAt));
  res.json(rows);
});

router.use(csvRouter);
router.use(scorecardRouter);
router.use(batchRouter);

export default router;
