export type Format = 'landscape' | 'square' | 'portrait';

/** Tenant-swappable team brand slots. Looks never hard-code club colours. */
export interface TeamTokens {
  id: string; name: string; short: string;
  /** The team's identifying colour (bars, result fill). */
  colour: string; onColour: string;
  /** Readable version of `colour` on dark panels. */
  colourOnDark: string;
  /** Darkest brand colour + its highlight (dark bars with bright text). */
  dark: string; bright: string;
  /** Secondary surface (Panel headers, logo tiles) + text on it. */
  secondary: string; onSecondary: string;
  logo: string; logoOnDark?: string;
}
export interface Competition { name: string; association?: string; logo?: string | null; colour?: string; accent?: string; }
export interface Batter { name: string; runs: number; balls?: number; notOut?: boolean; }
export interface Bowler { name: string; wickets: number; runs: number; overs: string; }
export interface Innings { team: string; overs: string; runs: number; wickets: number; batting: Batter[]; bowling: Bowler[]; }
export interface Match {
  home: string; away: string; grade?: string; venue: string; date?: string;
  winner: string; result: string; innings: Innings[];
}
export interface MatchSummaryBaseProps {
  match?: Match; teams?: Record<string, TeamTokens>; competition?: Competition;
  format?: Format;
  /** Top N batters / bowlers per innings. */
  rows?: number;
  showBalls?: boolean;
  /** Full-bleed photo URL; null for plain black. */
  background?: string | null;
  /** Graphic scale inside the canvas. */
  scale?: number;
  /** Prefix for relative asset paths. */
  assetBase?: string;
}

/** Broadcast match summary — Angled teal title bar, grey textured panel, team bars with circle logos. */
export interface BroadcastSummaryProps extends MatchSummaryBaseProps { theme?: "broadcast" | "club"; showResult?: boolean; }
export declare function BroadcastSummary(props: BroadcastSummaryProps): JSX.Element;

/** Panel match summary — Chrome-framed panel with glossy team headers and tiled player rows. */
export interface PanelSummaryProps extends MatchSummaryBaseProps { theme?: "club" | "broadcast"; }
export declare function PanelSummary(props: PanelSummaryProps): JSX.Element;

/** Clean match summary — Minimal dark glass panel led by the competition logo. */
export interface CleanSummaryProps extends MatchSummaryBaseProps { panelOpacity?: number; }
export declare function CleanSummary(props: CleanSummaryProps): JSX.Element;

/** Classic match summary — White header with angled logo tiles, alternating grey rows and winner-coloured stripes. */
export interface ClassicSummaryProps extends MatchSummaryBaseProps { stripes?: boolean; }
export declare function ClassicSummary(props: ClassicSummaryProps): JSX.Element;

/** Digital Scoreboard match summary — Navy LED board with glowing, team-outlined innings boxes. */
export interface ScoreboardSummaryProps extends MatchSummaryBaseProps { initials?: boolean; ledTexture?: number; }
export declare function ScoreboardSummary(props: ScoreboardSummaryProps): JSX.Element;

/** Ground Scoreboard match summary — Stadium board: batter cells in batting-team colours, bowler cells in bowling-team colours, association panel. */
export interface GroundScoreboardSummaryProps extends MatchSummaryBaseProps { ledTexture?: number; }
export declare function GroundScoreboardSummary(props: GroundScoreboardSummaryProps): JSX.Element;

/** T20 match summary — Big-Bash style: winner tile left, glass stripes, black rows. */
export interface T20SummaryProps extends MatchSummaryBaseProps { surnameOnly?: boolean; backgroundDim?: number; }
export declare function T20Summary(props: T20SummaryProps): JSX.Element;

/** Colour helpers: t > 0 lightens toward white, t < 0 darkens. */
export declare function shade(hex: string, t: number): string;
export declare function isLight(hex: string): boolean;
export declare function readableOn(hex: string): string;
export declare const SAMPLE_TEAMS: Record<string, TeamTokens>;
export declare const SAMPLE_COMPETITION: Competition;
export declare const SAMPLE_MATCH: Match;

// ── Layer components
/** Broadcast layer — Grey textured panel behind the Broadcast graphic: angled light planes, side bevels, paper grain. */
export interface BroadcastPanelProps {}
export declare function BroadcastPanel(props: BroadcastPanelProps): JSX.Element;
/** Broadcast layer — Angled teal ribbon reading HOME vs AWAY, with the venue, date and Match Summary under it. */
export interface BroadcastTitleBarProps { home?: TeamTokens; away?: TeamTokens; venue?: string; date?: string; }
export declare function BroadcastTitleBar(props: BroadcastTitleBarProps): JSX.Element;
/** Broadcast layer — One innings bar: folded ends, glossy bar, circle logo, team name and grade, overs and score. */
export interface BroadcastInningsBarProps { club?: TeamTokens; overs?: string; wickets?: number; runs?: number; grade?: string; theme?: 'broadcast' | 'club'; colours?: { dark: string; light: string; fold: string; text: string }; assetBase?: string; }
export declare function BroadcastInningsBar(props: BroadcastInningsBarProps): JSX.Element;
/** Broadcast layer — One Broadcast batting row: name, runs (with * when not out), balls faced. */
export interface BroadcastBatterRowProps { batter: Batter; showBalls?: boolean; }
export declare function BroadcastBatterRow(props: BroadcastBatterRowProps): JSX.Element;
/** Broadcast layer — One Broadcast bowling row: name, wickets-runs, overs. */
export interface BroadcastBowlerRowProps { bowler: Bowler; showBalls?: boolean; }
export declare function BroadcastBowlerRow(props: BroadcastBowlerRowProps): JSX.Element;
/** Broadcast layer — Two-column batting and bowling list that sits under a Broadcast innings bar. */
export interface BroadcastPlayerListProps { batting?: Batter[]; bowling?: Bowler[]; rows?: number; showBalls?: boolean; gap?: number; }
export declare function BroadcastPlayerList(props: BroadcastPlayerListProps): JSX.Element;
/** Broadcast layer — Angled teal result bar; shown by default on square and portrait. */
export interface BroadcastResultBarProps { result?: string; }
export declare function BroadcastResultBar(props: BroadcastResultBarProps): JSX.Element;
/** Panel layer — Brushed-chrome frame with 20px corners that holds the whole Panel graphic. */
export interface PanelFrameProps { children?: any; }
export declare function PanelFrame(props: PanelFrameProps): JSX.Element;
/** Panel layer — Chrome title cap reading Match Summary, with a top glare. */
export interface PanelHeaderProps { title?: string; }
export declare function PanelHeader(props: PanelHeaderProps): JSX.Element;
/** Panel layer — Dark recessed well that holds both innings inside the chrome frame. */
export interface PanelWellProps { children?: any; }
export declare function PanelWell(props: PanelWellProps): JSX.Element;
/** Panel layer — Glossy innings header: logo tile, team name, overs, divider and score. */
export interface PanelInningsHeaderProps { club?: TeamTokens; overs?: string; wickets?: number; runs?: number; palette?: object; theme?: 'club' | 'broadcast'; assetBase?: string; }
export declare function PanelInningsHeader(props: PanelInningsHeaderProps): JSX.Element;
/** Panel layer — One glossy tiled player row in the team colour; empty when there is no player. */
export interface PanelPlayerRowProps { player?: Batter | Bowler; kind?: 'bat' | 'bowl'; palette?: object; }
export declare function PanelPlayerRow(props: PanelPlayerRowProps): JSX.Element;
/** Panel layer — Batting and bowling tile columns for one innings, padded to the row count. */
export interface PanelPlayerGridProps { batting?: Batter[]; bowling?: Bowler[]; rows?: number; palette?: object; }
export declare function PanelPlayerGrid(props: PanelPlayerGridProps): JSX.Element;
/** Panel layer — Chrome result plate under the well. */
export interface PanelResultBarProps { result?: string; }
export declare function PanelResultBar(props: PanelResultBarProps): JSX.Element;
/** Clean layer — Competition logo, Match Summary and the competition and venue lines. */
export interface CleanHeaderProps { competition?: Competition; venue?: string; assetBase?: string; }
export declare function CleanHeader(props: CleanHeaderProps): JSX.Element;
/** Clean layer — Innings header line: logo on dark, team name and score in colourOnDark, overs. */
export interface CleanInningsHeaderProps { club?: TeamTokens; overs?: string; wickets?: number; runs?: number; assetBase?: string; }
export declare function CleanInningsHeader(props: CleanInningsHeaderProps): JSX.Element;
/** Clean layer — One Clean player line: name, bold figure, small secondary numeral. */
export interface CleanPlayerRowProps { player: Batter | Bowler; kind?: 'bat' | 'bowl'; showBalls?: boolean; }
export declare function CleanPlayerRow(props: CleanPlayerRowProps): JSX.Element;
/** Clean layer — Two-column batting and bowling list, indented under the innings header. */
export interface CleanPlayerListProps { batting?: Batter[]; bowling?: Bowler[]; rows?: number; showBalls?: boolean; gap?: number; }
export declare function CleanPlayerList(props: CleanPlayerListProps): JSX.Element;
/** Clean layer — Translucent band with a hairline top that wraps one innings. */
export interface CleanInningsBandProps { gap?: number; children?: any; }
export declare function CleanInningsBand(props: CleanInningsBandProps): JSX.Element;
/** Clean layer — Result bar filled with the winner's colour and onColour text. */
export interface CleanResultBarProps { result?: string; winner?: TeamTokens; }
export declare function CleanResultBar(props: CleanResultBarProps): JSX.Element;
/** Classic layer — Winner-coloured glass stripes skewed −14° at both edges of the canvas. */
export interface ClassicStripesProps { winner?: TeamTokens; }
export declare function ClassicStripes(props: ClassicStripesProps): JSX.Element;
/** Classic layer — Angled logo tile in a team's dark with its shadow sliver, cut into the header's edge. */
export interface ClassicLogoTileProps { team?: TeamTokens; side?: 'left' | 'right'; assetBase?: string; }
export declare function ClassicLogoTile(props: ClassicLogoTileProps): JSX.Element;
/** Classic layer — White header with both logo tiles and Match Summary set wide. */
export interface ClassicHeaderProps { left?: TeamTokens; right?: TeamTokens; assetBase?: string; }
export declare function ClassicHeader(props: ClassicHeaderProps): JSX.Element;
/** Classic layer — Dark strip: competition, a diamond in the winner's colourOnDark, venue. */
export interface ClassicContextStripProps { competition?: Competition; venue?: string; winner?: TeamTokens; }
export declare function ClassicContextStrip(props: ClassicContextStripProps): JSX.Element;
/** Classic layer — Glossy innings bar in the team colour with a skewed sheen: name, overs, score. */
export interface ClassicInningsBarProps { club?: TeamTokens; overs?: string; wickets?: number; runs?: number; }
export declare function ClassicInningsBar(props: ClassicInningsBarProps): JSX.Element;
/** Classic layer — One alternating grey row pairing a batter (left) and a bowler (right). */
export interface ClassicPlayerRowProps { batter?: Batter; bowler?: Bowler; index?: number; club?: TeamTokens; showBalls?: boolean; }
export declare function ClassicPlayerRow(props: ClassicPlayerRowProps): JSX.Element;
/** Classic layer — Result bar filled with the winner's colour. */
export interface ClassicResultBarProps { result?: string; winner?: TeamTokens; }
export declare function ClassicResultBar(props: ClassicResultBarProps): JSX.Element;
/** Digital Scoreboard layer — Dark outer frame of the digital board, 6px corners. */
export interface ScoreboardFrameProps { children?: any; }
export declare function ScoreboardFrame(props: ScoreboardFrameProps): JSX.Element;
/** Digital Scoreboard layer — Navy LED screen; lays the 4px dot matrix and a glare over its children. */
export interface ScoreboardScreenProps { ledTexture?: number; children?: any; }
export declare function ScoreboardScreen(props: ScoreboardScreenProps): JSX.Element;
/** Digital Scoreboard layer — Glowing italic header: competition · venue. */
export interface ScoreboardHeaderProps { competition?: Competition; venue?: string; }
export declare function ScoreboardHeader(props: ScoreboardHeaderProps): JSX.Element;
/** Digital Scoreboard layer — One glowing italic player line: name, figure, bracketed secondary. */
export interface ScoreboardLineProps { name?: string; value?: string; sub?: string; }
export declare function ScoreboardLine(props: ScoreboardLineProps): JSX.Element;
/** Digital Scoreboard layer — One innings box outlined and glowing in the team's colourOnDark: name, overs, score, batting and bowling lines. */
export interface ScoreboardInningsBoxProps { innings?: Innings; club?: TeamTokens; rows?: number; showBalls?: boolean; initials?: boolean; gap?: number; }
export declare function ScoreboardInningsBox(props: ScoreboardInningsBoxProps): JSX.Element;
/** Digital Scoreboard layer — Competition logo column beside the innings boxes. */
export interface ScoreboardLogoProps { competition?: Competition; assetBase?: string; }
export declare function ScoreboardLogo(props: ScoreboardLogoProps): JSX.Element;
/** Digital Scoreboard layer — Glowing italic result line in the winner's colourOnDark. */
export interface ScoreboardResultProps { result?: string; winner?: TeamTokens; }
export declare function ScoreboardResult(props: ScoreboardResultProps): JSX.Element;
/** Digital Scoreboard layer — Blue foot band: logo, team v team, logo. */
export interface ScoreboardTeamBandProps { left?: TeamTokens; right?: TeamTokens; assetBase?: string; }
export declare function ScoreboardTeamBand(props: ScoreboardTeamBandProps): JSX.Element;
/** Ground Scoreboard layer — 4px LED dot-matrix overlay for the Ground Scoreboard surfaces. */
export interface GroundScoreboardLedProps { opacity?: number; }
export declare function GroundScoreboardLed(props: GroundScoreboardLedProps): JSX.Element;
/** Ground Scoreboard layer — Dark board surface with LED and glare overlays over its children. */
export interface GroundScoreboardBoardProps { ledTexture?: number; children?: any; }
export declare function GroundScoreboardBoard(props: GroundScoreboardBoardProps): JSX.Element;
/** Ground Scoreboard layer — Match Summary over competition · venue in the winner's colourOnDark. */
export interface GroundScoreboardHeaderProps { competition?: Competition; venue?: string; winner?: TeamTokens; }
export declare function GroundScoreboardHeader(props: GroundScoreboardHeaderProps): JSX.Element;
/** Ground Scoreboard layer — One player cell on a team's dark bar: mixed-case name, figure, secondary. */
export interface GroundScoreboardCellProps { name?: string; value?: string; sub?: string | number; team?: TeamTokens; }
export declare function GroundScoreboardCell(props: GroundScoreboardCellProps): JSX.Element;
/** Ground Scoreboard layer — Team name cell in the batting team's dark with its logo and bright text. */
export interface GroundScoreboardTeamCellProps { club?: TeamTokens; assetBase?: string; }
export declare function GroundScoreboardTeamCell(props: GroundScoreboardTeamCellProps): JSX.Element;
/** Ground Scoreboard layer — Cream cell with overs and the W-R score. */
export interface GroundScoreboardScoreCellProps { overs?: string; wickets?: number; runs?: number; }
export declare function GroundScoreboardScoreCell(props: GroundScoreboardScoreCellProps): JSX.Element;
/** Ground Scoreboard layer — One innings grid: team and score cells, then batter cells (batting team) beside bowler cells (bowling team). */
export interface GroundScoreboardInningsProps { innings?: Innings; club?: TeamTokens; opp?: TeamTokens; rows?: number; showBalls?: boolean; assetBase?: string; }
export declare function GroundScoreboardInnings(props: GroundScoreboardInningsProps): JSX.Element;
/** Ground Scoreboard layer — White result plate. */
export interface GroundScoreboardResultProps { result?: string; }
export declare function GroundScoreboardResult(props: GroundScoreboardResultProps): JSX.Element;
/** Ground Scoreboard layer — Competition-coloured side panel: logo and association name split over an accent rule. */
export interface GroundScoreboardAssociationProps { competition?: Competition; ledTexture?: number; assetBase?: string; }
export declare function GroundScoreboardAssociation(props: GroundScoreboardAssociationProps): JSX.Element;
/** T20 layer — Full-canvas glass stripes skewed −30° and × sparkle marks: winner's colour left, loser's right. */
export interface T20BackdropProps { winner?: TeamTokens; loser?: TeamTokens; format?: Format; }
export declare function T20Backdrop(props: T20BackdropProps): JSX.Element;
/** T20 layer — Angled logo tile glowing in a team's colourOnDark, with × sparkles. */
export interface T20LogoTileProps { side?: 'left' | 'right'; team?: TeamTokens; assetBase?: string; }
export declare function T20LogoTile(props: T20LogoTileProps): JSX.Element;
/** T20 layer — Black title bar: winner tile left, loser tile right, Match Summary centred. */
export interface T20HeaderProps { winner?: TeamTokens; loser?: TeamTokens; assetBase?: string; }
export declare function T20Header(props: T20HeaderProps): JSX.Element;
/** T20 layer — Competition | venue strip under the T20 title. */
export interface T20ContextStripProps { competition?: Competition; venue?: string; }
export declare function T20ContextStrip(props: T20ContextStripProps): JSX.Element;
/** T20 layer — Glossy innings bar in colourOnDark with the team's dark text: name, overs, score. */
export interface T20InningsBarProps { club?: TeamTokens; overs?: string; wickets?: number; runs?: number; }
export declare function T20InningsBar(props: T20InningsBarProps): JSX.Element;
/** T20 layer — One black row pairing a batter (left) and a bowler (right), surnames only by default. */
export interface T20PlayerRowProps { batter?: Batter; bowler?: Bowler; showBalls?: boolean; surnameOnly?: boolean; }
export declare function T20PlayerRow(props: T20PlayerRowProps): JSX.Element;
/** T20 layer — Result bar with text in the winner's colourOnDark. */
export interface T20ResultBarProps { result?: string; winner?: TeamTokens; }
export declare function T20ResultBar(props: T20ResultBarProps): JSX.Element;
/** Stage — the 1080-wide canvas. */
export interface StageProps { format?: Format; background?: string | null; assetBase?: string; vignette?: string; label?: string; children?: any; }
export declare function Stage(props: StageProps): JSX.Element;
export declare function broadcastBarColours(club: TeamTokens, theme?: 'broadcast' | 'club'): { dark: string; light: string; fold: string; text: string };
export declare function panelPalettes(club: TeamTokens, idx?: number, theme?: 'club' | 'broadcast'): { rows: object; header: object };
export declare function initialName(name: string, sep?: string): string;
export declare function surname(name: string): string;
