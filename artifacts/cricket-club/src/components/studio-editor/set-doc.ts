/**
 * The editor's pages (carousel set editor plan, part 2): one page model for
 * every template, so the editor has one page strip.
 *
 * A kind template's pages are its kind's (Match Day's fixture, title, day and
 * sponsors). A set template's pages are its own, in slide order, each bound
 * to a kind's page; the editor holds them as a `TemplateDoc` whose pages are
 * keyed by page id, with the set's page list (`setDesign`) beside them, so adding,
 * deleting and reordering pages go through history like any other edit.
 */
import {
  isRepeatSlot,
  isSetDocument,
  kindPages,
  primaryPage,
  repeatSource,
  setPageLabel,
  setPageRenderDocument,
  setRepeatSlots,
  SET_SLOT_LABELS,
  type PageKey,
  type SetDocument,
  type SetPage,
  type SetRepeatSlot,
  type SetType,
} from "@workspace/scorecard/kind-templates";
import type { CardAdjustments, FreeLayer, PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { newId } from "./document";
import { PAGE_LABEL, type OpenedTemplate, type TemplateDoc } from "./template-doc";

/** A set page without its layers (they live in `TemplateDoc.pages[id]`). */
export type SetPageMeta = Omit<SetPage, "layers">;

/** A set as the editor holds it beside its pages. */
export type EditorSet = {
  type: SetType;
  pages: SetPageMeta[];
  arrangement?: SetDocument["arrangement"];
};

/** One page in the strip: its id, the kind page it binds, and its name. */
export type EditorPage = {
  id: string;
  kind: string;
  page: PageKey;
  label: string;
  repeat: boolean;
};

/** A template in the editor: a `TemplateDoc`, and for a set its page list. */
export type EditorTemplateDoc = Omit<TemplateDoc, "set"> & { setDesign?: EditorSet };

/** Open a stored set document: pages by id, the page list beside them. */
export function openSetTemplate(doc: SetDocument): OpenedTemplate & { doc: EditorTemplateDoc } {
  const pages: Record<string, { layers: FreeLayer[]; background?: string }> = {};
  for (const p of doc.pages)
    pages[p.id] = {
      layers: p.layers as unknown as FreeLayer[],
      ...(p.background ? { background: p.background } : {}),
    };
  return {
    doc: {
      formatVersion: 2,
      pages: pages as TemplateDoc["pages"],
      ...(doc.palettes?.length ? { palettes: doc.palettes } : {}),
      ...(doc.sponsorLock ? { sponsorLock: true } : {}),
      setDesign: {
        type: doc.set,
        pages: doc.pages.map(({ layers: _layers, background: _background, ...meta }) => meta),
        ...(doc.arrangement ? { arrangement: doc.arrangement } : {}),
      },
    },
    sourceFormat: 2,
  };
}

/** The editor's set as the stored set document. */
export function storedSetDocument(doc: EditorTemplateDoc): SetDocument {
  const set = doc.setDesign!;
  const pages = doc.pages as Record<
    string,
    { layers: FreeLayer[]; background?: string } | undefined
  >;
  return {
    formatVersion: 2,
    set: set.type,
    pages: set.pages.map((meta) => ({
      ...meta,
      layers: (pages[meta.id]?.layers ?? []) as unknown as SetPage["layers"],
      ...(pages[meta.id]?.background ? { background: pages[meta.id]!.background } : {}),
    })),
    ...(doc.palettes?.length ? { palettes: doc.palettes as SetDocument["palettes"] } : {}),
    ...(doc.sponsorLock ? { sponsorLock: true } : {}),
    ...(set.arrangement ? { arrangement: set.arrangement } : {}),
  };
}

/** Open any stored document: a set's, or a kind's (`openTemplate`). */
export function isSetTemplateDoc(doc: unknown): doc is SetDocument {
  return isSetDocument(doc);
}

/** The editor's pages, in strip order. */
export function editorPageList(doc: EditorTemplateDoc, kind: string): EditorPage[] {
  if (doc.setDesign)
    return doc.setDesign.pages.map((p) => ({
      id: p.id,
      kind: p.kind,
      page: p.page,
      label: setPageLabel(p),
      repeat: p.role === "repeat",
    }));
  return kindPages(kind).map((p) => ({
    id: p,
    kind,
    page: p,
    label: PAGE_LABEL[p],
    repeat: false,
  }));
}

/** The first page the editor opens on. */
export function firstPageId(doc: EditorTemplateDoc, kind: string): string {
  return doc.setDesign ? (doc.setDesign.pages[0]?.id ?? "") : primaryPage(kind);
}

/** What draws one page: the page's layers as its kind's document. */
export function pageRenderDocument(
  doc: EditorTemplateDoc,
  page: Pick<EditorPage, "id" | "kind" | "page">,
): CardAdjustments {
  if (!doc.setDesign) return doc as unknown as CardAdjustments;
  const body = (
    doc.pages as Record<string, { layers: FreeLayer[]; background?: string } | undefined>
  )[page.id];
  return setPageRenderDocument(
    { palettes: doc.palettes as SetDocument["palettes"], sponsorLock: doc.sponsorLock },
    {
      kind: page.kind,
      page: page.page,
      layers: (body?.layers ?? []) as unknown as SetPage["layers"],
      ...(body?.background ? { background: body.background } : {}),
    },
  ) as unknown as CardAdjustments;
}

// ── Page operations (sets only) ─────────────────────────────────────────────

const pagesOf = (doc: EditorTemplateDoc) =>
  doc.pages as Record<string, { layers: FreeLayer[] } | undefined>;

/** A page id not yet used in the set. */
function freshId(doc: EditorTemplateDoc, base: string): string {
  const used = new Set(doc.setDesign?.pages.map((p) => p.id));
  const stem = base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "page";
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n++) if (!used.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/** Layers copied with new ids, so two pages never share one. */
function copyLayers(layers: readonly FreeLayer[]): FreeLayer[] {
  const fresh = (l: FreeLayer): FreeLayer => {
    const out = { ...l, id: newId() } as FreeLayer & { children?: FreeLayer[] };
    if (Array.isArray(out.children)) out.children = out.children.map(fresh);
    return out;
  };
  return JSON.parse(JSON.stringify(layers)).map(fresh) as FreeLayer[];
}

function withPages(
  doc: EditorTemplateDoc,
  pages: SetPageMeta[],
  layers: Record<string, { layers: FreeLayer[] } | undefined>,
): EditorTemplateDoc {
  return { ...doc, pages: layers as TemplateDoc["pages"], setDesign: { ...doc.setDesign!, pages } };
}

/**
 * Insert a page after `afterId` (at the end when absent). A repeating slot
 * the set already has, or a second cover or sponsors page, becomes a design
 * page (C2: one design per repeating slot).
 */
export function addSetPage(
  doc: EditorTemplateDoc,
  meta: Omit<SetPageMeta, "id"> & { id?: string },
  layers: readonly FreeLayer[],
  afterId?: string,
): { doc: EditorTemplateDoc; id: string } {
  const set = doc.setDesign!;
  const taken = set.pages.some((p) => p.slot === meta.slot);
  const slotted: Omit<SetPageMeta, "id"> =
    taken && meta.slot !== "page"
      ? { ...meta, slot: "page", role: "fixed", name: meta.name ?? setPageLabel(meta) }
      : meta;
  const id = freshId(doc, meta.id ?? slotted.name ?? slotted.slot);
  const at = afterId ? set.pages.findIndex((p) => p.id === afterId) + 1 : set.pages.length;
  const pages = [...set.pages];
  pages.splice(at <= 0 ? pages.length : at, 0, { ...slotted, id });
  return {
    doc: withPages(doc, pages, { ...pagesOf(doc), [id]: { layers: copyLayers(layers) } }),
    id,
  };
}

/** A blank design page drawn as `like`'s kind page (so it has that page's fields). */
export function addBlankPage(
  doc: EditorTemplateDoc,
  like: Pick<SetPageMeta, "kind" | "page">,
  afterId?: string,
) {
  const n = (doc.setDesign?.pages.filter((p) => p.slot === "page").length ?? 0) + 1;
  return addSetPage(
    doc,
    { role: "fixed", slot: "page", kind: like.kind, page: like.page, name: `Page ${n}` },
    [],
    afterId,
  );
}

/** A copy of a page after it; a copy of a slot page is a design page (C2). */
export function duplicateSetPage(doc: EditorTemplateDoc, id: string) {
  const meta = doc.setDesign!.pages.find((p) => p.id === id)!;
  const copy: Omit<SetPageMeta, "id"> = {
    role: "fixed",
    slot: "page",
    kind: meta.kind,
    page: meta.page,
    name: `${setPageLabel(meta)} copy`,
  };
  return addSetPage(doc, copy, pagesOf(doc)[id]?.layers ?? [], id);
}

/** The set without a page. */
export function deleteSetPage(doc: EditorTemplateDoc, id: string): EditorTemplateDoc {
  const layers = { ...pagesOf(doc) };
  delete layers[id];
  return withPages(
    doc,
    doc.setDesign!.pages.filter((p) => p.id !== id),
    layers,
  );
}

/** The set with a page moved to index `to`. */
export function moveSetPage(doc: EditorTemplateDoc, id: string, to: number): EditorTemplateDoc {
  const pages = [...doc.setDesign!.pages];
  const from = pages.findIndex((p) => p.id === id);
  if (from < 0) return doc;
  const [page] = pages.splice(from, 1);
  pages.splice(Math.max(0, Math.min(pages.length, to)), 0, page!);
  return withPages(doc, pages, pagesOf(doc));
}

/** The repeating slots a set type has and this set lacks: what "Add an item page" offers. */
export function missingRepeatSlots(doc: EditorTemplateDoc): SetRepeatSlot[] {
  const set = doc.setDesign!;
  return setRepeatSlots(set.type).filter((slot) => !set.pages.some((p) => p.slot === slot));
}

/** A new, empty repeating page for `slot` (its kind page from the set type). */
export function addRepeatPage(doc: EditorTemplateDoc, slot: SetRepeatSlot, afterId?: string) {
  const source = repeatSource(doc.setDesign!.type, slot)!;
  return addSetPage(
    doc,
    { id: slot, role: "repeat", slot, kind: source.kind, page: source.page },
    [],
    afterId,
  );
}

/** Whether a set page is one of its repeating slots. */
export const isRepeatPage = (meta: Pick<SetPageMeta, "slot">) => isRepeatSlot(meta.slot);

export { SET_SLOT_LABELS };

/** The set with a draft's slide order and deletions (part 3). */
export function withArrangement(
  doc: EditorTemplateDoc,
  arrangement: NonNullable<EditorSet["arrangement"]>,
): EditorTemplateDoc {
  return { ...doc, setDesign: { ...doc.setDesign!, arrangement } };
}

/** One real slide of a set draft, as the editor's slides mode shows it (part 3). */
export type EditorSlide = {
  key: string;
  label: string;
  page: Pick<SetPageMeta, "id" | "kind" | "page" | "role" | "slot">;
  input: ShareCardInput;
  data: PackCardData;
  junior: boolean;
  sponsorsOn: boolean;
  /** A design page (no data): deleting the slide deletes its page. */
  design: boolean;
};
