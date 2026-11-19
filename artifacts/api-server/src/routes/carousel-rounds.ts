import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCarouselRoundsQueryParams,
  GetCarouselRoundsResponse,
  GetJuniorCarouselRoundsQueryParams,
  GetJuniorCarouselRoundsResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import {
  juniorCarouselRounds,
  seniorCarouselRounds,
  type CarouselRounds,
} from "../lib/carousel-rounds";

/**
 * The seasons and rounds New Studio's Create fills a carousel set from
 * (lib/carousel-rounds.ts). Seniors at /weekend-carousel/rounds; juniors at
 * /juniors/carousel-rounds, from junior tables only (juniors isolation). Both are
 * scoped to the request's tenant.
 */
const router: IRouter = Router();

async function answer(
  req: Request,
  res: Response,
  load: () => Promise<CarouselRounds>,
  shape: { parse: (v: unknown) => unknown },
): Promise<void> {
  try {
    res.json(shape.parse(await load()));
  } catch (err) {
    req.log.warn({ err, tenantId: getTenantId(req) }, "Carousel rounds lookup failed");
    res.status(503).json({ error: "Could not load the club's seasons and rounds. Try again." });
  }
}

router.get(
  "/weekend-carousel/rounds",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = GetCarouselRoundsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a valid carousel set." });
      return;
    }
    const tenantId = getTenantId(req);
    const setType = parsed.data.setType ?? "matchDay";
    await answer(
      req,
      res,
      () => seniorCarouselRounds(req, tenantId, setType),
      GetCarouselRoundsResponse,
    );
  },
);

router.get(
  "/juniors/carousel-rounds",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = GetJuniorCarouselRoundsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a valid carousel set." });
      return;
    }
    const tenantId = getTenantId(req);
    const setType = parsed.data.setType ?? "matchDay";
    await answer(
      req,
      res,
      () => juniorCarouselRounds(tenantId, setType),
      GetJuniorCarouselRoundsResponse,
    );
  },
);

export default router;
