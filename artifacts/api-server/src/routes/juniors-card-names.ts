import { Router, type IRouter } from "express";
import {
  SetJuniorCardCompetitionLabelBody,
  SetJuniorCardTeamCrestBody,
  SetJuniorCardTeamNameBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { checkCrestChoice } from "../lib/card-content/crest-choice";
import {
  listJuniorCardNames,
  setJuniorCompetitionLabelOverride,
  setJuniorTeamCrestOverride,
  setJuniorTeamNameOverride,
} from "../lib/card-content/junior-names";

/**
 * Junior opponent and grade names for junior cards: the Juniors tab of Social
 * Studio's "Team and competition names". Juniors isolation: these routes read
 * the junior tables and write the junior override tables only; senior names
 * live under `/social-settings/card-names`. Admin, tenant-scoped.
 */
const router: IRouter = Router();

const guard = [requireAdmin, requireEntitlement("socialStudio")] as const;

router.get("/juniors/card-names", ...guard, async (req, res): Promise<void> => {
  res.json(await listJuniorCardNames(getTenantId(req)));
});

router.put("/juniors/card-names/teams", ...guard, async (req, res): Promise<void> => {
  const parsed = SetJuniorCardTeamNameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  await setJuniorTeamNameOverride(tenantId, parsed.data.teamKey, parsed.data.shortName ?? null);
  res.json(await listJuniorCardNames(tenantId));
});

router.put("/juniors/card-names/crests", ...guard, async (req, res): Promise<void> => {
  const parsed = SetJuniorCardTeamCrestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const checked = await checkCrestChoice(parsed.data.crestSource, parsed.data.crestUrl);
  if (!checked.ok) {
    res.status(400).json({ error: checked.error });
    return;
  }
  const tenantId = getTenantId(req);
  await setJuniorTeamCrestOverride(tenantId, parsed.data.teamKey, checked.choice);
  res.json(await listJuniorCardNames(tenantId));
});

router.put("/juniors/card-names/competitions", ...guard, async (req, res): Promise<void> => {
  const parsed = SetJuniorCardCompetitionLabelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  await setJuniorCompetitionLabelOverride(
    tenantId,
    parsed.data.gradeKey,
    parsed.data.label ?? null,
  );
  res.json(await listJuniorCardNames(tenantId));
});

export default router;
