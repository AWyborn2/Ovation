// Card input shapes and shared option types for the share-card renderer.
// Bottom of the share-card dependency graph: this module imports nothing from
// its siblings so every other module can depend on it without cycles.
import type { CardTemplate, CardLayoutLayer } from "@workspace/api-client-react";
import type { HallsHeadBrand } from "@workspace/scorecard";

export const SIZES = {
  square: { w: 1080, h: 1080, label: "Feed square", code: "1080x1080" },
  portrait: { w: 1080, h: 1350, label: "Feed portrait", code: "1080x1350" },
  story: { w: 1080, h: 1920, label: "Story / TikTok", code: "1080x1920" },
} as const;

export type CardSize = keyof typeof SIZES;

export type CardSponsor = {
  name: string;
  logoUrl: string;
};

export type StatLine = {
  label: string; // e.g. "Runs"
  value: string | number; // e.g. 1234 or "3/22"
};

// --- Match Summary card shapes ---------------------------------------------
// A self-contained, two-innings scorecard tile. Team colours/logos are carried
// on the card itself (they come from the opposition club brand + the HHCC
// palette) rather than the theme, so the innings blocks render in true team
// colours. Built either from a stored match (via buildScorecard) or by hand.
export type MatchSummaryTeam = {
  name: string;
  shortName?: string | null;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  logoUrl?: string | null;
};

export type MatchSummaryBatter = {
  name: string;
  runs: number;
  balls?: number | null;
  notOut?: boolean;
};

export type MatchSummaryBowler = {
  name: string;
  wickets: number;
  runs: number;
  overs: string;
};

export type MatchSummaryInnings = {
  teamKey: "club" | "opposition";
  inningsNum: 1 | 2;
  totalRuns: string;
  wickets: string;
  overs: string;
  declared?: boolean;
  topBatters: MatchSummaryBatter[];
  topBowlers: MatchSummaryBowler[];
};

// --- Pack A card shapes ------------------------------------------------------
// Row shapes for the repeat-driven Pack A kinds (team lists, weekend wrap
// blocks, ladder rows, club leaderboard rows). These bind into the pack
// templates' repeat groups rather than as single text fields.
export type TeamListPlayer = {
  order: number;
  surname: string;
  role?: "C" | "WK" | "C/WK";
};

export type WeekendWrapMatch = {
  gradeLabel: string;
  resultLine: string;
  performers: string;
  outcome: "won" | "lost" | "draw";
};

export type LadderRow = {
  pos: number;
  team: string;
  played: number;
  won: number;
  lost: number;
  points: number | string;
  isClub?: boolean;
};

export type ClubLeaderboardLeader = {
  gradeLabel: string;
  playerName: string;
  value: string;
};

export type ShareCardInput =
  | {
      kind: "milestone";
      playerName: string;
      tierLabel: string;
      tierIndex: number;
      milestoneLabel: string;
      currentValue: number;
      threshold?: number | null;
      headline?: string;
      photoUrl?: string | null;
      /**
       * Marks this as a JUNIOR card: it is forced to render in the junior brown
       * palette (regardless of the selected theme) and gets junior-specific
       * labels/filenames. Junior data stays isolated from senior records.
       */
      junior?: boolean;
    }
  | {
      kind: "player";
      playerName: string;
      gradesPlayed?: string | null;
      stats: StatLine[];
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "record";
      title: string;
      playerName: string;
      value: string | number;
      grade?: string | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "gradeLeader";
      grade: string;
      category: string; // "Runs" | "Wickets" | ...
      playerName: string;
      value: string | number;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "premiership";
      grade: string;
      year: number; // start year, e.g. 2024 for the 2024/25 season
      competition: string;
      result?: string | null;
      mom?: string | null;
      headline?: string;
      /** Uploaded/selected premiership team photo → the `teamPhoto` slot. */
      teamPhotoUrl?: string | null;
    }
  | {
      kind: "debut";
      playerName: string;
      grade: string;
      capNumber?: number | null;
      season?: string | null;
      opponent?: string | null;
      round?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  // `newCap` ("New Cap") used to sit here. Retired in favour of `debut` above —
  // the same moment (a player's first-grade debut IS when they receive their
  // cap) with a superset of its fields (round, opponent, tributeLine).
  | {
      kind: "century";
      playerName: string;
      grade: string;
      runs: number;
      balls?: number | null;
      notOut?: boolean;
      opponent?: string | null;
      round?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "fiveFor";
      playerName: string;
      grade: string;
      wickets: number;
      runsConceded?: number | null;
      overs?: string | null;
      figures?: string | null;
      opponent?: string | null;
      round?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "matchSummary";
      matchTitle: string; // e.g. "A Grade • Round 5"
      matchType?: string | null; // e.g. "One Day"
      date?: string | null;
      venue?: string | null;
      result: string;
      resultWinner: "club" | "opposition" | "draw";
      club: MatchSummaryTeam;
      opposition: MatchSummaryTeam;
      innings: MatchSummaryInnings[];
      headline?: string;
      /**
       * Marks this as a JUNIOR card: forces the junior brown palette and a
       * "JUNIOR MATCH" eyebrow so junior content reads distinctly from senior.
       */
      junior?: boolean;
    }
  | {
      kind: "matchDay";
      roundLabel: string;
      oppositionName: string;
      oppositionLogoUrl?: string | null;
      /** Which side the club is on for this fixture. */
      homeAway: "HOME" | "AWAY";
      venue: string;
      date: string;
      startTime: string;
      noteTitle?: string | null;
      noteBody?: string | null;
      /** JUNIOR card: forces the junior brown palette + junior labels. */
      junior?: boolean;
    }
  | {
      kind: "teamList";
      gradeRound: string;
      competitionLine: string;
      venueDateTime: string;
      players: TeamListPlayer[];
      squadPhotoUrl?: string | null;
      /** JUNIOR card: forces the junior brown palette + junior labels. */
      junior?: boolean;
    }
  | {
      kind: "weekendWrap";
      roundLabel: string;
      dateRange: string;
      matches: WeekendWrapMatch[];
      /** JUNIOR card: forces the junior brown palette + junior labels. */
      junior?: boolean;
    }
  | {
      kind: "ladder";
      competitionName: string;
      gradeLabel: string;
      asOfLabel: string;
      rows: LadderRow[];
      /** JUNIOR card: forces the junior brown palette + junior labels. */
      junior?: boolean;
    }
  | {
      kind: "bigMoment";
      momentLabel: string;
      playerName: string;
      runs?: number | null;
      balls?: number | null;
      boundaryDetail?: string | null;
      oppositionName?: string | null;
      inningsLabel?: string | null;
      liveScore?: string | null;
      oversChaseLine?: string | null;
      equation?: string | null;
      photoUrl?: string | null;
      /** JUNIOR card: forces the junior brown palette + junior labels. */
      junior?: boolean;
    }
  | {
      kind: "newSigning";
      playerFirstName: string;
      playerLastName: string;
      role?: string | null;
      formerClub?: string | null;
      headline?: string;
      season?: string | null;
      photoUrl?: string | null;
    }
  | {
      kind: "countdown";
      /** Admin may set this by hand ("2") or it is computed from the fixture. */
      daysToGo: string;
      eventLabel: string;
      hypeLine1?: string | null;
      hypeLine2?: string | null;
      dateVenue?: string | null;
      fixtureLine?: string | null;
    }
  | {
      kind: "clubLeaderboard";
      title: string;
      subtitle?: string | null;
      season: string;
      category: "Runs" | "Wickets";
      leaders: ClubLeaderboardLeader[];
      /** JUNIOR card: forces the junior brown palette + junior labels. */
      junior?: boolean;
    };

export type CardKind = ShareCardInput["kind"];

export const CARD_KINDS: CardKind[] = [
  "milestone",
  "player",
  "record",
  "gradeLeader",
  "premiership",
  "debut",
  "century",
  "fiveFor",
  "matchSummary",
  "matchDay",
  "teamList",
  "weekendWrap",
  "ladder",
  "bigMoment",
  "newSigning",
  "countdown",
  "clubLeaderboard",
];

// A sponsor with an empty cardKinds list applies to every card type; otherwise
// it only appears on the listed kinds.
export const sponsorAppliesToKind = (
  cardKinds: string[] | null | undefined,
  kind: CardKind,
): boolean => !cardKinds || cardKinds.length === 0 || cardKinds.includes(kind);

// Theme as delivered by the API (`CardTheme`). Colors are hex strings; the two
// optional URLs add a background image and a custom logo. The renderer derives
// the muted / soft accent variants from these base colors.
export type CardTheme = {
  bgDark: string;
  bgPanel: string;
  accent: string;
  textLight: string;
  backgroundImageUrl?: string | null;
  logoUrl?: string | null;
};

// Built-in motion presets applied to a card.
// - "none"    — still card (no animation).
// - "fadeIn"  — whole-card fade (all elements together — the simple case).
// - "slideUp" — whole-card rise + fade (all elements together).
// - "popIn"   — each element scales/pops in independently, staggered.
// - "wipe"    — each element is revealed left→right, staggered.
// - "stagger" — each element slides up + fades in one-by-one (staggered list).
// - "countUp" — each element fades in and numeric values tick up from zero.
// On built-in cards every preset now animates the real layer model, so elements
// can enter independently; fadeIn/slideUp keep zero stagger for the simple case.
export type MotionPreset =
  | "none"
  | "fadeIn"
  | "slideUp"
  | "popIn"
  | "wipe"
  | "stagger"
  | "countUp"
  | "matchReveal";

export type PhotoPlacement = "feature" | "headshot";

// Focal point (0-1, 0.5 = centred) + zoom (>= 1) for a feature photo. Lets the
// club drag/zoom to choose what stays in frame across every card size.
export type PhotoTransform = {
  focalX: number;
  focalY: number;
  zoom: number;
};

export const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = {
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
};

export type RenderOptions = {
  size: CardSize;
  sponsors?: CardSponsor[];
  clubUrl?: string;
  hashtag?: string;
  theme?: CardTheme | null;
  /**
   * Official club brand (logo + colours) from the clubs register, sourced from
   * the social-settings bundle. The renderer uses its logo when no theme logo is
   * set; falls back to the built-in HALLS_HEAD_BRAND when omitted.
   */
  brand?: HallsHeadBrand | null;
  /**
   * Overrides the photo baked into the input. When omitted, the renderer falls
   * back to the input's own `photoUrl`; pass `null` to force no photo.
   */
  photoUrl?: string | null;
  /**
   * "headshot" (default) keeps the existing small circular portrait; "feature"
   * promotes the photo to a full-bleed hero/background with a dark scrim.
   */
  photoPlacement?: PhotoPlacement;
  /**
   * Focal point + zoom for a "feature" photo so the club can drag/zoom to keep
   * the subject in frame. Ignored for headshot placement and theme backgrounds.
   */
  photoTransform?: PhotoTransform | null;
  /**
   * A custom uploaded "bring your own" template. When provided, the card is
   * rendered from the template's flattened background + data-bound slots
   * instead of the built-in layout. The sponsor strip is still overlaid.
   */
  template?: CardTemplate | null;
  /**
   * Built-in motion preset for animated cards. When omitted, falls back to the
   * template's own `motionPreset` (if a template is used) and otherwise "none".
   * Ignored by the still PNG renderer (`renderShareCard`).
   */
  motionPreset?: MotionPreset;
  /**
   * Total clip length in milliseconds for animated cards (preview + video + GIF
   * export). Clamped to a safe band (see `clampDuration`) and defaulted to
   * `DEFAULT_DURATION_MS` when omitted. Ignored by the still PNG renderer.
   */
  durationMs?: number;
  /**
   * Animation speed multiplier (0.5 = slow … 2 = fast, 1 = default). Compresses
   * each element's entrance + the per-element stagger so the motion finishes
   * sooner (and holds longer) without changing the clip length. Clamped 0.5–2.
   */
  speed?: number;
  /**
   * A saved per-card-kind layer layout from the card design studio. When present
   * (and non-empty), each built-in element is repositioned/restacked/hidden by
   * its matching `element` entry and any `image`/`sticker`/`text` entries are
   * drawn as extra layers. Omitted / empty = the pixel-identical built-in layout.
   * Ignored for matchSummary + custom-template cards (they keep their own paths).
   */
  layout?: CardLayoutLayer[] | null;
  /**
   * Background music for animated VIDEO export (and the live preview's optional
   * sound toggle). Admin-authored only; omitted / null = silent (unchanged).
   * `url` is a storage object path served via /api/storage. The clip uses a
   * window of the track starting at `trimStartMs`, looped if shorter than the
   * clip. Ignored by the still PNG renderer and the GIF export (GIF has no
   * audio). A failed load degrades gracefully to a silent clip — never throws.
   */
  audio?: CardAudioSpec | null;
};

/** Resolved background-music selection for an animated clip. */
export type CardAudioSpec = {
  /** Storage object path (served via /api/storage/...). */
  url: string;
  /** Playback gain, 0–1 (1 = full track volume). */
  volume: number;
  /** Offset into the source track where the clip's audio window begins (ms). */
  trimStartMs: number;
};
