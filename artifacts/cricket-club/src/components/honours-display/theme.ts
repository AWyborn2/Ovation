import type { CSSProperties } from "react";
import type {
  HonourBrand,
  HonourDisplaySettings,
  HonourSkin,
  HonourBackground,
  BoardDisplayConfig,
} from "./types";
import { isBuiltinSkin } from "./types";

/** Built-in CSS textures (id → CSS background value). */
export const TEXTURES: { id: string; label: string; css: string }[] = [
  {
    id: "linen",
    label: "Linen",
    css: "repeating-linear-gradient(45deg, rgba(0,0,0,0.025) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.025) 0 2px, transparent 2px 4px)",
  },
  {
    id: "carbon",
    label: "Carbon",
    css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)",
  },
  {
    id: "dots",
    label: "Dots",
    css: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1.4px) 0 0 / 14px 14px",
  },
  {
    id: "grid",
    label: "Grid",
    css: "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px) 0 0 / 24px 24px",
  },
  {
    id: "diagonal",
    label: "Diagonal",
    css: "repeating-linear-gradient(135deg, rgba(0,0,0,0.04) 0 8px, transparent 8px 18px)",
  },
];

const TEXTURE_BY_ID = new Map(TEXTURES.map((t) => [t.id, t.css]));

/**
 * Resolve a HonourBackground into a CSS `background` value, or undefined when
 * the background is unset / "none". Url backgrounds cover the surface; textures
 * map to a built-in CSS pattern.
 */
export function backgroundCss(
  bg: HonourBackground | null | undefined,
): string | undefined {
  if (!bg || bg.kind === "none" || !bg.value) return undefined;
  if (bg.kind === "url") {
    return `center / cover no-repeat url("${bg.value}")`;
  }
  if (bg.kind === "texture") {
    return TEXTURE_BY_ID.get(bg.value);
  }
  return undefined;
}

/** Pick the active admin skin from settings, or null for a built-in / missing. */
function activeSkin(settings: HonourDisplaySettings): HonourSkin | null {
  const id = settings.defaultTemplate;
  if (isBuiltinSkin(id)) return null;
  return (settings.skins ?? []).find((s) => s.id === id) ?? null;
}

/**
 * Expand an admin skin into the full `--hb-*` variable map (the same vars the
 * built-in `.hb.skin-pX` classes set). Derived tints use color-mix, already
 * used elsewhere in the skin CSS.
 */
function skinVars(skin: HonourSkin): Record<string, string> {
  const { background, boardBg, ink, muted, accent, accentInk, font } = skin;
  return {
    "--hb-bg": background,
    "--hb-board-bg": boardBg,
    "--hb-board-border": `color-mix(in srgb, ${ink} 12%, transparent)`,
    "--hb-shadow": "0 12px 34px rgba(0, 0, 0, 0.28)",
    "--hb-ink": ink,
    "--hb-muted": muted,
    "--hb-faint": `color-mix(in srgb, ${ink} 6%, transparent)`,
    "--hb-row-stripe": `color-mix(in srgb, ${ink} 4%, transparent)`,
    "--hb-accent": accent,
    "--hb-accent-ink": accentInk,
    "--hb-head-border": `color-mix(in srgb, ${ink} 15%, transparent)`,
    "--hb-crest-bg": accent,
    "--hb-crest-ink": accentInk,
    "--hb-chip-bg": accent,
    "--hb-chip-ink": accentInk,
    "--hb-title-font": font,
  };
}

/**
 * Build the inline CSS-variable style for the `.hb` root. Always seeds the brand
 * vars (--club-*). When an admin skin is active it expands the full --hb-* map
 * inline; then global colour overrides (bg/text/accent) and the club default
 * font are layered on top (these also win over a built-in skin's CSS class,
 * since inline vars beat class vars). Unset values fall through to the skin.
 */
export function rootStyle(
  brand: HonourBrand,
  settings?: HonourDisplaySettings | null,
): CSSProperties {
  const vars: Record<string, string> = {
    "--club-primary": brand.primaryColour,
    "--club-secondary": brand.secondaryColour,
    "--club-accent": brand.tertiaryColour,
  };

  if (settings) {
    const skin = activeSkin(settings);
    if (skin) {
      Object.assign(vars, skinVars(skin));
      const skinBgImage = backgroundCss(skin.backgroundImage);
      if (skinBgImage) vars["--hb-bg"] = skinBgImage;
    }

    const ov = settings.colourOverrides;
    if (ov?.background) vars["--hb-bg"] = ov.background;
    if (ov?.text) vars["--hb-ink"] = ov.text;
    if (ov?.accent) {
      vars["--hb-accent"] = ov.accent;
      vars["--hb-crest-bg"] = ov.accent;
      vars["--hb-chip-bg"] = ov.accent;
    }

    if (settings.defaultFont) vars["--hb-title-font"] = settings.defaultFont;
  }

  return vars as CSSProperties;
}

/**
 * Kept for backwards compatibility — seeds only the brand vars. Prefer
 * `rootStyle(brand, settings)` so admin skins/overrides apply.
 */
export function brandStyle(brand: HonourBrand): CSSProperties {
  return rootStyle(brand, null);
}

/**
 * Per-board inline style derived from its admin config: a font override and a
 * background image (board background wins over the page background). Returns
 * undefined when nothing is overridden so un-configured boards stay untouched.
 */
export function boardStyle(
  cfg?: BoardDisplayConfig | null,
): CSSProperties | undefined {
  if (!cfg) return undefined;
  const vars: Record<string, string> = {};
  if (cfg.font) vars["--hb-title-font"] = cfg.font;
  const bg = backgroundCss(cfg.background);
  if (bg) vars["--hb-board-bg"] = bg;
  return Object.keys(vars).length ? (vars as CSSProperties) : undefined;
}

/**
 * Per-board CSS classes for the text scale + row density modifiers (md /
 * comfortable are the defaults and add no class).
 */
export function boardClasses(cfg?: BoardDisplayConfig | null): string {
  const out: string[] = [];
  if (cfg?.textSize === "sm") out.push("hb-text-sm");
  if (cfg?.textSize === "lg") out.push("hb-text-lg");
  if (cfg?.density === "compact") out.push("hb-compact");
  return out.join(" ");
}
