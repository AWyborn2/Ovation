import { createHash } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, capRegisterTable, socialDraftsTable, socialSettingsTable } from "@workspace/db";
import type { CentralAchievement } from "@workspace/db/central-queries";
import { GRADE_TO_CAP_CATEGORY } from "./cap-sync";
import { draftKeys, findDraftByKey, upsertDraftByKey, type PlayerKeyRef } from "./draft-upsert";
import {
  BOARD_STAT_LABEL,
  TIER_LABELS,
  TIER_THRESHOLDS,
  type BoardKey,
} from "./milestone-detector";
import { loadCentralIdentity, type CentralIdentity } from "./roundup-central";
import { playerPath } from "./roundup";
import { familyAllows, resolveFamilyConfig, type FamilyConfig } from "./social-families";

/**
 * Achievement cards (centuries, five-fors, debuts, career milestones) for a
 * central-data club — the central twin of the native import's
 * `detectAndQueueMatchMilestones` + `queueCareerCrossings`.
 *
 * The cards are the native ones: same engine ("milestone"), family
 * ("achievements"), card inputs and source keys, so refresh, auto-post, photo
 * enrichment and the family / per-grade switches behave identically. The
 * detection itself is the central read `centralMatchAchievements` (senior
 * grades only, senior-only career totals, private players omitted).
 *
 * Identity follows the crosswalk: a GUID with a `player_id_map` row gets its
 * app id on the card and in the source key; an unmapped GUID keeps its card
 * without a profile link, keyed by an opaque token of the GUID (the GUID itself
 * never reaches a draft). A GUID the crosswalk maps to a fill-in id is dropped,
 * like a native fill-in.
 *
 * Fire-once, like the native `milestone_events` de-dup: a key whose draft was
 * dismissed is never drafted again; a live draft is refreshed in place.
 */

/** A source-key token for a central player with no crosswalk row. */
export function centralPlayerKey(participantId: string): string {
  return `c${createHash("sha1").update(participantId).digest("hex").slice(0, 16)}`;
}

/** "2024/25" from a season start year, as the native debut card prints it. */
const seasonLabel = (season: number) => `${season}/${String((season + 1) % 100).padStart(2, "0")}`;

/** One draft to upsert: the native card input plus its key and player link. */
export type AchievementDraft = {
  sourceKey: string;
  playerId: number | null;
  grade: string;
  cardInput: Record<string, unknown>;
};

/**
 * Turn central achievements into the native card drafts. Pure (given the
 * identity and cap lookups), so the key / card shapes and the family, grade
 * and fill-in rules are testable without a database.
 */
export function buildAchievementDrafts(
  achievements: readonly CentralAchievement[],
  identity: Pick<CentralIdentity, "playerIdFor" | "isFillIn" | "nameFor">,
  families: FamilyConfig,
  capNumberFor: (playerId: number, grade: string) => number | null = () => null,
): AchievementDraft[] {
  const out: AchievementDraft[] = [];
  const seen = new Set<string>();
  for (const a of achievements) {
    if (!familyAllows(families, "achievements", a.grade, false)) continue;
    if (identity.isFillIn(a.participantId)) continue;
    const playerId = identity.playerIdFor(a.participantId);
    const ref: PlayerKeyRef = playerId ?? centralPlayerKey(a.participantId);
    const playerName = identity.nameFor(a.participantId, a.displayName);
    let draft: AchievementDraft;
    switch (a.kind) {
      case "century":
        draft = {
          sourceKey: draftKeys.matchFeat("century", ref, a.grade, a.season, a.round),
          playerId,
          grade: a.grade,
          cardInput: {
            kind: "century",
            playerName,
            grade: a.grade,
            runs: a.runs,
            balls: a.balls,
            notOut: a.notOut,
            opponent: a.opponent,
            round: a.round,
            photoUrl: null,
          },
        };
        break;
      case "fiveFor":
        draft = {
          sourceKey: draftKeys.matchFeat("fiveFor", ref, a.grade, a.season, a.round),
          playerId,
          grade: a.grade,
          cardInput: {
            kind: "fiveFor",
            playerName,
            grade: a.grade,
            wickets: a.wickets,
            runsConceded: a.runsConceded,
            overs: a.overs,
            figures: `${a.wickets}/${a.runsConceded ?? "-"}`,
            opponent: a.opponent,
            round: a.round,
            photoUrl: null,
          },
        };
        break;
      case "debut":
        draft = {
          sourceKey: draftKeys.debut(ref, a.grade),
          playerId,
          grade: a.grade,
          cardInput: {
            kind: "debut",
            playerName,
            grade: a.grade,
            capNumber: playerId != null ? capNumberFor(playerId, a.grade) : null,
            season: seasonLabel(a.season),
            opponent: a.opponent,
            round: a.round,
            photoUrl: null,
          },
        };
        break;
      case "career": {
        const key = a.boardKey as BoardKey;
        draft = {
          sourceKey: draftKeys.careerMilestone(ref, key, a.tierIndex),
          playerId,
          grade: a.grade,
          cardInput: {
            kind: "milestone",
            playerName,
            tierLabel: TIER_LABELS[key]?.[a.tierIndex] ?? `${a.threshold} ${BOARD_STAT_LABEL[key]}`,
            tierIndex: a.tierIndex,
            milestoneLabel: BOARD_STAT_LABEL[key] ?? key,
            currentValue: a.value,
            threshold: a.threshold,
          },
        };
        break;
      }
    }
    if (seen.has(draft.sourceKey)) continue;
    seen.add(draft.sourceKey);
    out.push(draft);
  }
  return out;
}

export type CentralAchievementsResult = { drafted: number; skipped: number };

/**
 * Draft the achievement cards for a central-data club's `matchIds` (central
 * match ids; anything that isn't the club's senior match is ignored). Nothing is
 * read or drafted while the achievements family is off.
 */
export async function draftCentralAchievements(
  tenantId: number,
  clubId: number,
  matchIds: readonly number[],
  seenAt: Date,
): Promise<CentralAchievementsResult> {
  const result: CentralAchievementsResult = { drafted: 0, skipped: 0 };
  if (matchIds.length === 0) return result;
  const [settings] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const families = resolveFamilyConfig(settings ?? null);
  if (!families.achievements.enabled) return result;

  const { centralMatchAchievements } = await import("@workspace/db/central-queries");
  const [achievements, identity, caps] = await Promise.all([
    centralMatchAchievements(clubId, matchIds, TIER_THRESHOLDS),
    loadCentralIdentity(tenantId),
    loadCaps(tenantId),
  ]);
  const drafts = buildAchievementDrafts(achievements, identity, families, (playerId, grade) => {
    const category = GRADE_TO_CAP_CATEGORY[grade];
    return category ? (caps.get(`${category}|${playerId}`) ?? null) : null;
  });

  for (const d of drafts) {
    // Fire-once: a card the club dismissed is never drafted again.
    if (!(await findDraftByKey(tenantId, d.sourceKey)) && (await wasDismissed(tenantId, d))) {
      result.skipped++;
      continue;
    }
    const r = await upsertDraftByKey({
      tenantId,
      engine: "milestone",
      family: "achievements",
      sourceKey: d.sourceKey,
      cardInput: d.cardInput,
      appPath: playerPath(d.playerId),
      playerId: d.playerId,
      sourceImportedAt: seenAt,
    });
    if (r.action === "inserted" || r.action === "refreshed") result.drafted++;
    else result.skipped++;
  }
  return result;
}

async function wasDismissed(tenantId: number, d: AchievementDraft): Promise<boolean> {
  const [row] = await db
    .select({ id: socialDraftsTable.id })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.sourceKey, d.sourceKey),
        eq(socialDraftsTable.status, "dismissed"),
      ),
    )
    .limit(1);
  return !!row;
}

/** The tenant's cap register, `${category}|${playerId}` → cap number. */
async function loadCaps(tenantId: number): Promise<Map<string, number>> {
  const rows = await db
    .select({
      playerId: capRegisterTable.playerId,
      category: capRegisterTable.category,
      capNumber: capRegisterTable.capNumber,
    })
    .from(capRegisterTable)
    .where(and(eq(capRegisterTable.tenantId, tenantId), isNotNull(capRegisterTable.playerId)));
  return new Map(rows.map((r) => [`${r.category}|${r.playerId}`, r.capNumber]));
}
