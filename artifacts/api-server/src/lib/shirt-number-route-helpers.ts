import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { getShirtNumberSettings } from "@workspace/db/shirt-numbers";
import { getTenantId } from "../middlewares/tenant-context";

/**
 * Route helpers shared by the senior (`routes/shirt-numbers.ts`) and juniors
 * (`routes/juniors-shirt-numbers.ts`) shirt-number registers.
 */

export const FEATURE_OFF =
  "Shirt numbers are turned off for this club. Turn them on in the shirt-number settings first.";

/** Seasons an admin can sensibly address (start years). */
export const MIN_SEASON = 1850;
export const MAX_SEASON = 2200;
export const validSeason = (s: number) => Number.isInteger(s) && s >= MIN_SEASON && s <= MAX_SEASON;

/** Settings for a write, or a 400 sent when the feature is off. */
export async function enabledSettings(req: Request, res: Response) {
  const settings = await getShirtNumberSettings(db, getTenantId(req));
  if (!settings.enabled) {
    res.status(400).json({ error: FEATURE_OFF });
    return null;
  }
  return settings;
}

/** A register write's outcome, on either side. */
type RegisterWriteOutcome =
  { ok: true; entry: unknown; warnings: unknown[] } | { ok: false; status: number; body: unknown };

export function sendOutcome(
  res: Response,
  outcome: RegisterWriteOutcome,
  okStatus: 200 | 201,
): void {
  if (outcome.ok) {
    res.status(okStatus).json({ entry: outcome.entry, warnings: outcome.warnings });
    return;
  }
  res.status(outcome.status).json(outcome.body);
}
