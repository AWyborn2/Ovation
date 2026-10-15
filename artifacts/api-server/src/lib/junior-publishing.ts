// From the schema subpath so suites that vi.mock("@workspace/db") keep loading this module.
import { JUNIOR_SYNC_ID_START } from "@workspace/db/schema";
import type { JuniorTeamPublishMode } from "@workspace/db";
import type { FamilyConfig, SocialFamily } from "./social-families";

/**
 * Junior social publishing rules (junior PlayHQ sync plan U8; KTD13-KTD15, R19-R21, R23).
 *
 * Pure — no database — so every decision is unit-tested locally. The sweep that applies
 * them lives in `junior-social.ts`; the SQL form of the promotion guard is
 * `juniorAutoPostClear` in `effective-draft-state.ts`, and must agree with
 * {@link juniorDraftMayAutoPost}.
 */

/** Source-key prefix of a junior team-list card: one per junior fixture. */
export const JUNIOR_TEAM_LIST_KEY_PREFIX = "juniorteamlist:";

export const juniorTeamListKey = (juniorFixtureId: number): string =>
  `${JUNIOR_TEAM_LIST_KEY_PREFIX}${juniorFixtureId}`;

/** The junior fixture id behind a junior team-list key, or null for any other key. */
export function juniorTeamListFixtureIdOf(sourceKey: string | null | undefined): number | null {
  const m = /^juniorteamlist:(\d+)$/.exec(sourceKey ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * The junior match id behind a SYNCED junior result card's key (`matchSummary:junior:<id>`
 * with `id >= JUNIOR_SYNC_ID_START`), or null. Loader-era junior matches sit below the
 * sync id band and are not the sync's to hold or re-render.
 */
export function syncedJuniorMatchIdOf(sourceKey: string | null | undefined): number | null {
  const m = /^matchSummary:junior:(\d+)$/.exec(sourceKey ?? "");
  if (!m) return null;
  const id = Number(m[1]);
  return id >= JUNIOR_SYNC_ID_START ? id : null;
}

/**
 * One junior team's publishing mode (KTD14): only an explicit `auto` is auto; a missing
 * age group, team, or anything malformed is `approval`.
 */
export function juniorTeamPublishMode(
  publishing: unknown,
  ageGroup: string | null | undefined,
  teamName: string | null | undefined,
): JuniorTeamPublishMode {
  if (!ageGroup || !teamName) return "approval";
  if (!publishing || typeof publishing !== "object" || Array.isArray(publishing)) {
    return "approval";
  }
  const teams = (publishing as Record<string, unknown>)[ageGroup];
  if (!teams || typeof teams !== "object" || Array.isArray(teams)) return "approval";
  return (teams as Record<string, unknown>)[teamName] === "auto" ? "auto" : "approval";
}

/**
 * Should `family` draft a synced junior card for this age group? The family switch
 * wins; within an enabled family a junior age group drafts unless the club turned it
 * off (plan U8 approach) — unlike `familyAllows`, whose junior default is off.
 */
export function juniorFamilyAllows(
  config: FamilyConfig,
  family: SocialFamily,
  ageGroup: string | null | undefined,
): boolean {
  const setting = config[family];
  if (!setting.enabled) return false;
  const key = ageGroup ?? "";
  return key in setting.grades ? setting.grades[key] !== false : true;
}

/** True when a draft is junior content by either marker. */
export function isJuniorDraft(d: { sourceMatchIsJunior: boolean; cardInput: unknown }): boolean {
  if (d.sourceMatchIsJunior) return true;
  const input = d.cardInput as Record<string, unknown> | null | undefined;
  return input?.junior === true;
}

/**
 * True for the junior sync's own drafts: a junior team-list card (`juniorteamlist:<id>`)
 * or a result card of a junior match in the sync id band. Loader-era junior summaries
 * and junior round sets are not synced drafts.
 */
export function isSyncedJuniorDraft(d: { sourceKey: string | null | undefined }): boolean {
  return (
    juniorTeamListFixtureIdOf(d.sourceKey) !== null || syncedJuniorMatchIdOf(d.sourceKey) !== null
  );
}

/**
 * The promotion guard (KTD14): a SYNCED junior draft may be auto-promoted or auto-posted
 * only when its team is explicitly `auto`. `mode` is the draft's team's mode, or null when
 * the team cannot be resolved (a synced junior draft with no resolvable team never
 * auto-posts). Senior drafts, loader-era junior summaries and junior round sets keep their
 * previous behaviour at every club.
 */
export function juniorDraftMayAutoPost(
  d: { sourceKey: string | null | undefined },
  mode: JuniorTeamPublishMode | null,
): boolean {
  return !isSyncedJuniorDraft(d) || mode === "auto";
}

/**
 * Whether a junior result card (`matchSummary:junior:<matchId>`) gets an auto-ready time:
 * a synced card only for a team set to `auto` (KTD14); a loader-era card as before.
 */
export function juniorResultAutoReady(matchId: number, mode: JuniorTeamPublishMode): boolean {
  return juniorDraftMayAutoPost({ sourceKey: `matchSummary:junior:${matchId}` }, mode);
}

/** The junior team a card (or one slide of a carousel) covers. */
export type JuniorTeamRef = { ageGroup: string | null; teamName: string | null };

/**
 * The junior teams a draft records on its card input (`juniorTeams`, written by every
 * junior drafter and every carousel with a junior slide, KTD6), or null when the draft
 * carries none — a loader-era junior summary, a junior round set made before this, or
 * anything else the publishing gate cannot trace to a team.
 */
export function juniorTeamsOf(d: { cardInput: unknown }): JuniorTeamRef[] | null {
  const input = d.cardInput as Record<string, unknown> | null | undefined;
  const raw = input?.juniorTeams;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: JuniorTeamRef[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const { ageGroup, teamName } = t as Record<string, unknown>;
    out.push({
      ageGroup: typeof ageGroup === "string" ? ageGroup : null,
      teamName: typeof teamName === "string" ? teamName : null,
    });
  }
  return out;
}

/**
 * The Meta publishing gate for junior content (ADR-006), failing closed: a senior
 * draft passes; a draft with either junior marker publishes on its own only when it
 * lists the teams it covers and every one of them is set to `auto`. A missing or
 * unresolvable team, or any `approval` team, means the card waits for an admin.
 */
export function juniorDraftMayAutoPublish(
  d: { sourceMatchIsJunior: boolean; cardInput: unknown },
  publishing: unknown,
): boolean {
  if (!isJuniorDraft(d)) return true;
  const teams = juniorTeamsOf(d);
  if (!teams) return false;
  return teams.every((t) => juniorTeamPublishMode(publishing, t.ageGroup, t.teamName) === "auto");
}

/**
 * What the sweep does to one unposted synced junior draft's timing (KTD14, KTD15):
 *  - `hold`: back to review with no auto-ready time (junior sync switched off, or an
 *    auto-promoted draft whose team is no longer `auto`);
 *  - `clear`: still in review, drop its auto-ready time (team on approval);
 *  - `set`: give an untouched draft of an `auto` team its auto-ready time;
 *  - `keep`: nothing to change. A draft an admin acted on keeps no auto-ready time, and
 *    an admin-approved draft (ready and touched — the approve route sets `reviewedAt` but
 *    may leave `autoReadyAt`) stays ready while sync is on.
 */
export type JuniorRetimeAction = "hold" | "clear" | "set" | "keep";

export function juniorRetimeAction(d: {
  syncEnabled: boolean;
  mode: JuniorTeamPublishMode;
  status: string;
  autoReadyAt: Date | null;
  /** No admin action has touched the draft (review, edit, design edit, hand-made). */
  untouched: boolean;
}): JuniorRetimeAction {
  const ready = d.status === "ready";
  // Switched off: every unposted synced junior draft goes back to review (R23).
  if (!d.syncEnabled) return "hold";
  if (d.mode !== "auto") {
    // Only an untouched, auto-promoted draft is held: approving a draft sets reviewedAt
    // but leaves its auto-ready time in place, and an admin's approval stands.
    if (ready) return d.autoReadyAt != null && d.untouched ? "hold" : "keep";
    return d.autoReadyAt != null ? "clear" : "keep";
  }
  if (!ready && d.autoReadyAt == null && d.untouched) return "set";
  return "keep";
}
