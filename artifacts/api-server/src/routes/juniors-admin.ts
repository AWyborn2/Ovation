import { Router, type IRouter } from "express";
import matchesRouter from "./juniors-admin-matches";
import linesRouter from "./juniors-admin-lines";
import participantsRouter from "./juniors-admin-participants";
import correctionsRouter from "./juniors-admin-corrections";

/**
 * JUNIORS ADMIN (stat-correction) API. The junior_* tables are read-only dump
 * data fully replaced by every juniors ETL reload, so admins could never fix
 * source errors — until this module. Each endpoint is write-through + journal:
 *
 *   1. the target junior row is updated directly, so every live-computed
 *      junior aggregate (leaderboards, profiles, dashboards) is immediately
 *      correct with no recompute step; and
 *   2. the change is recorded in junior_stat_corrections (with a pre-image),
 *      which the ETL re-applies after its full replace — corrections survive
 *      reloads, and the journal doubles as the audit trail + revert source.
 *
 * The juniors-isolation rule holds: nothing here reads or writes a senior
 * table, and junior figures never feed a senior surface. Derived figures
 * (strike rate, economy) are recomputed server-side and stored in the journal
 * patch so the SQL re-apply stays dumb.
 *
 * The handlers are split by concern and mounted here:
 *
 *  - `juniors-admin-matches.ts`      match header + roster corrections
 *  - `juniors-admin-lines.ts`        batting / bowling line corrections
 *  - `juniors-admin-participants.ts` participant profile edits + duplicate merges
 *  - `juniors-admin-corrections.ts`  corrections journal list + revert
 *
 * Shared helpers (journal, tenant-scoped lookups, serialisers) live in
 * `lib/junior-admin-helpers.ts`. Sub-routers are mounted in the order their
 * routes were originally registered.
 */
const router: IRouter = Router();

router.use(matchesRouter);
router.use(linesRouter);
router.use(participantsRouter);
router.use(correctionsRouter);

export default router;
