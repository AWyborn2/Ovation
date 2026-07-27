import {
  OVERRIDE_COLOUR_KEYS,
  type OverrideColourKey,
} from "@/lib/theme-tokens";

/**
 * Shared descriptors for the branding override editors. Both the club-facing
 * curated panel (`admin-branding.tsx`) and the platform-admin full-token editor
 * (`platform-admin/branding-card.tsx`) read these so the two UIs stay in lock-step
 * and the set of override-able tokens is defined once.
 *
 * Overrides are stored as a `{ "--token": value }` map on the tenant's
 * `themeOverrides` column; the theme engine (`theme-tokens.ts`) overlays them on
 * the derived scale. Colour tokens carry a 6-digit hex; `--radius` and the
 * `--app-font-*` tokens carry a raw CSS value.
 */

/** The two app-look modes surfaced as a first-class selector (drives `useNavyBase`). */
export interface AppLook {
  id: "broadcast" | "club";
  /** `useNavyBase` value this look maps onto. */
  useNavyBase: boolean;
  label: string;
  description: string;
}

export const APP_LOOKS: readonly AppLook[] = [
  {
    id: "broadcast",
    useNavyBase: true,
    label: "Ovation Broadcast",
    description:
      "The Ovation house style — fixed navy broadcast surfaces. Your accent colour still applies on top.",
  },
  {
    id: "club",
    useNavyBase: false,
    label: "Club look",
    description:
      "Surfaces tinted from your own background colour, plus an optional background image.",
  },
] as const;

/**
 * A curated colour control the club-facing panel exposes. Each control edits one
 * or more CSS token keys together (e.g. the surface control writes both `--card`
 * and `--popover`) so a club adjusts a concept, not raw tokens. The full
 * per-token grid on the platform console edits {@link OVERRIDE_COLOUR_KEYS}
 * directly instead.
 */
export interface CuratedColourControl {
  id: string;
  label: string;
  description: string;
  /** The token keys this control writes together; keys[0] seeds the picker. */
  keys: OverrideColourKey[];
}

export const CURATED_COLOUR_CONTROLS: readonly CuratedColourControl[] = [
  {
    id: "background",
    label: "Page background",
    description:
      "The outermost page colour behind your content. Overrides the app-look base, so you can recolour it without leaving the Broadcast look.",
    keys: ["--background"],
  },
  {
    id: "surface",
    label: "Card surface",
    description: "Cards, panels and popovers your content sits on.",
    keys: ["--card", "--popover"],
  },
  {
    id: "panel",
    label: "Muted panels",
    description: "Secondary buttons and subtle filled areas.",
    keys: ["--secondary", "--muted"],
  },
  {
    id: "border",
    label: "Borders & dividers",
    description: "Card outlines, inputs and separators.",
    keys: ["--border", "--input"],
  },
  {
    id: "alert",
    label: "Alert / destructive",
    description: "Delete buttons and error states.",
    keys: ["--destructive", "--destructive-border"],
  },
  {
    id: "text",
    label: "Body text",
    description: "The main reading text on your pages, cards and popovers.",
    keys: ["--foreground", "--card-foreground", "--popover-foreground"],
  },
  {
    id: "mutedText",
    label: "Muted text",
    description: "Secondary, dimmer text — captions, labels and subtitles.",
    keys: ["--muted-foreground", "--secondary-foreground"],
  },
  {
    id: "buttonText",
    label: "Button text",
    description: "Text and icons that sit on your accent buttons and chips.",
    keys: ["--primary-foreground", "--accent-foreground"],
  },
] as const;

/** Corner-radius presets for the `--radius` token. */
export interface RadiusOption {
  label: string;
  value: string;
}

export const DEFAULT_RADIUS = "0.5rem";

export const RADIUS_OPTIONS: readonly RadiusOption[] = [
  { label: "Sharp", value: "0rem" },
  { label: "Default", value: DEFAULT_RADIUS },
  { label: "Soft", value: "0.75rem" },
  { label: "Rounded", value: "1rem" },
] as const;

/** Body-font presets for the `--app-font-sans` token. Generic families only, so
 * every option renders a visible change without loading a webfont. */
export interface FontOption {
  label: string;
  value: string;
}

export const DEFAULT_FONT_SANS = "'IBM Plex Sans', sans-serif";

export const FONT_OPTIONS: readonly FontOption[] = [
  { label: "Ovation (IBM Plex Sans)", value: DEFAULT_FONT_SANS },
  { label: "System", value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'IBM Plex Mono', ui-monospace, monospace" },
] as const;

/**
 * All token keys, grouped, that the platform-admin full editor exposes. Colour
 * keys come from the engine's canonical {@link OVERRIDE_COLOUR_KEYS} list so the
 * grid can never drift from what the engine actually applies.
 */
export interface TokenGroup {
  label: string;
  keys: OverrideColourKey[];
}

export const FULL_TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    label: "Page",
    keys: ["--background", "--foreground", "--border", "--input", "--ring"],
  },
  {
    label: "Card",
    keys: ["--card", "--card-foreground", "--card-border"],
  },
  {
    label: "Popover",
    keys: ["--popover", "--popover-foreground", "--popover-border"],
  },
  {
    label: "Primary",
    keys: ["--primary", "--primary-foreground", "--primary-border"],
  },
  {
    label: "Secondary",
    keys: ["--secondary", "--secondary-foreground", "--secondary-border"],
  },
  {
    label: "Muted",
    keys: ["--muted", "--muted-foreground", "--muted-border"],
  },
  {
    label: "Accent",
    keys: ["--accent", "--accent-foreground", "--accent-border"],
  },
  {
    label: "Destructive",
    keys: ["--destructive", "--destructive-foreground", "--destructive-border"],
  },
] as const;

// A compile-time guard: every colour key belongs to exactly one full-editor
// group, so the grid stays exhaustive if OVERRIDE_COLOUR_KEYS grows.
const _GROUPED = new Set(FULL_TOKEN_GROUPS.flatMap((g) => g.keys));
export const FULL_EDITOR_COVERS_ALL_COLOUR_KEYS: boolean =
  OVERRIDE_COLOUR_KEYS.every((k) => _GROUPED.has(k)) &&
  _GROUPED.size === OVERRIDE_COLOUR_KEYS.length;

/** Human labels for individual token keys, shown in the full-editor grid. */
export const TOKEN_LABELS: Record<OverrideColourKey, string> = {
  "--background": "Background",
  "--foreground": "Text",
  "--border": "Border",
  "--input": "Input border",
  "--ring": "Focus ring",
  "--card": "Card",
  "--card-foreground": "Card text",
  "--card-border": "Card border",
  "--popover": "Popover",
  "--popover-foreground": "Popover text",
  "--popover-border": "Popover border",
  "--primary": "Primary",
  "--primary-foreground": "Primary text",
  "--primary-border": "Primary border",
  "--secondary": "Secondary",
  "--secondary-foreground": "Secondary text",
  "--secondary-border": "Secondary border",
  "--muted": "Muted",
  "--muted-foreground": "Muted text",
  "--muted-border": "Muted border",
  "--accent": "Accent",
  "--accent-foreground": "Accent text",
  "--accent-border": "Accent border",
  "--destructive": "Destructive",
  "--destructive-foreground": "Destructive text",
  "--destructive-border": "Destructive border",
};
