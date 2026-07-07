/**
 * Design-system palette (Ovation UI migration §11): the same navy surface
 * scale + amber accent the web app derives in
 * `artifacts/cricket-club/src/lib/theme-tokens.ts` (NAVY_DARK / INK_DARK /
 * ACCENT_TOKENS.amber), stated as hex for React Native. The app ships the
 * system's native dark look under the single `light` key (matching the
 * previous behaviour of one palette for every device appearance); per-tenant
 * runtime theming from `GET /tenant-brand` is a later phase.
 */
const colors = {
  light: {
    text: "#F5F7FA",
    tint: "#FFB238",

    background: "#0B0F1A",
    foreground: "#F5F7FA",

    card: "#131826",
    cardForeground: "#F5F7FA",

    primary: "#FFB238",
    primaryForeground: "#0B0F1A",

    secondary: "#1B2236",
    secondaryForeground: "#8D96A8",

    muted: "#1B2236",
    mutedForeground: "#8D96A8",

    accent: "#FFB238",
    accentForeground: "#0B0F1A",

    destructive: "#F0654B",
    destructiveForeground: "#FFFFFF",

    border: "#232B3D",
    input: "#232B3D",
  },
  radius: 8,
};

export default colors;
