/**
 * Output DTO shapes for every honour board: entries, grids, display config, catalog rows.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */

// ---------------------------------------------------------------------------
// Board assembly
// ---------------------------------------------------------------------------

export interface BoardSquadMember {
  name: string;
  playerId: number | null;
  isCaptain: boolean;
}

export interface BoardEntryMeta {
  venue?: string | null;
  date?: string | null;
  motm?: string | null;
  captain?: string | null;
  grade?: string | null;
  parentGrade?: string | null;
  competition?: string | null;
  rank?: number | null;
}

// Aggregated career stats for a life member (mirrors the app's LifeMemberStats,
// summed across grades from player_grade_stats).
export interface LifeMemberStatsOut {
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: string | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  bestBowling: string | null;
  fiveWickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  gradesPlayed: string[];
}

// Extra per-entry data for the life-members board (stats + bio).
export interface LifeMemberInfoOut {
  inducted?: number | null;
  roles?: string | null;
  bio?: string | null;
  playing?: boolean;
  stats?: LifeMemberStatsOut | null;
}

export interface BoardEntry {
  season: string;
  primaryText: string;
  detail?: string | null;
  playerId?: number | null;
  matchId?: number | null;
  meta?: BoardEntryMeta;
  squad?: BoardSquadMember[] | null;
  lifeMember?: LifeMemberInfoOut | null;
}

// Each board keeps its NATURAL layout; the chosen skin only changes the look.
// "columns" is a composite layout: several list boards rendered side-by-side.
// "grid" is the opt-in season-grid matrix (rows × admin-chosen columns).
// "lifeMembers" is the two-column stat-tile + bio card layout.
export type BoardLayout =
  | "premiership"
  | "teamOfDecade"
  | "list"
  | "columns"
  | "grid"
  | "lifeMembers";

export type BoardTransition = "scroll" | "slide" | "wrap";

// --- Season-grid matrix (opt-in layout) ---
export interface GridCellEntryOut {
  text: string;
  playerId?: number | null;
  note?: string | null;
}
export interface GridCellOut {
  entries: GridCellEntryOut[];
}
export interface GridRowOut {
  heading: string;
  cells: GridCellOut[];
}
export interface BoardGridOut {
  rowHeading: string;
  columnHeadings: string[];
  rows: GridRowOut[];
}

export interface GridColumnOptionOut {
  key: string;
  label: string;
}
export interface GridCatalogEntryOut {
  id: string;
  title: string;
  options: GridColumnOptionOut[];
}

// Resolved (always-present) per-board display config sent to the client.
export interface BoardDisplayOut {
  columns: number; // multi-column list flow count (1..3); 1 for non-list layouts
  transition: BoardTransition;
  fit: boolean; // drop the height cap and fill the viewport
  wrapBlocks: number; // side-by-side block count for the "wrap" fill mode (2..4)
}

// One column of a composite "columns" board.
export interface BoardColumnOut {
  heading: string;
  entries: BoardEntry[];
}

export interface HonourBoardOut {
  id: string;
  category: string;
  layout: BoardLayout;
  title: string;
  subtitle?: string | null;
  entries: BoardEntry[];
  // Only set for the "columns" layout (composite boards).
  columns?: BoardColumnOut[] | null;
  // Only set for the "grid" layout (season-grid matrix).
  grid?: BoardGridOut | null;
  // Effective per-board skin (null = club-wide) + footnote, resolved from the
  // board config / composite / custom-grid definition by assembleBoards.
  skin?: string | null;
  footnote?: string | null;
  // Stamped onto every board by assembleBoards before serialization.
  display?: BoardDisplayOut;
}
