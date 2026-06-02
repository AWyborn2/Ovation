import { Router, type IRouter } from "express";
import { CaptainLoginBody } from "@workspace/api-zod";
import type { CaptainRow } from "@workspace/db";
import {
  CAPTAIN_SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  encodeCaptainSession,
  getCaptainByUsername,
  verifyPassword,
} from "../lib/auth";
import { resolveCaptain, getCaptainGrades } from "../middlewares/require-captain";

const router: IRouter = Router();

function serializeCaptain(c: CaptainRow, grades: string[]) {
  return {
    id: c.id,
    username: c.username,
    displayName: c.displayName,
    grades,
    createdAt: c.createdAt.toISOString(),
  };
}

router.post("/captain-auth/login", async (req, res): Promise<void> => {
  const parsed = CaptainLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const captain = await getCaptainByUsername(parsed.data.username);
  if (!captain || !(await verifyPassword(parsed.data.password, captain.passwordHash))) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const token = encodeCaptainSession({ captainId: captain.id, issuedAt: Date.now() });
  res.cookie(CAPTAIN_SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
  const grades = await getCaptainGrades(captain.id);
  res.json(serializeCaptain(captain, grades));
});

router.post("/captain-auth/logout", (_req, res): void => {
  res.clearCookie(CAPTAIN_SESSION_COOKIE, { path: "/" });
  res.sendStatus(204);
});

router.get("/captain-auth/me", async (req, res): Promise<void> => {
  const captain = await resolveCaptain(req);
  if (!captain) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const grades = await getCaptainGrades(captain.id);
  res.json(serializeCaptain(captain, grades));
});

export default router;
