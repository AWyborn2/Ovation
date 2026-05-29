import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminsRouter from "./admins";
import playersRouter from "./players";
import statsRouter from "./stats";
import gradesRouter from "./grades";
import premiershipsRouter from "./premierships";
import importsRouter from "./imports";
import capsRouter from "./caps";
import lifeMembersRouter from "./life-members";
import honourBoardsRouter from "./honour-boards";
import socialCardsRouter from "./social-cards";
import socialDraftsRouter from "./social-drafts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminsRouter);
router.use(playersRouter);
router.use(statsRouter);
router.use(gradesRouter);
router.use(premiershipsRouter);
router.use(importsRouter);
router.use(capsRouter);
router.use(lifeMembersRouter);
router.use(honourBoardsRouter);
router.use(socialCardsRouter);
router.use(socialDraftsRouter);

export default router;
