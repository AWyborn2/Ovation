import type { CardTemplate, CardTemplateSlot } from "@workspace/api-client-react";
import type { CardKind, ShareCardInput } from "./share-card";

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
      return ctx.clubName ?? "Halls Head Cricket Club";
    case "clubUrl":
      return ctx.clubUrl ?? "hallsheadcricket.com.au";
    case "hashtag":
      return ctx.hashtag ?? "#HHCC";
    case "headline":
      return input.headline ?? "";
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
