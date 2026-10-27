/**
 * The drop rule (ADR-011 §1, T1.5): a layer whose bound tokens are all
 * hidden or empty is dropped, as a pack box marked `data-drop-if-field` is.
 * Core fields are always visible, whatever the visible set says.
 *
 * - A token is hidden when the content field that shows it (`page-tokens.ts`)
 *   is optional and not in the card's visible set.
 * - A token is empty when the card has no value for it (no text, no image,
 *   no rows).
 * - A layer that binds no token (a panel, a sticker, a vector) is never
 *   dropped by this rule; `showWhen` conditions it instead.
 * - A group is dropped when it has children and every one is dropped.
 *
 * Pure. The renderer applies it to v2 documents with the visible set left
 * out (a hidden field's value is already blank in the render input); the fit
 * check passes the visible set to tell hidden from empty.
 */
import { isGroupLayer, type PageKey, type TemplateLayerV2 } from "./format";
import { isCoreContentField, PHOTO_TOKEN, tokenContentField } from "./page-tokens";

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** The `{{token}}` keys in a piece of text, in order, once each. */
export function textTokens(text: string | undefined): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(TOKEN)].map((m) => m[1] ?? ""))].filter(Boolean);
}

/**
 * The tokens a layer binds: a text layer's `{{tokens}}` and live field, an
 * image's token, a rows layer's repeat, and a photo layer's card photo.
 * Groups bind none of their own (their children do).
 */
export function layerTokens(layer: TemplateLayerV2): string[] {
  switch (layer.kind) {
    case "text":
      return [...new Set([...textTokens(layer.content), ...(layer.bind ? [layer.bind] : [])])];
    case "image":
      return textTokens(layer.content);
    case "rows":
      return layer.rows?.repeat ? [layer.rows.repeat] : [];
    case "photo":
      return [PHOTO_TOKEN];
    default:
      return [];
  }
}

export interface DropRuleContext {
  /** The card kind and the page being drawn, to find each token's content field. */
  kind: string;
  page: PageKey;
  /** Whether the card has a value for a token (text, image or rows). */
  has: (token: string) => boolean;
  /**
   * The card's visible content fields (ADR-010). Absent: no token counts as
   * hidden, as in the render path, where a hidden field's value is blank.
   */
  visible?: ReadonlySet<string> | null;
  /**
   * Whether a photo layer has a photo of its own (photo layer sources): it is
   * then drawn whether or not the card has a photo.
   */
  hasLayerPhoto?: (layer: TemplateLayerV2) => boolean;
}

/** Whether a token is hidden on this card: an optional content field that isn't visible. */
export function tokenHidden(token: string, ctx: DropRuleContext): boolean {
  if (!ctx.visible) return false;
  const field = tokenContentField(ctx.kind, ctx.page, token);
  if (!field || isCoreContentField(ctx.kind, field)) return false;
  return !ctx.visible.has(field);
}

/** Whether the drop rule removes a layer from the card. */
export function layerDropped(layer: TemplateLayerV2, ctx: DropRuleContext): boolean {
  if (isGroupLayer(layer)) {
    const children = Array.isArray(layer.children) ? layer.children : [];
    return children.length > 0 && children.every((child) => layerDropped(child, ctx));
  }
  if (layer.kind === "photo" && ctx.hasLayerPhoto?.(layer)) return false;
  const tokens = layerTokens(layer);
  if (tokens.length === 0) return false;
  return tokens.every((token) => tokenHidden(token, ctx) || !ctx.has(token));
}
