import type { JuniorNameStyle, JuniorTeamPublishing, JuniorTeamPublishMode } from "@workspace/db";
import { JUNIOR_WITHHELD_NAME } from "@workspace/db/schema";

/**
 * Public junior names (junior PlayHQ sync plan U7; KTD12, R15, R16, R22).
 *
 * Pure — no database — so every rule here is unit-tested locally. The DB-backed
 * loader that feeds it lives in `junior-helpers.ts` (`loadJuniorNaming`).
 *
 * Rules, applied in order:
 * 1. A participant flagged private (PlayHQ / admin) and NOT overridden by a club
 *    admin is withheld: "Private Player" on scorecards and team lists, and left out
 *    of directories, leaderboards and profiles entirely (callers use
 *    `isJuniorWithheld` for that).
 * 2. An opposition line (not the club's own side) renders as initials,
 *    "O. G." — dotted, space-separated, one letter per word.
 * 3. Otherwise the club's naming style: `full` ("Ollie Gallash"), `first_initial`
 *    ("Ollie G") or `first` ("Ollie").
 * Admin responses never go through this — they carry full names.
 */

export { JUNIOR_WITHHELD_NAME };

export const JUNIOR_NAME_STYLES: readonly JuniorNameStyle[] = ["full", "first_initial", "first"];

const words = (name: string | null | undefined): string[] =>
  (name ?? "").trim().split(/\s+/).filter(Boolean);

/** Format a full name in a club's naming style. Single names render as-is. */
export function formatJuniorName(name: string | null | undefined, style: JuniorNameStyle): string {
  const parts = words(name);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  if (style === "first") return first;
  if (style === "first_initial") {
    if (parts.length === 1) return first;
    const last = parts[parts.length - 1]!;
    return `${first} ${last.charAt(0).toUpperCase()}`;
  }
  return parts.join(" ");
}

/** Opposition initials: "Ollie Gallash" → "O. G."; "Ollie" → "O.". */
export function juniorInitials(name: string | null | undefined): string {
  return words(name)
    .map((w) => `${w.charAt(0).toUpperCase()}.`)
    .join(" ");
}

/** True when a participant's name must be withheld from public surfaces. */
export function isJuniorWithheld(p: { isPrivate: boolean; privacyOverride: boolean }): boolean {
  return p.isPrivate && !p.privacyOverride;
}

export type JuniorNameInput = {
  displayName: string | null | undefined;
  isPrivate: boolean;
  privacyOverride: boolean;
  /** The line is the club's own side (`is_halls_head`). */
  isOwnClub: boolean;
};

/** The single public name for a junior player on any public surface. */
export function juniorPublicName(p: JuniorNameInput, style: JuniorNameStyle): string {
  if (isJuniorWithheld(p)) return JUNIOR_WITHHELD_NAME;
  if (!p.isOwnClub) return juniorInitials(p.displayName);
  return formatJuniorName(p.displayName, style);
}

/** A stored name style, defaulting to `full` for anything unexpected. */
export function parseJuniorNameStyle(v: unknown): JuniorNameStyle {
  return (JUNIOR_NAME_STYLES as readonly unknown[]).includes(v) ? (v as JuniorNameStyle) : "full";
}

const MODES: readonly JuniorTeamPublishMode[] = ["approval", "auto"];

/**
 * Sanitise a team-publishing map (age group → team name → `approval` | `auto`):
 * invalid modes and non-object age groups are dropped, as are emptied age groups.
 */
export function parseJuniorTeamPublishing(v: unknown): JuniorTeamPublishing {
  const out: JuniorTeamPublishing = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [ageGroup, teams] of Object.entries(v as Record<string, unknown>)) {
    if (!teams || typeof teams !== "object" || Array.isArray(teams)) continue;
    const kept: Record<string, JuniorTeamPublishMode> = {};
    for (const [team, mode] of Object.entries(teams as Record<string, unknown>)) {
      if ((MODES as readonly unknown[]).includes(mode)) kept[team] = mode as JuniorTeamPublishMode;
    }
    if (Object.keys(kept).length > 0) out[ageGroup] = kept;
  }
  return out;
}

/** A participant's naming facts, as stored on `junior_participants`. */
export type JuniorNameFacts = {
  displayName: string | null;
  isPrivate: boolean;
  privacyOverride: boolean;
};

/** One scorecard / roster / team-list line, as stored. */
export type JuniorStoredLine = {
  participantId: string | null;
  playerName: string | null;
  /** The club's own side. */
  isHallsHead: boolean;
};

export type JuniorNamedLine = {
  playerName: string;
  /** Null when withheld, so a public client cannot link or look the child up. */
  participantId: string | null;
  isPrivate: boolean;
};

export type JuniorNaming = {
  style: JuniorNameStyle;
  /** Format a public (non-withheld) own-club name in the club's style. */
  format: (name: string | null | undefined) => string;
  /** Public name for one stored line. */
  line: (l: JuniorStoredLine) => JuniorNamedLine;
  /** Admin view of a line: the full name and id, with `isPrivate` marking a withheld player. */
  adminLine: (l: JuniorStoredLine) => JuniorNamedLine;
};

/**
 * Bind the club's style and its participants' privacy facts into the line namer
 * used by every public scorecard / roster surface. An own-club line takes its name
 * from the participant row (the stored line copy is only a fallback); an opposition
 * line has no row of ours and keeps its stored name, rendered as initials.
 */
export function makeJuniorNaming(
  style: JuniorNameStyle,
  participants: ReadonlyMap<string, JuniorNameFacts>,
): JuniorNaming {
  const resolve = (l: JuniorStoredLine) => {
    const p = l.participantId ? participants.get(l.participantId) : undefined;
    const facts = {
      isPrivate: p?.isPrivate ?? false,
      privacyOverride: p?.privacyOverride ?? false,
    };
    const displayName = l.isHallsHead ? (p?.displayName ?? l.playerName) : l.playerName;
    return { facts, withheld: isJuniorWithheld(facts), displayName };
  };
  return {
    style,
    format: (name) => formatJuniorName(name, style),
    adminLine: (l) => {
      const { withheld, displayName } = resolve(l);
      return {
        playerName: formatJuniorName(displayName, "full"),
        participantId: l.participantId,
        isPrivate: withheld,
      };
    },
    line: (l) => {
      const { facts, withheld, displayName } = resolve(l);
      return {
        playerName: juniorPublicName({ ...facts, displayName, isOwnClub: l.isHallsHead }, style),
        participantId: withheld ? null : l.participantId,
        isPrivate: withheld,
      };
    },
  };
}
