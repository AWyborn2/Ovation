/**
 * "Save as element" (editable-elements plan, D4): a club's selected layers
 * become a library element every club can use (decision E1), so nothing of
 * the club's own goes with them:
 *
 * - **Images** become placeholders: the club's crest becomes `{{clubLogo}}`
 *   (each club sees its own), a token stays a token, and any other picture
 *   (a photo, a sponsor's art, an upload) becomes the card's photo slot.
 * - **Text** becomes sample or token text: a live field becomes its token,
 *   the club's name becomes `{{clubName}}`, and text with no field in it
 *   becomes "Text".
 * - **Colours** that are the club's accent, panel or ink become those brand
 *   tokens, so the element takes each club's colours.
 * - Layer kinds the library can't hold (medals, stickers, charts, Club Kit
 *   pieces) are left out and named, and hidden layers are dropped.
 *
 * The rules live in `@workspace/scorecard` (`publishableElementLayers`), shared
 * with publishing a whole template (release 2, ADR-012). The server checks the
 * result again (layer rules and the asset policy).
 */
import {
  elementDocumentErrors,
  palettesUsed,
  publishableElementLayers,
  type DerivedPalette,
  type PublishIdentity,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer, PackCardData, PackTokens } from "@/lib/pack-render";
import { shortClubName } from "@/lib/pack-card-data";

export type ElementSaveContext = PublishIdentity;

/** The save context for a card: the club's crest, names and brand colours as drawn. */
export function elementSaveContext(
  data: PackCardData | null | undefined,
  tokens: PackTokens,
): ElementSaveContext {
  const name = data?.brand?.name ?? "";
  return {
    logoUrl: data?.brand?.logoUrl ?? null,
    clubNames: [name, shortClubName(name)].filter(Boolean),
    colours: { "--gold": tokens.accent, "--panel": tokens.panel, "--ink": tokens.ink },
  };
}

export type ElementDraft = {
  document: { formatVersion: 2; layers: unknown[]; palettes?: DerivedPalette[] };
  /** The kinds left out, as the editor names them. */
  skipped: string[];
  /** What the format's rules say is still wrong; empty when it can be saved. */
  errors: string[];
};

/** The element a club's selected layers would publish, and what's left out. */
export function elementFromSelection(layers: FreeLayer[], ctx: ElementSaveContext): ElementDraft {
  const { layers: out, skipped } = publishableElementLayers(layers, ctx);
  const palettes = palettesUsed(out);
  const document = {
    formatVersion: 2 as const,
    layers: out,
    ...(palettes.length > 0 ? { palettes } : {}),
  };
  return { document, skipped, errors: elementDocumentErrors(document) };
}
