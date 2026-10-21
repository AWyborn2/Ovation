/**
 * Copy and paste for the editor (studio-editor-multiselect). The clipboard
 * holds copies of layers with their box on the size they were copied from,
 * and lives in session storage, so a copy survives moving to another size or
 * opening another template in the same tab. Templates and drafts keep
 * separate clipboards: a template's live fields and lists only mean
 * something in a template.
 *
 * A pasted layer is a new layer: new id, unlocked, shown, its own group. It
 * keeps what it shows: a field token or a live field still shows that field,
 * a list still lists the same rows, and the card photo is still the one card
 * photo (a photo per player is a list cell, set in List settings).
 */
import { placeBoxOnSize, templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import type { FreeLayer, LayerBox } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { boxOf, layersOf, newId, type EditorDoc } from "./document";
import { onlyOnSize } from "./template-ops";

export type ClipboardMode = "template" | "draft";

export type EditorClipboard = {
  v: 1;
  mode: ClipboardMode;
  /** The size the boxes were copied at. */
  size: CardSize;
  /** Copies in stacking order (back to front), each with its box at `size` only. */
  layers: FreeLayer[];
};

/** Paste offset when a copy would land exactly on a layer already there, in percent. */
export const PASTE_OFFSET = 2;

const storageKey = (mode: ClipboardMode) => `ovation.studio-editor.clipboard.${mode}`;
const memory: Partial<Record<ClipboardMode, EditorClipboard>> = {};

/** Copies of the selected layers that are on `size`, in stacking order; null when none. */
export function copyLayers(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  mode: ClipboardMode,
): EditorClipboard | null {
  const layers: FreeLayer[] = [];
  for (const l of layersOf(doc)) {
    if (!ids.includes(l.id)) continue;
    if (l.sizes && !l.sizes.includes(size)) continue;
    const box = boxOf(l, size);
    if (!box) continue;
    const copy: FreeLayer = { ...structuredClone(l), geometry: { [size]: { ...box } } };
    delete copy.editedAt;
    delete copy.sizes;
    layers.push(copy);
  }
  return layers.length ? { v: 1, mode, size, layers } : null;
}

export function writeClipboard(clip: EditorClipboard): void {
  memory[clip.mode] = clip;
  try {
    window.sessionStorage.setItem(storageKey(clip.mode), JSON.stringify(clip));
  } catch {
    // Storage can be full or blocked; the in-memory copy still pastes in this page.
  }
}

export function readClipboard(mode: ClipboardMode): EditorClipboard | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(mode));
    if (raw) {
      const clip = JSON.parse(raw) as EditorClipboard;
      if (clip?.v === 1 && clip.mode === mode && Array.isArray(clip.layers)) return clip;
    }
  } catch {
    // Fall back to this page's copy.
  }
  return memory[mode] ?? null;
}

const sameBox = (a: LayerBox, b: LayerBox) =>
  Math.abs(a.x - b.x) < 0.01 &&
  Math.abs(a.y - b.y) < 0.01 &&
  Math.abs(a.w - b.w) < 0.01 &&
  Math.abs(a.h - b.h) < 0.01;

export type PasteResult = {
  doc: EditorDoc;
  /** The pasted layers' ids, to select. */
  ids: string[];
  /** Copies left out because this template's card doesn't have their fields or list. */
  skipped: number;
};

/**
 * Paste a clipboard onto `size`. Boxes copied at another size are placed the
 * way "Add to other sizes" places them. A paste that would land exactly on a
 * layer already there moves down and right until it doesn't, so repeated
 * pastes cascade. With `kind` (a template, or a draft made from one), copies
 * using fields or a list that card doesn't have are skipped; with
 * `onlyOnSize` (the template editor) a copy lands on this size only, like an
 * added element, and the editor then offers the other sizes.
 */
export function pasteLayers(
  doc: EditorDoc,
  clip: EditorClipboard,
  size: CardSize,
  opts: { kind?: string; onlyOnSize?: boolean } = {},
  now = Date.now(),
): PasteResult {
  const { kind } = opts;
  const usable = kind
    ? clip.layers.filter((l) => templateDocumentErrors({ layers: [l] }, kind).length === 0)
    : clip.layers;
  const placed = usable.map((l) => {
    const box = l.geometry[clip.size];
    return box ? placeBoxOnSize(box, clip.size, size) : null;
  });
  const taken = layersOf(doc)
    .filter((l) => !l.sizes || l.sizes.includes(size))
    .map((l) => boxOf(l, size))
    .filter((b): b is LayerBox => !!b);
  let shift = 0;
  const at = (b: LayerBox) => ({ ...b, x: b.x + shift, y: b.y + shift });
  while (shift < 50 && placed.some((b) => b && taken.some((t) => sameBox(t, at(b))))) {
    shift += PASTE_OFFSET;
  }

  const groups = new Map<string, string>();
  const copies: FreeLayer[] = [];
  usable.forEach((l, i) => {
    const box = placed[i];
    if (!box) return;
    let group: string | undefined;
    if (l.group) {
      group = groups.get(l.group) ?? newId("g");
      groups.set(l.group, group);
    }
    const copy: FreeLayer = {
      ...structuredClone(l),
      id: newId(),
      group,
      locked: false,
      hidden: false,
      geometry: { [size]: at(box) },
      editedAt: { [size]: now },
    };
    if (!group) delete copy.group;
    delete copy.locked;
    delete copy.hidden;
    copies.push(opts.onlyOnSize ? onlyOnSize(copy, size) : copy);
  });
  return {
    doc: { ...doc, layers: [...layersOf(doc), ...copies] },
    ids: copies.map((c) => c.id),
    skipped: usable.length === clip.layers.length ? 0 : clip.layers.length - usable.length,
  };
}
