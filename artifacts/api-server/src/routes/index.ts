import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import statsRouter from "./stats";
import gradesRouter from "./grades";
import premiershipsRouter from "./premierships";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(statsRouter);
router.use(gradesRouter);
router.use(premiershipsRouter);

export default router;
