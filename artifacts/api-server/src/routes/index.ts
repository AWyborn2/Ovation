import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import statsRouter from "./stats";
import gradesRouter from "./grades";
import premiershipsRouter from "./premierships";
import importsRouter from "./imports";
import capsRouter from "./caps";
import lifeMembersRouter from "./life-members";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(statsRouter);
router.use(gradesRouter);
router.use(premiershipsRouter);
router.use(importsRouter);
router.use(capsRouter);
router.use(lifeMembersRouter);

export default router;
