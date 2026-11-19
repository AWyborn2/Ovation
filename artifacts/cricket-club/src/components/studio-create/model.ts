/**
 * New Studio → Create (studio-create-consolidation S2): the wizard's model.
 * Four steps (what, one or many, fill from, look and size); the choices
 * live in the query string so Back, refresh and deep links work. Pure, so
 * the step rules are unit-tested without rendering.
 */
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import type { CardKind } from "@/lib/share-card";
import type { TeamListSourceSummary } from "@workspace/api-client-react";
import type { CarouselSetType } from "@workspace/scorecard/queued-carousel";
import { primaryPage } from "@workspace/scorecard/kind-templates";

export type CreateTeam = "senior" | "junior";
export type CreateMode = "one" | "many";
export type CreateStep = 1 | 2 | 3 | 4;

export type CreateState = {
  team: CreateTeam;
  /** "carousel": Carousel set's own chooser (which set to make), at step 2. */
  kind: CardKind | "blank" | "carousel" | null;
  mode: CreateMode;
  step: CreateStep;
};

export const STEP_LABELS = ["What", "One or many", "Fill from", "Look"] as const;

/**
 * Kinds Create offers seniors: every kind Create a card offers, except the
 * multi-card kinds that are made as a carousel ("Round Team Lists" is a Team
 * List's "Whole round"), and Junior Highlights, which is a junior card.
 */
const NOT_SINGLE = new Set<CardKind>(["teamListRound", "juniorHighlights"]);
export const SENIOR_KINDS: CardKind[] = CARD_KIND_OPTIONS.map((o) => o.value).filter(
  (k) => !NOT_SINGLE.has(k),
);

/**
 * Kinds Create offers juniors, each from a junior builder over the junior tables only
 * (juniors isolation): a team's list (one team, or the round as a carousel), the
 * weekend's junior games (a carousel), a junior match, a junior milestone.
 */
export const JUNIOR_KINDS: CardKind[] = ["teamList", "matchDay", "matchSummary", "milestone"];

/** The kinds a team (Seniors or Juniors) can make. */
export const kindsFor = (team: CreateTeam): CardKind[] =>
  team === "junior" ? JUNIOR_KINDS : SENIOR_KINDS;

/** The carousel set a kind makes as "many" (the Weekend Carousel's set types). */
export const CAROUSEL_SET_OF: Partial<Record<CardKind, CarouselSetType>> = {
  teamList: "teamList",
  matchDay: "matchDay",
  resultsSummary: "results",
  matchSummary: "matchSummary",
};

/** Whether "one or many" offers a carousel for this kind. */
export function offersCarousel(kind: CreateState["kind"]): boolean {
  return (
    kind !== null && kind !== "blank" && kind !== "carousel" && CAROUSEL_SET_OF[kind] !== undefined
  );
}

/** A kind that only comes as a carousel for this team (Junior Match Day). */
export function carouselOnly(team: CreateTeam, kind: CreateState["kind"]): boolean {
  return team === "junior" && kind === "matchDay";
}

/** Read the wizard's state from the query string, dropping anything unknown. */
export function parseCreateState(search: string, juniorsOn = true): CreateState {
  const q = new URLSearchParams(search);
  const team: CreateTeam = q.get("team") === "junior" && juniorsOn ? "junior" : "senior";
  const kinds = kindsFor(team);
  const rawKind = q.get("kind");
  const kind =
    rawKind === "blank" && team === "senior"
      ? "blank"
      : rawKind === "carousel"
        ? "carousel"
        : rawKind && kinds.includes(rawKind as CardKind)
          ? (rawKind as CardKind)
          : null;
  const mode: CreateMode =
    carouselOnly(team, kind) || (q.get("mode") === "many" && offersCarousel(kind)) ? "many" : "one";
  const n = Number(q.get("step"));
  let step: CreateStep = n === 2 || n === 3 || n === 4 ? n : 1;
  // A step needs the choices before it: no kind, back to step 1. A step the
  // kind skips moves on to the next one it has.
  if (kind === null) step = 1;
  const steps = stepsFor(kind, team);
  if (!steps.includes(step)) step = steps.find((x) => x > step) ?? steps[steps.length - 1]!;
  return { team, kind, mode, step };
}

/** The query string for a state (defaults left out). */
export function createSearch(s: CreateState): string {
  const q = new URLSearchParams();
  if (s.team === "junior") q.set("team", "junior");
  if (s.kind) q.set("kind", s.kind);
  if (s.mode === "many") q.set("mode", "many");
  if (s.step !== 1) q.set("step", String(s.step));
  return q.toString();
}

/**
 * The step after this one. "One or many" is skipped when the kind has no
 * carousel (or comes only as one), and "Fill from" for a blank design, which has
 * nothing to fill.
 */
export function nextStep(s: CreateState): CreateStep {
  const order = stepsFor(s.kind, s.team);
  const at = order.indexOf(s.step);
  return order[Math.min(order.length - 1, at + 1)] ?? 1;
}

/** The step before this one (skipping the same steps as {@link nextStep}). */
export function prevStep(s: CreateState): CreateStep {
  const order = stepsFor(s.kind, s.team);
  const at = order.indexOf(s.step);
  return order[Math.max(0, at - 1)] ?? 1;
}

/** The steps a kind goes through, in order. */
export function stepsFor(kind: CreateState["kind"], team: CreateTeam = "senior"): CreateStep[] {
  // Carousel set: what, then which set; the set's own kind takes it from there.
  if (kind === "carousel") return [1, 2];
  const steps: CreateStep[] = [1];
  if (offersCarousel(kind) && !carouselOnly(team, kind)) steps.push(2);
  if (kind !== "blank") steps.push(3);
  steps.push(4);
  return steps;
}

/** A set the Carousel set chooser offers: the kind it makes as "many", and what it covers. */
export type CarouselChoice = { kind: CardKind; label: string; hint: string };

/**
 * Carousel set → which set (juniors get their own list, from junior data only). Team
 * List and Match Day come from fixtures, so they cover upcoming and recent games;
 * Results and Match Summary come from scorecards, any round of any season.
 */
export function carouselChoices(team: CreateTeam): CarouselChoice[] {
  const fixtures = "Upcoming and recent games, by round";
  if (team === "junior")
    return [
      {
        kind: "teamList",
        label: "Junior Team List (round)",
        hint: `${fixtures}: a slide per team`,
      },
      { kind: "matchDay", label: "Junior Match Day", hint: `${fixtures}: a slide per game` },
      {
        kind: "matchSummary",
        label: "Junior Match Summary",
        hint: "Completed junior games, any season: a slide per game",
      },
    ];
  const history = "Any round, from any season the club has played";
  return [
    { kind: "teamList", label: "Team List (round)", hint: `${fixtures}: a slide per team` },
    { kind: "matchDay", label: "Match Day", hint: `${fixtures}: a slide per game` },
    { kind: "resultsSummary", label: "Results", hint: `${history}: a slide per result` },
    { kind: "matchSummary", label: "Match Summary", hint: `${history}: a slide per game` },
  ];
}

/** Where a team's names come from, shown on each team in "Which team?". */
export type TeamSource = "selection" | "playhq" | "draft" | "none";

export const TEAM_SOURCE_LABELS: Record<TeamSource, string> = {
  selection: "Selection Hub",
  playhq: "PlayHQ",
  draft: "Draft",
  none: "Fill in by hand",
};

/**
 * A fixture's saved team list as a badge. The badge says where the names came
 * from; it never changes which list is used (the prefill reads the saved list,
 * as Create a card does). A saved list with no players has no names to fill
 * from, so it is "Fill in by hand" like no list at all.
 */
export function teamSourceOf(
  list: Pick<TeamListSourceSummary, "isPublished" | "source" | "playerCount"> | null | undefined,
): TeamSource {
  if (!list || list.playerCount <= 0) return "none";
  if (list.source === "playhq") return "playhq";
  if (!list.isPublished) return "draft";
  return "selection";
}

/**
 * The badge sources by fixture id, from one team-list-sources read (senior or
 * junior). Null while that read hasn't answered, so no badge is shown rather
 * than a wrong "Fill in by hand".
 */
export function teamSourcesById(
  rows: readonly TeamListSourceSummary[] | undefined,
): Map<number, TeamListSourceSummary> | null {
  if (!rows) return null;
  return new Map(rows.map((r) => [r.fixtureId, r]));
}

/**
 * "Pick by hand": a carousel of blank pages with no data (a free set), drawn like the
 * kind's main page, the same blank page the set editor's "Blank page" adds.
 */
export function blankCarouselDocument(kind: string, count = 3) {
  return {
    formatVersion: 2 as const,
    set: "free" as const,
    pages: Array.from({ length: count }, (_, i) => ({
      id: `page-${i + 1}`,
      role: "fixed" as const,
      slot: "page" as const,
      kind,
      page: primaryPage(kind),
      name: `Page ${i + 1}`,
      layers: [],
    })),
  };
}
