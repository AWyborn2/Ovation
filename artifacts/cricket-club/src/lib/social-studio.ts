import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { listPackManifests, DEFAULT_PACK_ID } from "@/lib/pack-templates/registry";
import type { CardSize, ShareCardInput } from "@/lib/share-card";

/**
 * Small shared vocabulary for the Social Studio surfaces.
 *
 * These were duplicated at the top of the studio page and would have been
 * duplicated again by every component split out of it; they live here so the
 * page, the design-packs section and the pack-selection hook all agree on what
 * "every card kind" and "a pack's name" mean.
 */

export type CardKind = ShareCardInput["kind"];

/** Gallery thumbnails render square — the cheapest format to rasterise. */
export const THUMB_SIZE: CardSize = "square";

export const kindLabel = (k: string): string =>
  CARD_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

/**
 * Every card kind, in gallery order.
 *
 * Derived from `CARD_KIND_OPTIONS` rather than `share-card`'s `CARD_KINDS` on
 * purpose: the counts and bulk-apply coverage below must agree with the gallery
 * the admin is looking at, and that gallery iterates the picker's options.
 */
export const ALL_CARD_KINDS: CardKind[] = CARD_KIND_OPTIONS.map((o) => o.value);

/** A pack's catalogue name, falling back to its id for a withdrawn pack. */
export const packName = (packId: string): string =>
  listPackManifests().find((m) => m.packId === packId)?.name ?? packId;

export const DEFAULT_PACK_NAME = packName(DEFAULT_PACK_ID);

/** What each card type is for, shown beside its pack choice (U14). */
export const KIND_BLURB: Record<CardKind, string> = {
  matchSummary: "Auto-drafted after every results import",
  milestone: "Career milestones: games, runs, wickets",
  player: "Player spotlight, made by hand",
  record: "Club records, made by hand",
  gradeLeader: "Grade leaders after each round",
  premiership: "Premiership winners",
  debut: "Debuts and caps from each import",
  century: "Every hundred, from each import",
  fiveFor: "Every five-wicket haul, from each import",
  matchDay: "Two days before each fixture",
  teamList: "When the XI is published",
  weekendWrap: "The weekend's results in one card",
  ladder: "Ladder positions",
  bigMoment: "Live moments, made by hand",
  newSigning: "New signings, made by hand",
  countdown: "Countdown to a fixture or event",
  clubLeaderboard: "Club-wide leaders by grade",
};

/**
 * A small colour swatch per pack for the per-type picker. These are the
 * packs' own identity colours (not tenant colours) so each swatch reads as
 * its pack at a glance.
 */
export const PACK_SWATCH: Record<string, string> = {
  "broadcast-dark-v1": "linear-gradient(135deg, #0B1014 55%, #1B242B)",
  "gold-foil-v1": "linear-gradient(135deg, #9C6A12, #F4D27A 45%, #FFF3B8 55%, #C9932B)",
  "bold-type-v1": "linear-gradient(135deg, #FBAC27 60%, #10151B 60%)",
  "neon-night-v1": "linear-gradient(135deg, #05070D 40%, #22D3EE 80%, #EC4899)",
  "sunset-v1": "linear-gradient(180deg, #FF7A45, #C2185B 55%, #2A1036)",
};

/**
 * Everyday words an admin might type for each card type ("What are we posting
 * today?" on Create a card). Matched alongside the type's label and blurb.
 */
const KIND_KEYWORDS: Record<CardKind, string[]> = {
  matchSummary: ["result", "score", "scorecard", "win", "won", "loss", "match"],
  milestone: ["milestone", "games", "career", "250", "100 games"],
  player: ["player", "spotlight", "profile", "feature"],
  record: ["record", "best", "highest"],
  gradeLeader: ["leader", "leaderboard", "top", "most runs", "most wickets"],
  premiership: ["premiership", "premiers", "flag", "grand final", "champions"],
  debut: ["debut", "cap", "first game"],
  century: ["century", "hundred", "ton", "100"],
  fiveFor: ["five-for", "five for", "5 for", "5fer", "five wickets", "michelle"],
  matchDay: ["match day", "game day", "fixture", "preview", "this weekend"],
  teamList: ["team list", "team", "xi", "selection", "squad", "line-up", "lineup"],
  weekendWrap: ["wrap", "weekend", "round-up", "roundup", "results"],
  ladder: ["ladder", "table", "standings", "positions"],
  bigMoment: ["moment", "live", "highlight", "catch", "hat-trick", "hat trick"],
  newSigning: ["signing", "new player", "recruit", "welcome"],
  countdown: ["countdown", "days to go", "season launch", "event"],
  clubLeaderboard: ["club leaderboard", "club leaders", "across the club"],
};

/**
 * Card types matching a free-text query, best first: an exact or prefix label
 * match, then a keyword, then the blurb. Empty query → no matches.
 */
export function matchCardKinds(query: string): CardKind[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = CARD_KIND_OPTIONS.map(({ value, label }) => {
    const l = label.toLowerCase();
    let score = 0;
    if (l === q) score = 5;
    else if (l.startsWith(q)) score = 4;
    else if (KIND_KEYWORDS[value].some((k) => k === q)) score = 3;
    else if (l.includes(q) || KIND_KEYWORDS[value].some((k) => k.startsWith(q) || q.includes(k)))
      score = 2;
    else if (KIND_BLURB[value].toLowerCase().includes(q)) score = 1;
    return { value, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.value);
}
