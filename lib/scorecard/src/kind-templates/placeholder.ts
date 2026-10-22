/**
 * A format v1 layer document, and a plain placeholder one for any kind.
 *
 * The starters that once lived here are bundles now (ADR-011: `club-kit-classic`,
 * `broadcast-classic`, `clubhouse` in `@workspace/template-bundles`); their
 * TypeScript went with T5.18. What stays is the document type and the
 * placeholder, which builds a valid layout from a kind's own fields: the
 * console starts a new template from it, and tests use it as a known-good
 * document.
 */
import {
  TEMPLATE_SIZE_ORDER,
  type LayerBox,
  type TemplateLayerBase,
  type TemplateSize,
} from "./document";
import { kindFields } from "./fields";

/**
 * A format v1 template document: the editor's layer document. Layers carry
 * the renderer's fields (text, style, rows, photo…) beyond the size rules
 * typed here, so they are kept open.
 */
export type StarterDocument = {
  layers: Array<TemplateLayerBase & Record<string, unknown>>;
  sponsorLock?: boolean;
};

const box = (y: number, h: number): Partial<Record<TemplateSize, LayerBox>> =>
  Object.fromEntries(TEMPLATE_SIZE_ORDER.map((size) => [size, { x: 6, y, w: 88, h }]));

/** A plain layout for a kind: its first few live fields stacked as text, at every size. */
export function placeholderDocument(kind: string): StarterDocument {
  const fields = (kindFields(kind)?.fields ?? [])
    .filter((f) => !/^sponsor|Hashtag$/i.test(f.key))
    .slice(0, 5);
  const step = 80 / Math.max(fields.length, 1);
  return {
    layers: fields.map((f, i) => ({
      id: `placeholder-${f.key}`,
      kind: "text",
      name: f.label,
      content: `{{${f.key}}}`,
      style: { fontSize: i === 0 ? 7 : 5, fontWeight: i === 0 ? 800 : 600 },
      geometry: box(10 + i * step, step * 0.8),
    })),
  };
}
