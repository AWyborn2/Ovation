import type { CSSProperties } from "react";
import type { HonourBrand } from "./types";

/**
 * Build the inline CSS-variable style for the `.hb` root from the club brand
 * bundle. The skins read these vars (--club-primary / --club-secondary /
 * --club-accent) exactly as the design demo did.
 */
export function brandStyle(brand: HonourBrand): CSSProperties {
  return {
    ["--club-primary" as string]: brand.primaryColour,
    ["--club-secondary" as string]: brand.secondaryColour,
    ["--club-accent" as string]: brand.tertiaryColour,
  };
}
