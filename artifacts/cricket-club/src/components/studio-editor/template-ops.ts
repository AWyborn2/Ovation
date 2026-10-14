/**
 * Template-mode document operations (card kind templates, plan U8): pure
 * functions over a kind template's layer document. Size presence and
 * placement come from the shared `@workspace/scorecard/kind-templates`
 * helpers (U1); this module only adapts them to the editor's layers and adds
 * the edits template mode needs (text style, field tokens, rows, save rules).
 */
import {
  addLayerToSizes,
  emptySizes,
  kindFields,
  layerOnSize,
  TEMPLATE_SIZE_ORDER,
  type KindRepeat,
  type RowsCell,
  type TemplateTextStyle,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer, LayerBox } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { layersOf, newId, type EditorDoc } from "./document";

export const SIZE_LABEL: Record<CardSize, string> = {
  square: "Square",
  portrait: "Portrait",
  story: "Story",
  landscape: "Landscape",
};

/** The token a text box uses to show a card field. */
export const fieldToken = (key: string): string => `{{${key}}}`;

/** The token an image layer uses to show the club's crest (never a fixed URL). */
export const CLUB_LOGO_TOKEN = fieldToken("clubLogo");

/**
 * A layer as first added in template mode: on the size being edited only,
 * with its box there. "Add to other sizes" then places it on the rest.
 */
export function onlyOnSize(layer: FreeLayer, size: CardSize): FreeLayer {
  const box = layer.geometry[size];
  return {
    ...layer,
    sizes: [size],
    geometry: box ? { [size]: box } : {},
    editedAt: { [size]: Date.now() },
  };
}

/** Put layers on every other size (KTD16), placed from `from`; one document change. */
export function addToOtherSizes(doc: EditorDoc, ids: string[], from: CardSize): EditorDoc {
  return {
    ...doc,
    layers: layersOf(doc).map((l) =>
      ids.includes(l.id) ? addLayerToSizes(l, from, TEMPLATE_SIZE_ORDER) : l,
    ),
  };
}

/** Take layers off one size; a layer on no size left is deleted. */
export function removeFromSize(doc: EditorDoc, ids: string[], size: CardSize): EditorDoc {
  const layers: FreeLayer[] = [];
  for (const l of layersOf(doc)) {
    if (!ids.includes(l.id) || !layerOnSize(l, size) || l.locked) {
      layers.push(l);
      continue;
    }
    const sizes = (l.sizes ?? [...TEMPLATE_SIZE_ORDER]).filter((s) => s !== size);
    if (sizes.length === 0) continue;
    const geometry = { ...l.geometry };
    delete geometry[size];
    layers.push({ ...l, sizes, geometry });
  }
  return { ...doc, layers };
}

/** The layers the canvas shows at `size` (template docs mark per-size presence). */
export const layersOnSize = (doc: EditorDoc, size: CardSize): FreeLayer[] =>
  layersOf(doc).filter((l) => layerOnSize(l, size));

/** Merge a text style change into one layer. */
export function setTextStyle(
  doc: EditorDoc,
  id: string,
  patch: Partial<TemplateTextStyle>,
): EditorDoc {
  return {
    ...doc,
    layers: layersOf(doc).map((l) => {
      if (l.id !== id) return l;
      const style: TemplateTextStyle = { ...(l.style ?? {}), ...patch };
      for (const k of Object.keys(patch) as (keyof TemplateTextStyle)[]) {
        if (patch[k] === undefined) delete style[k];
      }
      return { ...l, style };
    }),
  };
}

/** Text with a field token inserted at `at` (the caret), or appended. */
export function insertToken(text: string, key: string, at?: number): string {
  const token = fieldToken(key);
  if (at === undefined || at < 0 || at > text.length) {
    return text && !/\s$/.test(text) ? `${text} ${token}` : `${text}${token}`;
  }
  return `${text.slice(0, at)}${token}${text.slice(at)}`;
}

const box = (x: number, y: number, w: number, h: number): LayerBox => ({ x, y, w, h });

/** A new text box showing one field, on `size` only. */
export function fieldTextLayer(key: string, label: string, size: CardSize): FreeLayer {
  return onlyOnSize(
    {
      id: newId(),
      kind: "text",
      name: label,
      content: fieldToken(key),
      style: { fontSize: 6, fontWeight: 800, align: "center" },
      geometry: { [size]: box(10, 40, 80, 12) },
    },
    size,
  );
}

/** The card photo, on `size` only (never drawn on junior cards). */
export function photoLayer(size: CardSize): FreeLayer {
  return onlyOnSize(
    { id: newId(), kind: "photo", name: "Card photo", geometry: { [size]: box(0, 0, 100, 60) } },
    size,
  );
}

/** The club crest, on `size` only; resolved from the club's brand at render. */
export function logoLayer(size: CardSize): FreeLayer {
  return onlyOnSize(
    {
      id: newId(),
      kind: "image",
      name: "Club logo",
      content: CLUB_LOGO_TOKEN,
      geometry: { [size]: box(40, 4, 20, 14) },
    },
    size,
  );
}

/** A list element for one of the kind's repeats: the first few fields across the row. */
export function rowsLayer(repeat: KindRepeat, size: CardSize): FreeLayer {
  const fields = repeat.fields.slice(0, 4);
  const w = 100 / Math.max(fields.length, 1);
  const cells: RowsCell[] = fields.map((f, i) => ({
    field: f.key,
    x: i * w,
    w,
    style: { fontSize: 3.6, fontWeight: i === 0 ? 800 : 600, align: i === 0 ? "left" : "center" },
  }));
  return onlyOnSize(
    {
      id: newId(),
      kind: "rows",
      name: repeat.label,
      rows: { repeat: repeat.key, rowHeight: 7, gap: 1, cells },
      geometry: { [size]: box(6, 24, 88, 56) },
    },
    size,
  );
}

/** The fields a kind's text boxes can show, without layout-only ones. */
export const templateFields = (kind: string) => kindFields(kind)?.fields ?? [];

/**
 * The field that says what a card is about (the player, record, team…): the
 * kind's first field that isn't club furniture. A kind with a list has its
 * list as the key instead. Removing it is allowed but warned about.
 */
export function keyFieldOf(kind: string): { key: string; label: string; repeat: boolean } | null {
  const cat = kindFields(kind);
  if (!cat) return null;
  if (cat.repeats.length > 0) {
    return { key: cat.repeats[0].key, label: cat.repeats[0].label, repeat: true };
  }
  const f = cat.fields.find((x) => !/^(club|hashtag|sponsor)/i.test(x.key));
  return f ? { ...f, repeat: false } : null;
}

/** Whether the document still shows the kind's key field anywhere. */
export function showsKeyField(doc: EditorDoc, kind: string): boolean {
  const key = keyFieldOf(kind);
  if (!key) return true;
  return layersOf(doc).some((l) =>
    key.repeat
      ? l.kind === "rows" && l.rows?.repeat === key.key
      : (l.kind === "text" && (l.content ?? "").includes(fieldToken(key.key))) ||
        l.bind === key.key,
  );
}

/** Why a template can't be saved yet; empty when it can (KTD15). */
export function saveBlockers(doc: EditorDoc): string[] {
  return emptySizes(doc).map(
    (s) => `${SIZE_LABEL[s as CardSize]} has no elements. Add at least one before saving.`,
  );
}

/** Update one cell of a rows layer. */
export function setRowsCell(
  doc: EditorDoc,
  id: string,
  index: number,
  patch: Partial<RowsCell>,
): EditorDoc {
  return {
    ...doc,
    layers: layersOf(doc).map((l) => {
      if (l.id !== id || !l.rows) return l;
      const cells = l.rows.cells.map((c, i) => (i === index ? { ...c, ...patch } : c));
      return { ...l, rows: { ...l.rows, cells } };
    }),
  };
}

/** Change a rows layer's row spec (height, gap, cells, variants). */
export function setRows(
  doc: EditorDoc,
  id: string,
  patch: Partial<NonNullable<FreeLayer["rows"]>>,
): EditorDoc {
  return {
    ...doc,
    layers: layersOf(doc).map((l) =>
      l.id === id && l.rows ? { ...l, rows: { ...l.rows, ...patch } } : l,
    ),
  };
}

/** Set (or clear) one cell's style for a row variant, e.g. the club's own ladder row. */
export function setVariantStyle(
  doc: EditorDoc,
  id: string,
  variant: string,
  field: string,
  style: TemplateTextStyle | null,
): EditorDoc {
  return {
    ...doc,
    layers: layersOf(doc).map((l) => {
      if (l.id !== id || !l.rows) return l;
      const variants = { ...(l.rows.variants ?? {}) };
      const cells = { ...(variants[variant] ?? {}) };
      if (style) cells[field] = style;
      else delete cells[field];
      variants[variant] = cells;
      return { ...l, rows: { ...l.rows, variants } };
    }),
  };
}

/**
 * A template as a starter document (T6.2): the layers only, without edit
 * timestamps, hidden or locked flags, so a designer can commit it to
 * `lib/scorecard/src/kind-templates/starters/*` under the kind. The starter
 * contract test then checks it (fields exist, no club literals or photo URLs).
 */
export function starterExport(doc: EditorDoc): string {
  const layers = layersOf(doc)
    .filter((l) => !l.hidden)
    .map((l) => {
      const copy: FreeLayer = { ...l };
      delete copy.editedAt;
      delete copy.locked;
      delete copy.hidden;
      return copy;
    });
  return `${JSON.stringify({ layers }, null, 2)}\n`;
}
