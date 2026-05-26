import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import statsRouter from "./stats";
import gradesRouter from "./grades";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(statsRouter);
router.use(gradesRouter);

export default router;
