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

const box = (
  sizes: readonly TemplateSize[],
  y: number,
  h: number,
): Partial<Record<TemplateSize, LayerBox>> =>
  Object.fromEntries(sizes.map((size) => [size, { x: 6, y, w: 88, h }]));

/**
 * A plain layout for a kind: its first few live fields stacked as text.
 *
 * With no `sizes` it is on every size, as every stored template from it is
 * (the byte-identical fixture and the four-size template rules depend on
 * that). Given `sizes` (a new design: `OFFERED_SIZES`, Portrait and Story),
 * each layer carries boxes and a `sizes` list for those only, so it doesn't
 * fall back to every size.
 */
export function placeholderDocument(
  kind: string,
  sizes?: readonly TemplateSize[],
): StarterDocument {
  const fields = (kindFields(kind)?.fields ?? [])
    .filter((f) => !/^sponsor|Hashtag$/i.test(f.key))
    .slice(0, 5);
  const step = 80 / Math.max(fields.length, 1);
  const on = sizes ? TEMPLATE_SIZE_ORDER.filter((s) => sizes.includes(s)) : TEMPLATE_SIZE_ORDER;
  const every = on.length === TEMPLATE_SIZE_ORDER.length;
  return {
    layers: fields.map((f, i) => ({
      id: `placeholder-${f.key}`,
      kind: "text",
      name: f.label,
      content: `{{${f.key}}}`,
      style: { fontSize: i === 0 ? 7 : 5, fontWeight: i === 0 ? 800 : 600 },
      ...(every ? {} : { sizes: [...on] }),
      geometry: box(on, 10 + i * step, step * 0.8),
    })),
  };
}
