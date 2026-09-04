import { Router, type IRouter } from "express";
import playersRouter from "./juniors-players";
import matchesRouter from "./juniors-matches";
import leaderboardsRouter from "./juniors-leaderboards";
import honoursRouter from "./juniors-honours";

/**
 * JUNIORS read API. This data is kept COMPLETELY SEPARATE from the senior
 * records by club decision — no query here ever touches a senior table, and the
 * only senior link (junior_participants.senior_player_id) is surfaced as a
 * cross-reference id, never merged into any figure.
 *
 * The handful of `is_private` participants are hidden everywhere: in scorecards
 * their lines are MASKED (kept so the card still adds up, but name removed and
 * not linkable); in every directory / leaderboard / aggregate they are EXCLUDED
 * (the leaderboard queries inner-join junior_participants and filter is_private,
 * which naturally drops both opposition players and private participants).
 *
 * The handlers are split by concern and mounted here:
 *
 *  - `juniors-players.ts`      players directory, profile, senior link
 *  - `juniors-matches.ts`      filters, match list/detail, display settings
 *  - `juniors-leaderboards.ts` overview, top performers, leaderboards,
 *                              social milestones
 *  - `juniors-honours.ts`      premierships, office bearers
 *
 * Sub-routers are mounted in the order their routes were originally
 * registered (leaderboards first: overview/top-performers led the file).
 */
const router: IRouter = Router();

router.use(leaderboardsRouter);
router.use(matchesRouter);
router.use(playersRouter);
router.use(honoursRouter);

export default router;
