/**
 * Pack template contract (U1).
 *
 * A "pack" is a repo-shipped set of card designs converted from a Claude
 * Design bundle into plain HTML template assets. Each design exposes one HTML
 * string per format with `{{field}}` placeholders, `data-slot` image slots,
 * `data-repeat` row groups and `data-sponsors="on|off"` variant blocks. The
 * Claude Design runtime constructs (`<sc-if>`, `<image-slot>`, `{{ }}` runtime
 * refs, support.js) are compiled away at conversion time — the renderer only
 * ever sees plain HTML plus theme-token CSS custom properties (`--gold`,
 * `--panel`, `--ink`, `--disp`, surface tokens, `--k` / `--ch` scaling).
 */

export type PackTemplateFieldType = "text" | "photo" | "logo" | "repeat";

export interface PackTemplateField {
  /** Placeholder key as used in the html (`{{key}}`), or the slot/repeat key. */
  key: string;
  type: PackTemplateFieldType;
  /** Human label for builder forms. */
  label: string;
  /**
   * The bundle's original sample string for this field — seeds gallery
   * previews. For photo/logo fields this is the slot's placeholder caption;
   * for repeat fields it is a short description of the row group.
   */
  sample: string;
}

export interface PackTemplateRepeat {
  /** Matches `data-repeat="<key>"` in the html and a `type:"repeat"` field. */
  key: string;
  /** Maximum number of rows the layout is designed for. */
  maxRows: number;
  /** Row-level fields, referenced in row templates as `{{row.<key>}}`. */
  fields: PackTemplateField[];
  /**
   * Alternate row template names present in the html as
   * `data-repeat-variant="<name>"` (e.g. the ladder's highlighted club row).
   */
  variants?: string[];
}

export type PackSponsorVariant = "on" | "off";

/**
 * Per-format template html. Only Match Result ships three distinct layouts;
 * every other card has a story layout plus one shared non-story layout that
 * reflows for portrait/square via the `--k` / `--ch` scaling tokens.
 */
export type PackTemplateFormats =
  | { story: string; portrait: string; square: string }
  | { story: string; shared: string };

export interface PackCardTemplate {
  /** ShareCardInput kind this design renders. */
  kind: string;
  /** Stable per-design key within the pack (also the module file name). */
  designKey: string;
  /** Display name from the bundle. */
  name: string;
  formats: PackTemplateFormats;
  fields: PackTemplateField[];
  repeats?: PackTemplateRepeat[];
  /**
   * Which sponsor blocks exist in the markup. `["on", "off"]` cards swap the
   * sponsor strip for a hashtag footer when sponsors are off; `["on"]` cards
   * (A3 / A5 / A9 in Pack A) have no sponsors-off branch by design — the
   * sponsor line simply disappears.
   */
  sponsorVariants: PackSponsorVariant[];
}

export interface PackDesignEntry {
  designKey: string;
  kind: string;
  /**
   * Category preset for the two kinds that map two designs each
   * (gradeLeader and clubLeaderboard: "Runs" | "Wickets").
   */
  categoryPreset?: "Runs" | "Wickets";
  template: PackCardTemplate;
}

export interface PackManifest {
  packId: string;
  name: string;
  designs: PackDesignEntry[];
}
