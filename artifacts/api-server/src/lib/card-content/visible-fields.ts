/**
 * The content fields a club's single cards show (ADR-010 P7): its content
 * choices for the kind (`social_settings.card_content`). The sweep and Create
 * a Card read them the same way, so a card made by hand matches the
 * auto-queued one.
 */

import { eq } from "drizzle-orm";
import { db, socialSettingsTable } from "@workspace/db";
import {
  readCardContentSettings,
  resolveVisibleFields,
  type ContentKind,
} from "@workspace/scorecard/card-content";
import { logger } from "../logger";

/**
 * The fields a kind shows for this club. Best effort: a failed read is the
 * Standard preset, which is the cards as they always were.
 */
export async function contentVisibleFields(
  tenantId: number,
  kind: ContentKind,
): Promise<Set<string>> {
  try {
    const [row] = await db
      .select({ cardContent: socialSettingsTable.cardContent })
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    return resolveVisibleFields(kind, readCardContentSettings(row?.cardContent)[kind]);
  } catch (err) {
    logger.warn({ err, tenantId, kind }, "card content settings: read failed");
    return resolveVisibleFields(kind);
  }
}
