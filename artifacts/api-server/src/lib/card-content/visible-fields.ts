/**
 * The content fields a club's single cards show (ADR-010 P7): its content
 * choices for the kind (`social_settings.card_content`). The sweep and Create
 * a Card read them the same way, so a card made by hand matches the
 * auto-queued one.
 */

import { eq } from "drizzle-orm";
import { db, socialSettingsTable } from "@workspace/db";
import {
  DEFAULT_TEAM_LIST_ORDER,
  readCardContentSettings,
  resolveVisibleFields,
  type ContentKind,
  type TeamListOrder,
} from "@workspace/scorecard/card-content";
import { logger } from "../logger";

async function readCardContent(tenantId: number): Promise<unknown> {
  const [row] = await db
    .select({ cardContent: socialSettingsTable.cardContent })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return row?.cardContent;
}

/**
 * The fields a kind shows for this club. Best effort: a failed read is the
 * Standard preset, which is the cards as they always were.
 */
export async function contentVisibleFields(
  tenantId: number,
  kind: ContentKind,
): Promise<Set<string>> {
  try {
    return resolveVisibleFields(
      kind,
      readCardContentSettings(await readCardContent(tenantId))[kind],
    );
  } catch (err) {
    logger.warn({ err, tenantId, kind }, "card content settings: read failed");
    return resolveVisibleFields(kind);
  }
}

/**
 * A club's Team List choices: the fields its cards show and its player order
 * (build decision 16), one default for senior and junior lists. Best effort: a
 * failed read is Standard, As selected (the cards as they always were).
 */
export async function teamListContentChoices(
  tenantId: number,
): Promise<{ visible: Set<string>; order: TeamListOrder }> {
  try {
    const settings = readCardContentSettings(await readCardContent(tenantId)).teamList;
    return {
      visible: resolveVisibleFields("teamList", settings),
      order: settings.playerOrder ?? DEFAULT_TEAM_LIST_ORDER,
    };
  } catch (err) {
    logger.warn({ err, tenantId, kind: "teamList" }, "card content settings: read failed");
    return { visible: resolveVisibleFields("teamList"), order: DEFAULT_TEAM_LIST_ORDER };
  }
}
