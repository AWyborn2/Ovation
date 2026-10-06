import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { env } from "../config";
import { runPublishSweep } from "../lib/publishing/publish-worker";

/**
 * `POST /api/internal/publish-sweep` — runs the Meta publish worker (plan
 * 2026-10-06-001 U6). Called every five minutes by a Replit Scheduled
 * Deployment. Its own secret, never the draft-sweep one: unset, or equal to
 * the draft-sweep secret, means the endpoint is closed.
 */
const router: IRouter = Router();

function secretMatches(req: Request): boolean {
  const expected = env.SOCIAL_PUBLISH_SECRET();
  const given = req.get("x-publish-secret");
  if (!expected || !given || expected === env.SOCIAL_SWEEP_SECRET()) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post("/publish-sweep", async (req, res): Promise<void> => {
  if (!secretMatches(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const summary = await runPublishSweep({}, req.log);
  res.json(summary);
});

export default router;
