import type { CardTemplate, CardTemplateSlot } from "@workspace/api-client-react";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import type { CardKind, ShareCardInput } from "./share-card";
import { listPackManifests } from "./pack-templates/registry";

export type { CardTemplate, CardTemplateSlot };

// A single data field an admin can bind a template slot to. `type` decides
// which kind of slot may bind it (text → text slot, photo → photo slot).
export type TemplateFieldDef = {
  key: string;
  label: string;
  type: "text" | "photo";
};

const seasonLabel = (year: number) =>
  `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

// Fields common to every card kind (resolved from render options / club config).
export const COMMON_FIELDS: TemplateFieldDef[] = [
  { key: "clubName", label: "Club name", type: "text" },
  { key: "clubUrl", label: "Club URL", type: "text" },
  { key: "hashtag", label: "Hashtag", type: "text" },
  { key: "headline", label: "Headline", type: "text" },
];

const PHOTO_FIELD: TemplateFieldDef = { key: "photo", label: "Photo", type: "photo" };

// Per-kind bindable fields. Mirrors the ShareCardInput shapes (see share-card.ts)
// plus the per-kind defaults the built-in renderer derives (tier/category labels).
export const CARD_FIELD_CATALOG: Record<CardKind, TemplateFieldDef[]> = {
  milestone: [
    { key: "playerName", label: "Player name", type: "text" },
    { key: "tierLabel", label: "Tier label", type: "text" },
    { key: "milestoneLabel", label: "Milestone label", type: "text" },
    { key: "currentValue", label: "Current value", type: "text" },
    { key: "threshold", label: "Threshold", type: "text" },
    PHOTO_FIELD,
  ],
  player: [
    { key: "playerName", label: "Player name", type: "text" },
    { key: "gradesPlayed", label: "Grades played", type: "text" },
    { key: "stat1Value", label: "Stat 1 value", type: "text" },
    { key: "stat1Label", label: "Stat 1 label", type: "text" },
    { key: "stat2Value", label: "Stat 2 value", type: "text" },
    { key: "stat2Label", label: "Stat 2 label", type: "text" },
    { key: "stat3Value", label: "Stat 3 value", type: "text" },
    { key: "stat3Label", label: "Stat 3 label", type: "text" },
    { key: "stat4Value", label: "Stat 4 value", type: "text" },
    { key: "stat4Label", label: "Stat 4 label", type: "text" },
    PHOTO_FIELD,
  ],
  record: [
    { key: "title", label: "Record title", type: "text" },
    { key: "playerName", label: "Player name", type: "text" },
    { key: "value", label: "Value", type: "text" },
    { key: "grade", label: "Grade", type: "text" },
    PHOTO_FIELD,
  ],
  gradeLeader: [
    { key: "grade", label: "Grade", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "playerName", label: "Player name", type: "text" },
    { key: "value", label: "Value", type: "text" },
    PHOTO_FIELD,
  ],
  premiership: [
    { key: "grade", label: "Grade", type: "text" },
    { key: "season", label: "Season", type: "text" },
    { key: "competition", label: "Competition", type: "text" },
    { key: "result", label: "Result", type: "text" },
    { key: "mom", label: "Player of the match", type: "text" },
  ],
  debut: [
    { key: "playerName", label: "Player name", type: "text" },
    { key: "grade", label: "Grade", type: "text" },
    { key: "capNumber", label: "Cap number", type: "text" },
    { key: "season", label: "Season", type: "text" },
    { key: "opponent", label: "Opponent", type: "text" },
    { key: "round", label: "Round", type: "text" },
    PHOTO_FIELD,
  ],
  newCap: [
    { key: "playerName", label: "Player name", type: "text" },
    { key: "grade", label: "Grade", type: "text" },
    { key: "capNumber", label: "Cap number", type: "text" },
    PHOTO_FIELD,
  ],
  century: [
    { key: "playerName", label: "Player name", type: "text" },
    { key: "grade", label: "Grade", type: "text" },
    { key: "runs", label: "Runs", type: "text" },
    { key: "balls", label: "Balls", type: "text" },
    { key: "opponent", label: "Opponent", type: "text" },
    { key: "round", label: "Round", type: "text" },
    PHOTO_FIELD,
  ],
  fiveFor: [
    { key: "playerName", label: "Player name", type: "text" },
    { key: "grade", label: "Grade", type: "text" },
    { key: "wickets", label: "Wickets", type: "text" },
    { key: "figures", label: "Figures", type: "text" },
    { key: "overs", label: "Overs", type: "text" },
    { key: "opponent", label: "Opponent", type: "text" },
    { key: "round", label: "Round", type: "text" },
    PHOTO_FIELD,
  ],
  matchSummary: [
    { key: "matchTitle", label: "Match title", type: "text" },
    { key: "matchType", label: "Match type", type: "text" },
    { key: "date", label: "Date", type: "text" },
    { key: "venue", label: "Venue", type: "text" },
    { key: "result", label: "Result", type: "text" },
  ],
  matchDay: [
    { key: "roundLabel", label: "Round label", type: "text" },
    { key: "oppositionName", label: "Opposition name", type: "text" },
    { key: "homeAway", label: "Home / away", type: "text" },
    { key: "venue", label: "Venue", type: "text" },
    { key: "date", label: "Date", type: "text" },
    { key: "startTime", label: "Start time", type: "text" },
    { key: "noteTitle", label: "Note title", type: "text" },
    { key: "noteBody", label: "Note body", type: "text" },
  ],
  // Player rows bind via the pack templates' repeat groups, not as single fields.
  teamList: [
    { key: "gradeRound", label: "Grade / round", type: "text" },
    { key: "competitionLine", label: "Competition line", type: "text" },
    { key: "venueDateTime", label: "Venue, date & time", type: "text" },
  ],
  // Match blocks bind via the pack templates' repeat groups, not as single fields.
  weekendWrap: [
    { key: "roundLabel", label: "Round label", type: "text" },
    { key: "dateRange", label: "Date range", type: "text" },
  ],
  // Ladder rows bind via the pack templates' repeat groups, not as single fields.
  ladder: [
    { key: "competitionName", label: "Competition name", type: "text" },
    { key: "gradeLabel", label: "Grade label", type: "text" },
    { key: "asOfLabel", label: "As-of label", type: "text" },
  ],
  bigMoment: [
    { key: "momentLabel", label: "Moment label", type: "text" },
    { key: "playerName", label: "Player name", type: "text" },
    { key: "runs", label: "Runs", type: "text" },
    { key: "balls", label: "Balls", type: "text" },
    { key: "boundaryDetail", label: "Boundary detail", type: "text" },
    { key: "oppositionName", label: "Opposition name", type: "text" },
    { key: "inningsLabel", label: "Innings label", type: "text" },
    { key: "liveScore", label: "Live score", type: "text" },
    { key: "oversChaseLine", label: "Overs / chase line", type: "text" },
    { key: "equation", label: "Equation", type: "text" },
    PHOTO_FIELD,
  ],
  newSigning: [
    { key: "playerFirstName", label: "Player first name", type: "text" },
    { key: "playerLastName", label: "Player last name", type: "text" },
    { key: "role", label: "Role", type: "text" },
    { key: "formerClub", label: "Former club", type: "text" },
    { key: "season", label: "Season", type: "text" },
    PHOTO_FIELD,
  ],
  countdown: [
    { key: "daysToGo", label: "Days to go", type: "text" },
    { key: "eventLabel", label: "Event label", type: "text" },
    { key: "hypeLine1", label: "Hype line 1", type: "text" },
    { key: "hypeLine2", label: "Hype line 2", type: "text" },
    { key: "dateVenue", label: "Date & venue", type: "text" },
    { key: "fixtureLine", label: "Fixture line", type: "text" },
  ],
  // Leader rows also bind via pack repeat groups; flattened here like player stats.
  clubLeaderboard: [
    { key: "title", label: "Title", type: "text" },
    { key: "subtitle", label: "Subtitle", type: "text" },
    { key: "season", label: "Season", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "leader1Grade", label: "Leader 1 grade", type: "text" },
    { key: "leader1Name", label: "Leader 1 name", type: "text" },
    { key: "leader1Value", label: "Leader 1 value", type: "text" },
    { key: "leader2Grade", label: "Leader 2 grade", type: "text" },
    { key: "leader2Name", label: "Leader 2 name", type: "text" },
    { key: "leader2Value", label: "Leader 2 value", type: "text" },
    { key: "leader3Grade", label: "Leader 3 grade", type: "text" },
    { key: "leader3Name", label: "Leader 3 name", type: "text" },
    { key: "leader3Value", label: "Leader 3 value", type: "text" },
    { key: "leader4Grade", label: "Leader 4 grade", type: "text" },
    { key: "leader4Name", label: "Leader 4 name", type: "text" },
    { key: "leader4Value", label: "Leader 4 value", type: "text" },
  ],
};

// All bindable fields for a kind, common fields first.
export const fieldsForKind = (kind: CardKind): TemplateFieldDef[] => [
  ...COMMON_FIELDS,
  ...CARD_FIELD_CATALOG[kind],
];

// The union of fields available across a set of card kinds (deduped by key),
// used when a single template applies to several kinds.
export const fieldsForKinds = (kinds: CardKind[]): TemplateFieldDef[] => {
  if (kinds.length === 0) {
    // Empty = applies to all kinds; offer the superset.
    kinds = Object.keys(CARD_FIELD_CATALOG) as CardKind[];
  }
  const seen = new Set<string>();
  const out: TemplateFieldDef[] = [];
  for (const f of COMMON_FIELDS) {
    if (!seen.has(f.key)) {
      seen.add(f.key);
      out.push(f);
    }
  }
  for (const k of kinds) {
    for (const f of CARD_FIELD_CATALOG[k]) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        out.push(f);
      }
    }
  }
  return out;
};

export const fieldLabel = (key: string): string => {
  for (const f of COMMON_FIELDS) if (f.key === key) return f.label;
  for (const kind of Object.keys(CARD_FIELD_CATALOG) as CardKind[]) {
    for (const f of CARD_FIELD_CATALOG[kind]) if (f.key === key) return f.label;
  }
  return key;
};

export const templateAppliesToKind = (
  template: Pick<CardTemplate, "cardKinds" | "isActive">,
  kind: CardKind,
): boolean =>
  template.isActive &&
  (template.cardKinds.length === 0 || template.cardKinds.includes(kind));

/**
 * The design pack a tenant has chosen for `kind`, or `null` for the default.
 *
 * A tenant selects a pack by marking one of its `source: "pack"` template rows
 * (materialised per tenant by `ensurePackTemplates`) as the default for a kind.
 * This is the single place that decision is read, so the composer preview, the
 * Studio gallery, the carousel and the export modal cannot disagree about which
 * pack a card belongs to.
 *
 * Returns `null` rather than the default pack id so callers pass through the
 * renderer's own fallback — one definition of "the default", not two.
 */
export const resolvePackIdForKind = (
  templates: readonly CardTemplate[] | undefined | null,
  kind: CardKind,
): string | null => {
  if (!templates?.length) return null;
  const packRows = templates.filter(
    (t) => t.source === "pack" && templateAppliesToKind(t, kind),
  );
  const chosen =
    packRows.find((t) => t.defaultForKinds?.includes(kind)) ??
    packRows.find((t) => t.isDefault);
  return chosen?.packId ?? null;
};

/**
 * The design packs a tenant may choose for `kind` — the distinct `packId`s that
 * have an active `source: "pack"` row applying to that kind.
 *
 * Filtering goes through {@link templateAppliesToKind} so "applies to this
 * kind" means exactly what {@link resolvePackIdForKind} means by it: a pack the
 * switcher offers is always a pack the resolver can then return.
 *
 * Ordered by `listPackManifests()` (registration order) so the switcher's
 * option list matches the catalogue rather than the row ids the rows happened
 * to be materialised with. A row whose `packId` is not registered — a pack
 * withdrawn from the code but still present in the tenant's rows — is appended
 * after the registered packs, lowest row id first, so it stays selectable
 * (`getPackManifest` falls back for it) without displacing the catalogue.
 */
export const listSelectablePacksForKind = (
  templates: readonly CardTemplate[] | undefined | null,
  kind: CardKind,
): string[] => {
  if (!templates?.length) return [];
  const lowestIdByPack = new Map<string, number>();
  for (const t of templates) {
    if (t.source !== "pack" || !t.packId) continue;
    if (!templateAppliesToKind(t, kind)) continue;
    const seen = lowestIdByPack.get(t.packId);
    if (seen === undefined || t.id < seen) lowestIdByPack.set(t.packId, t.id);
  }
  if (lowestIdByPack.size === 0) return [];

  const registered = listPackManifests()
    .map((m) => m.packId)
    .filter((packId) => lowestIdByPack.has(packId));
  const unregistered = [...lowestIdByPack.entries()]
    .filter(([packId]) => !registered.includes(packId))
    .sort((a, b) => a[1] - b[1])
    .map(([packId]) => packId);
  return [...registered, ...unregistered];
};

/**
 * The one row a pack's default-for-kind claim is written to: the lowest-id
 * active `source: "pack"` row for `packId`, or `null` when the pack has none.
 *
 * A pack materialises three rows (square / portrait / story) and
 * {@link resolvePackIdForKind} reads only `packId`, so any of them would
 * resolve — but writing to more than one is wrong. The server's
 * `clearDefaultKinds` strips the claimed kinds from every *other* row on each
 * PATCH, so sequential writes across the variants would leave only the last.
 * Every caller claims through this helper so they all agree on which row that
 * is. Kind scope is deliberately not considered: the variants of a pack share
 * the pack's `cardKinds`, and the claim belongs to the pack, not a format.
 */
export const canonicalPackRowFor = (
  templates: readonly CardTemplate[] | undefined | null,
  packId: string,
): CardTemplate | null => {
  if (!templates?.length || !packId) return null;
  let chosen: CardTemplate | null = null;
  for (const t of templates) {
    if (t.source !== "pack" || t.packId !== packId || !t.isActive) continue;
    if (!chosen || t.id < chosen.id) chosen = t;
  }
  return chosen;
};

/**
 * The `defaultForKinds` value to PATCH so `row` claims `kind`, added
 * idempotently — re-claiming a kind the row already owns is a no-op rather than
 * a duplicate entry. Returns a new array; the row is never mutated.
 */
export const nextDefaultForKinds = (
  row: Pick<CardTemplate, "defaultForKinds"> | undefined | null,
  kind: CardKind,
): string[] => {
  const current = row?.defaultForKinds ?? [];
  return current.includes(kind) ? [...current] : [...current, kind];
};

/**
 * The tenant's own (non-pack) templates that currently hold a default for any
 * of `kinds` — i.e. exactly what a pack claim over those kinds will strip.
 *
 * `defaultForKinds` is one namespace shared by pack rows and tenant-authored
 * templates, and the server's `clearDefaultKinds` filters on tenant and array
 * overlap only — it is source-agnostic and does not look at `isActive`. So
 * claiming a kind for a pack silently clears that kind's default from the
 * tenant's own `layers` / `background` templates, which changes which renderer
 * runs for the card. This mirrors that predicate (minus the source, which is
 * inverted here) so the UI can state the cost before the write lands.
 */
export const byoDefaultsClearedBy = (
  templates: readonly CardTemplate[] | undefined | null,
  kinds: readonly CardKind[],
): CardTemplate[] => {
  if (!templates?.length || !kinds.length) return [];
  return templates.filter(
    (t) =>
      t.source !== "pack" && (t.defaultForKinds ?? []).some((k) => kinds.includes(k as CardKind)),
  );
};

/**
 * The tenant-authored template the export modal pre-selects for `kind`, or
 * `null` to keep the built-in layout.
 *
 * `source: "pack"` rows are deliberately excluded. A pack row records *which
 * design pack* a kind uses; that decision is read in exactly one place,
 * {@link resolvePackIdForKind}, and the modal takes its pack from there like
 * the gallery, composer and carousel do. A pack row is not a BYO layout choice,
 * so treating one as the modal's pre-selected template would show a pack
 * variant row (always the canonical square one, whatever size is being
 * exported) in the layout control as though an admin had picked it — and route
 * the card down the selected-template path instead of the pack path. The
 * exclusion covers the legacy global `isDefault` fallback too, since nothing
 * stops a pack row carrying that flag.
 */
export const resolveDefaultLayoutTemplate = (
  templates: readonly CardTemplate[] | undefined | null,
  kind: CardKind,
): CardTemplate | null => {
  if (!templates?.length) return null;
  const byoRows = templates.filter(
    (t) => t.source !== "pack" && templateAppliesToKind(t, kind),
  );
  return (
    byoRows.find((t) => t.defaultForKinds?.includes(kind)) ??
    byoRows.find((t) => t.isDefault) ??
    null
  );
};

export type TemplateContext = {
  clubName?: string;
  clubUrl?: string;
  hashtag?: string;
  /** Overrides the input's baked photo (e.g. the modal's chosen photo). */
  photoUrl?: string | null;
};

const str = (v: unknown): string =>
  v == null ? "" : typeof v === "number" ? v.toLocaleString() : String(v);

// Resolve a text field's value for a given card. Returns "" for fields not
// present on this card kind so a multi-kind template degrades gracefully.
export const resolveTextField = (
  input: ShareCardInput,
  key: string,
  ctx: TemplateContext,
): string => {
  switch (key) {
    case "clubName":
      return ctx.clubName ?? DEFAULT_BRAND.name;
    case "clubUrl":
      return ctx.clubUrl ?? "";
    case "hashtag":
      return ctx.hashtag ?? "";
    case "headline":
      return "headline" in input ? input.headline ?? "" : "";
  }

  switch (input.kind) {
    case "milestone": {
      const map: Record<string, string> = {
        playerName: input.playerName,
        tierLabel: input.tierLabel,
        milestoneLabel: input.milestoneLabel,
        currentValue: str(input.currentValue),
        threshold: input.threshold ? str(input.threshold) : "",
      };
      return map[key] ?? "";
    }
    case "player": {
      const base: Record<string, string> = {
        playerName: input.playerName,
        gradesPlayed: input.gradesPlayed ?? "",
      };
      const m = key.match(/^stat([1-9])(Value|Label)$/);
      if (m) {
        const idx = Number(m[1]) - 1;
        const stat = input.stats[idx];
        if (!stat) return "";
        return m[2] === "Value" ? str(stat.value) : stat.label;
      }
      return base[key] ?? "";
    }
    case "record": {
      const map: Record<string, string> = {
        title: input.title,
        playerName: input.playerName,
        value: str(input.value),
        grade: input.grade ?? "",
      };
      return map[key] ?? "";
    }
    case "gradeLeader": {
      const map: Record<string, string> = {
        grade: input.grade,
        category: input.category,
        playerName: input.playerName,
        value: str(input.value),
      };
      return map[key] ?? "";
    }
    case "premiership": {
      const map: Record<string, string> = {
        grade: input.grade,
        season: seasonLabel(input.year),
        competition: input.competition,
        result: input.result ?? "",
        mom: input.mom ?? "",
      };
      return map[key] ?? "";
    }
    case "debut": {
      const map: Record<string, string> = {
        playerName: input.playerName,
        grade: input.grade,
        capNumber: input.capNumber != null ? str(input.capNumber) : "",
        season: input.season ?? "",
        opponent: input.opponent ?? "",
        round: input.round != null ? str(input.round) : "",
      };
      return map[key] ?? "";
    }
    case "newCap": {
      const map: Record<string, string> = {
        playerName: input.playerName,
        grade: input.grade,
        capNumber: str(input.capNumber),
      };
      return map[key] ?? "";
    }
    case "century": {
      const map: Record<string, string> = {
        playerName: input.playerName,
        grade: input.grade,
        runs: `${input.runs}${input.notOut ? "*" : ""}`,
        balls: input.balls != null ? str(input.balls) : "",
        opponent: input.opponent ?? "",
        round: input.round != null ? str(input.round) : "",
      };
      return map[key] ?? "";
    }
    case "fiveFor": {
      const map: Record<string, string> = {
        playerName: input.playerName,
        grade: input.grade,
        wickets: str(input.wickets),
        figures: input.figures ?? str(input.wickets),
        overs: input.overs ?? "",
        opponent: input.opponent ?? "",
        round: input.round != null ? str(input.round) : "",
      };
      return map[key] ?? "";
    }
    case "matchSummary": {
      const map: Record<string, string> = {
        matchTitle: input.matchTitle,
        matchType: input.matchType ?? "",
        date: input.date ?? "",
        venue: input.venue ?? "",
        result: input.result,
      };
      return map[key] ?? "";
    }
    case "matchDay": {
      const map: Record<string, string> = {
        roundLabel: input.roundLabel,
        oppositionName: input.oppositionName,
        homeAway: input.homeAway,
        venue: input.venue,
        date: input.date,
        startTime: input.startTime,
        noteTitle: input.noteTitle ?? "",
        noteBody: input.noteBody ?? "",
      };
      return map[key] ?? "";
    }
    case "teamList": {
      const map: Record<string, string> = {
        gradeRound: input.gradeRound,
        competitionLine: input.competitionLine,
        venueDateTime: input.venueDateTime,
      };
      return map[key] ?? "";
    }
    case "weekendWrap": {
      const map: Record<string, string> = {
        roundLabel: input.roundLabel,
        dateRange: input.dateRange,
      };
      return map[key] ?? "";
    }
    case "ladder": {
      const map: Record<string, string> = {
        competitionName: input.competitionName,
        gradeLabel: input.gradeLabel,
        asOfLabel: input.asOfLabel,
      };
      return map[key] ?? "";
    }
    case "bigMoment": {
      const map: Record<string, string> = {
        momentLabel: input.momentLabel,
        playerName: input.playerName,
        runs: input.runs != null ? str(input.runs) : "",
        balls: input.balls != null ? str(input.balls) : "",
        boundaryDetail: input.boundaryDetail ?? "",
        oppositionName: input.oppositionName ?? "",
        inningsLabel: input.inningsLabel ?? "",
        liveScore: input.liveScore ?? "",
        oversChaseLine: input.oversChaseLine ?? "",
        equation: input.equation ?? "",
      };
      return map[key] ?? "";
    }
    case "newSigning": {
      const map: Record<string, string> = {
        playerFirstName: input.playerFirstName,
        playerLastName: input.playerLastName,
        role: input.role ?? "",
        formerClub: input.formerClub ?? "",
        season: input.season ?? "",
      };
      return map[key] ?? "";
    }
    case "countdown": {
      const map: Record<string, string> = {
        daysToGo: input.daysToGo,
        eventLabel: input.eventLabel,
        hypeLine1: input.hypeLine1 ?? "",
        hypeLine2: input.hypeLine2 ?? "",
        dateVenue: input.dateVenue ?? "",
        fixtureLine: input.fixtureLine ?? "",
      };
      return map[key] ?? "";
    }
    case "clubLeaderboard": {
      const base: Record<string, string> = {
        title: input.title,
        subtitle: input.subtitle ?? "",
        season: input.season,
        category: input.category,
      };
      const m = key.match(/^leader([1-9])(Grade|Name|Value)$/);
      if (m) {
        const leader = input.leaders[Number(m[1]) - 1];
        if (!leader) return "";
        return m[2] === "Grade"
          ? leader.gradeLabel
          : m[2] === "Name"
            ? leader.playerName
            : leader.value;
      }
      return base[key] ?? "";
    }
  }
};

// Resolve the photo URL for a photo slot: explicit context override wins,
// otherwise the input's own baked photo.
export const resolvePhotoField = (
  input: ShareCardInput,
  ctx: TemplateContext,
): string | null => {
  if (ctx.photoUrl !== undefined) return ctx.photoUrl;
  return "photoUrl" in input ? input.photoUrl ?? null : null;
};
