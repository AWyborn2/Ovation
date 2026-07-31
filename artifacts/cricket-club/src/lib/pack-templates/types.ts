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

/**
 * How a pack pulls the tenant's stage tone toward its own art direction.
 *
 * `--ink` is the deep stage colour, and the renderer emits it for every pack
 * from one tenant-level token. That made every pack's own `var(--ink, …)`
 * fallback dead code: Gold Foil's shared fragment asks for a near-black
 * `#070603` and Neon Night's for a navy `#081426`, but both resolved to
 * whatever single value the tenant's theme carried, so any card whose stage IS
 * `var(--ink)` looked the same in every pack. (Packs still differed elsewhere,
 * via `--block` / `--surface-*`, which the renderer does not emit — so the
 * differentiation was inconsistent rather than absent.)
 *
 * A tint keeps the club's tone in the mix instead of replacing it, the same way
 * the metallic foil ramp derives from `--gold`: the stage stays recognisably
 * the tenant's, while each pack keeps its own cast.
 */
export interface PackInkTint {
  /** The pack's own stage colour — what the tenant tone is mixed toward. */
  toward: string;
  /** Percentage of the TENANT's tone retained (0–100). Higher = more tenant. */
  tenantWeight: number;
}

export interface PackManifest {
  packId: string;
  name: string;
  designs: PackDesignEntry[];
  /**
   * Optional. Omitted means the tenant's `--ink` is used verbatim — which is
   * what Broadcast Dark does, because its own stage IS the default token and
   * the Halls Head parity invariant (see `brandDefaultTokens`) requires its
   * output to stay byte-identical.
   */
  inkTint?: PackInkTint;
}
