/**
 * The seven Ovation Match Graphics looks (plan 2026-10-23, M3) and how each
 * becomes a template look: its bundle folder, its name within the family,
 * the Summary component that draws it, and how it lays its players out.
 */
import type { RowStyle } from "./sentinels";

export const FAMILY = "Ovation Match Graphics";

export type MatchLook = {
  /** The bundle folder (`lib/template-bundles/<slug>`). */
  slug: string;
  /** The look's name within the family (the Elements panel's heading). */
  name: string;
  description: string;
  /** The design system's group name for the look's layer components. */
  group: string;
  /** The Summary component. */
  component: string;
  rowStyle: RowStyle;
  /** The look's layer components, top to bottom (README, "Layer components"). */
  layers: string[];
  /** Look props the Summary is drawn with (the design's own options). */
  props?: Record<string, unknown>;
  /**
   * Literal text the template binds instead, so every card carries the kind's
   * core content (the fit check's rule): `{ "Match Summary": "…" }`.
   */
  text?: Record<string, string>;
};

export const MATCH_LOOKS: MatchLook[] = [
  {
    slug: "omg-broadcast",
    name: "Broadcast",
    description: "Angled teal title bar, grey textured panel, team bars with circle logos.",
    group: "Broadcast",
    component: "BroadcastSummary",
    rowStyle: "lists",
    // The result bar on every size: the design leaves it off landscape by default (M16).
    props: { showResult: true },
    layers: [
      "BroadcastPanel",
      "BroadcastTitleBar",
      "BroadcastInningsBar",
      "BroadcastPlayerList",
      "BroadcastBatterRow",
      "BroadcastBowlerRow",
      "BroadcastResultBar",
    ],
  },
  {
    slug: "omg-panel",
    name: "Panel",
    description: "Brushed-chrome frame, glossy team headers and tiled player rows.",
    group: "Panel",
    component: "PanelSummary",
    rowStyle: "lists",
    // Panel names no competition: its header carries it (M16).
    text: { "Match Summary": "{{competition}} · Match Summary" },
    layers: [
      "PanelFrame",
      "PanelHeader",
      "PanelWell",
      "PanelInningsHeader",
      "PanelPlayerGrid",
      "PanelPlayerRow",
      "PanelResultBar",
    ],
  },
  {
    slug: "omg-clean",
    name: "Clean",
    description: "A minimal dark glass panel led by the competition logo.",
    group: "Clean",
    component: "CleanSummary",
    rowStyle: "lists",
    layers: [
      "CleanHeader",
      "CleanInningsBand",
      "CleanInningsHeader",
      "CleanPlayerList",
      "CleanPlayerRow",
      "CleanResultBar",
    ],
  },
  {
    slug: "omg-classic",
    name: "Classic",
    description: "White header with angled logo tiles, alternating grey rows and winner stripes.",
    group: "Classic",
    component: "ClassicSummary",
    rowStyle: "pairs",
    layers: [
      "ClassicStripes",
      "ClassicHeader",
      "ClassicLogoTile",
      "ClassicContextStrip",
      "ClassicInningsBar",
      "ClassicPlayerRow",
      "ClassicResultBar",
    ],
  },
  {
    slug: "omg-scoreboard",
    name: "Digital Scoreboard",
    description: "A navy LED board with glowing, team-outlined innings boxes.",
    group: "Digital Scoreboard",
    component: "ScoreboardSummary",
    rowStyle: "lists",
    layers: [
      "ScoreboardFrame",
      "ScoreboardScreen",
      "ScoreboardHeader",
      "ScoreboardInningsBox",
      "ScoreboardLine",
      "ScoreboardLogo",
      "ScoreboardResult",
      "ScoreboardTeamBand",
    ],
  },
  {
    slug: "omg-ground-scoreboard",
    name: "Ground Scoreboard",
    description:
      "A stadium board: batters in the batting side's colours, bowlers in the bowling side's.",
    group: "Ground Scoreboard",
    component: "GroundScoreboardSummary",
    rowStyle: "lists",
    layers: [
      "GroundScoreboardBoard",
      "GroundScoreboardHeader",
      "GroundScoreboardInnings",
      "GroundScoreboardTeamCell",
      "GroundScoreboardScoreCell",
      "GroundScoreboardCell",
      "GroundScoreboardResult",
      "GroundScoreboardAssociation",
      "GroundScoreboardLed",
    ],
  },
  {
    slug: "omg-t20",
    name: "T20",
    description: "Big-Bash style: winner tile left, glass stripes, black rows.",
    group: "T20",
    component: "T20Summary",
    rowStyle: "pairs",
    layers: [
      "T20Backdrop",
      "T20Header",
      "T20LogoTile",
      "T20ContextStrip",
      "T20InningsBar",
      "T20PlayerRow",
      "T20ResultBar",
    ],
  },
];

/** Every layer component (51), with its look. */
export const LAYER_COMPONENTS = MATCH_LOOKS.flatMap((look) =>
  look.layers.map((name) => ({ name, look })),
);
