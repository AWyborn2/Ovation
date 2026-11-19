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
  layoutPageIds,
  withoutStrandedLayouts,
  MAX_SET_PAGES,
  pageForInput,
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

/**
 * The pages a single card or draft draws (not a set, not a template): only the
 * one its input selects (`pageForInput`), so the editor doesn't list a Match Day
 * card's title, junior day and sponsors pages, which only a set ever draws.
 */
export function singleCardPages(
  pages: EditorPage[],
  kind: string,
  input: Record<string, unknown>,
): EditorPage[] {
  const drawn =
    typeof input.kind === "string"
      ? pageForInput(input as Parameters<typeof pageForInput>[0])
      : primaryPage(kind);
  const own = pages.filter((p) => p.page === drawn);
  if (own.length) return own;
  const primary = pages.filter((p) => p.page === primaryPage(kind));
  return primary.length ? primary : pages;
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

/**
 * The name of a page added from another template ("Add a page → From another
 * template"): the template's name, with the page's label when it has several
 * pages. A name ending in "layout" reads as a slide's own layout
 * (`strandedLayoutPageIds`), which opening, saving, Change look and migration
 * 0079 let go of when no slide maps to it; so such a name always takes the
 * page's label too ("Team layout · Team"), and the added page stays the
 * admin's (retest 5, item 5). At most 60 characters, the label kept.
 */
export function templatePageName(templateName: string, pageLabel: string, multiPage: boolean) {
  const name = templateName.trim();
  const plain = name.slice(0, 60).trimEnd();
  if (!multiPage && !/\slayout$/i.test(plain)) return plain;
  const suffix = ` · ${pageLabel}`;
  return `${name.slice(0, 60 - suffix.length).trimEnd()}${suffix}`;
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

// ── A slide's own layout (studio-create S9) ─────────────────────────────────

type PageBody = { layers: FreeLayer[]; background?: string };

/**
 * The pages that are one slide's own layout (`arrangement.pageFor`), and any
 * a slide let go of before the 17 Nov 2026 fix (`strandedLayoutPageIds`).
 */
export const layoutPages = (doc: EditorTemplateDoc): Set<string> =>
  layoutPageIds({
    ...(doc.setDesign?.arrangement ? { arrangement: doc.setDesign.arrangement } : {}),
    pages: doc.setDesign?.pages ?? [],
  });

/**
 * The set with `pageFor` replaced, and every layout page no slide maps to any
 * more deleted: a layout page is only ever made as one, so it never turns
 * into a design page (a slide of its own) when it is let go.
 */
function withPageFor(doc: EditorTemplateDoc, pageFor: Record<string, string>): EditorTemplateDoc {
  const before = layoutPages(doc);
  const used = new Set(Object.values(pageFor));
  let next = doc;
  for (const id of before) if (!used.has(id)) next = deleteSetPage(next, id);
  const arr = next.setDesign!.arrangement ?? { order: [], removed: [] };
  const { pageFor: _old, ...rest } = arr;
  return withArrangement(next, Object.keys(pageFor).length ? { ...rest, pageFor } : rest);
}

const NO_ARRANGEMENT = { order: [] as string[], removed: [] as string[] };

/**
 * The set draft with its slides in `keys` order. Only the order changes: each
 * slide keeps its own layout (`pageFor`) and every deletion stands.
 */
export function withSlideOrder(doc: EditorTemplateDoc, keys: readonly string[]): EditorTemplateDoc {
  const arr = doc.setDesign?.arrangement ?? NO_ARRANGEMENT;
  return withArrangement(doc, { ...arr, order: [...keys] });
}

/**
 * The set draft without slide `key`. A design page goes with its page. A data
 * slide is left out of the post, and its own layout goes with it (a layout
 * page draws only its slide); the other slides keep theirs.
 */
export function deleteSlide(
  doc: EditorTemplateDoc,
  slide: { key: string; design: boolean; page: { id: string } },
): EditorTemplateDoc {
  if (slide.design) {
    const next = deleteSetPage(doc, slide.page.id);
    const arr = next.setDesign?.arrangement ?? NO_ARRANGEMENT;
    return withArrangement(next, { ...arr, order: arr.order.filter((k) => k !== slide.key) });
  }
  const next = withSlideLayout(doc, slide.key, null);
  const arr = next.setDesign?.arrangement ?? NO_ARRANGEMENT;
  return withArrangement(next, {
    ...arr,
    order: arr.order.filter((k) => k !== slide.key),
    removed: arr.removed.includes(slide.key) ? arr.removed : [...arr.removed, slide.key],
  });
}

/** Draw slide `key` with `pageId` (a layout page), or with its slot's page again (`null`). */
export function withSlideLayout(
  doc: EditorTemplateDoc,
  key: string,
  pageId: string | null,
): EditorTemplateDoc {
  const pageFor = { ...(doc.setDesign?.arrangement?.pageFor ?? {}) };
  if (pageId) pageFor[key] = pageId;
  else delete pageFor[key];
  return withPageFor(doc, pageFor);
}

/**
 * A layout page's name, at most 60 characters. A long slide name is cut
 * before its " layout" ending, which marks the page as a slide's layout
 * (`strandedLayoutPageIds`), so a let-go layout is still known as one.
 */
function layoutName(name: string): string {
  if (name.length <= 60) return name;
  const end = / layout$/i.exec(name);
  return end ? `${name.slice(0, 60 - end[0].length).trimEnd()}${end[0]}` : name.slice(0, 60);
}

/**
 * A new layout for slide `key` alone: a copy of the page it draws with now
 * (`fromId`), as a design page of the same kind page, mapped to the slide.
 */
export function newSlideLayout(
  doc: EditorTemplateDoc,
  key: string,
  fromId: string,
  name: string,
): { doc: EditorTemplateDoc; id: string } {
  const from = doc.setDesign!.pages.find((p) => p.id === fromId)!;
  const body = (doc.pages as Record<string, PageBody | undefined>)[fromId];
  const r = addSetPage(
    doc,
    { role: "fixed", slot: "page", kind: from.kind, page: from.page, name: layoutName(name) },
    body?.layers ?? [],
  );
  const pages = { ...(r.doc.pages as Record<string, PageBody | undefined>) };
  if (body?.background) pages[r.id] = { ...pages[r.id]!, background: body.background };
  const added = { ...r.doc, pages: pages as TemplateDoc["pages"] };
  return { doc: withSlideLayout(added, key, r.id), id: r.id };
}

/**
 * Every slide drawn like slide `key`'s page `pageId`: its layers become those
 * of the slot's page (`naturalId`), and every layout of that kind page goes,
 * so each slide on it draws with the one design again.
 */
export function applyLayoutToAll(
  doc: EditorTemplateDoc,
  pageId: string,
  naturalId: string,
): EditorTemplateDoc {
  const natural = doc.setDesign!.pages.find((p) => p.id === naturalId);
  if (!natural) return doc;
  const bodies = doc.pages as Record<string, PageBody | undefined>;
  let next = doc;
  if (pageId !== naturalId && bodies[pageId]) {
    const { layers, background } = bodies[pageId]!;
    const body: PageBody = { layers: copyLayers(layers), ...(background ? { background } : {}) };
    next = { ...doc, pages: { ...bodies, [naturalId]: body } as TemplateDoc["pages"] };
  }
  const layouts = next.setDesign!.pages;
  const same = (id: string) => {
    const p = layouts.find((x) => x.id === id);
    return !!p && p.kind === natural.kind && p.page === natural.page;
  };
  const pageFor = Object.fromEntries(
    Object.entries(next.setDesign!.arrangement?.pageFor ?? {}).filter(([, id]) => !same(id)),
  );
  return withPageFor(next, pageFor);
}

/**
 * A slide's design edited in the card editor (studio-create S8), written back
 * into the set: onto its own layout when no other slide shares it, else onto
 * a new layout for that slide alone, so the rest of the set is unchanged.
 * `drawnBy` is the page drawing the slide now; `null` when the set is full.
 */
export function withSlideDesign(
  set: SetDocument,
  key: string,
  drawnBy: string,
  body: { layers: FreeLayer[]; background?: string },
  name: string,
): SetDocument | null {
  // A layout page no slide maps to any more is shed on the way (see
  // `strandedLayoutPageIds`).
  const doc = openSetTemplate(withoutStrandedLayouts(set)).doc;
  const pageFor = doc.setDesign?.arrangement?.pageFor ?? {};
  const alone =
    pageFor[key] === drawnBy &&
    Object.entries(pageFor).every(([k, id]) => k === key || id !== drawnBy);
  let next = doc;
  let id = drawnBy;
  if (!alone) {
    if (doc.setDesign!.pages.length >= MAX_SET_PAGES) return null;
    const r = newSlideLayout(doc, key, drawnBy, name);
    next = r.doc;
    id = r.id;
  }
  const pages = {
    ...(next.pages as Record<string, PageBody | undefined>),
    [id]: { layers: body.layers, ...(body.background ? { background: body.background } : {}) },
  };
  return storedSetDocument({ ...next, pages: pages as TemplateDoc["pages"] });
}

// ── Save checks and restore names (dev retest 3, item 11) ───────────────────

/**
 * Whether a set page is a design page of its own (a page added with Add
 * page, or a copy): a page with no data, not a slide's own layout.
 */
export function isOwnDesignPage(doc: EditorTemplateDoc, id: string): boolean {
  const meta = doc.setDesign?.pages.find((p) => p.id === id);
  return !!meta && meta.slot === "page" && !layoutPages(doc).has(id);
}

/** A slide key without its internal prefix: what a slide no longer drawn is called. */
const bareKey = (key: string) => key.replace(/^detail:[a-z]+:|^page:/, "");

/**
 * The slides a set draft has deleted, each with the name its tile had, for
 * "Restore a deleted slide". `slides` draws the set's slides.
 */
export function deletedSlides(
  set: SetDocument,
  slides: (doc: SetDocument) => ReadonlyArray<{ key: string; label: string }>,
): Array<{ key: string; label: string }> {
  const removed = set.arrangement?.removed ?? [];
  if (removed.length === 0) return [];
  const all = slides({ ...set, arrangement: { ...set.arrangement!, removed: [] } });
  return removed.map((key) => ({
    key,
    label: all.find((s) => s.key === key)?.label.trim() || bareKey(key),
  }));
}

/**
 * Why a set can't be saved yet: each slide (or, outside a draft, each page)
 * with nothing on it, said so the admin knows which and what to do. The
 * first blank slide's key comes with it, so the editor can show it.
 */
export function blankSetBlockers(
  doc: EditorTemplateDoc,
  pages: ReadonlyArray<Pick<EditorPage, "id" | "label">>,
  slides: ReadonlyArray<{ key: string; label: string; page: { id: string } }> | null,
): { messages: string[]; firstSlide: string | null } {
  const blank = (id: string) =>
    !(doc.pages as Record<string, { layers?: unknown[] } | undefined>)[id]?.layers?.length;
  const messages: string[] = [];
  let firstSlide: string | null = null;
  const drawn = new Set<string>();
  if (slides) {
    slides.forEach((s, i) => {
      drawn.add(s.page.id);
      if (!blank(s.page.id)) return;
      firstSlide ??= s.key;
      messages.push(
        `Not saved: slide ${i + 1} ("${s.label}") is blank. Add something to it, or delete the slide, then save.`,
      );
    });
  }
  for (const p of pages) {
    if (drawn.has(p.id) || !blank(p.id)) continue;
    messages.push(
      `Not saved: the page "${p.label}" is blank. Add something to it, or delete the page, then save.`,
    );
  }
  return { messages, firstSlide };
}

// ── Change look (dev retest 3, item 12) ─────────────────────────────────────

/**
 * A set switched to another look's set template (`next`), keeping the pages
 * the admin added to it (Add page: a blank page, a copy, a page from a
 * template), which are the admin's own and no look's. A slide's own layout
 * (S8/S9) was made from the old look's page, so it goes, as decision 7 says.
 *
 * An added page is a design page of `prev` that is no slide's layout and not
 * one of the old look's own pages (`oldLook`, when known; else the new
 * look's, by id). Each keeps its place after the page it followed, where the
 * new look has a page in that slot, else goes at the end. A page id the new
 * look already uses is renamed, and the arrangement follows it. The set's
 * page limit holds: pages past it are left out (`dropped` counts them).
 */
export function keepAddedPages(
  next: SetDocument,
  prev: SetDocument,
  oldLook?: Pick<SetDocument, "pages"> | null,
): { doc: SetDocument; kept: number; dropped: number } {
  const old = withoutStrandedLayouts(prev);
  const layouts = layoutPageIds(old);
  const lookIds = new Set((oldLook ?? next).pages.map((p) => p.id));
  const added = old.pages.filter(
    (p) => p.slot === "page" && !layouts.has(p.id) && !lookIds.has(p.id),
  );
  if (added.length === 0) return { doc: next, kept: 0, dropped: 0 };
  const room = Math.max(0, MAX_SET_PAGES - next.pages.length);
  const keep = added.slice(0, room);
  const used = new Set(next.pages.map((p) => p.id));
  const renamed: Record<string, string> = {};
  const pages = [...next.pages];
  for (const page of keep) {
    let id = page.id;
    for (let n = 2; used.has(id); n++) id = `${page.id.slice(0, 36)}-${n}`;
    used.add(id);
    if (id !== page.id) renamed[`page:${page.id}`] = `page:${id}`;
    // After the page it followed in the old set, where the new look has that slot.
    const before = old.pages.slice(0, old.pages.indexOf(page)).reverse();
    let at = pages.length;
    for (const b of before) {
      const placed = keep.includes(b)
        ? pages.findIndex((p) => p.id === (renamed[`page:${b.id}`]?.slice(5) ?? b.id))
        : b.slot === "page"
          ? -1
          : pages.findIndex((p) => p.slot === b.slot);
      if (placed >= 0) {
        at = placed + 1;
        break;
      }
    }
    pages.splice(at, 0, { ...page, id });
  }
  const palettes = [...new Set([...(next.palettes ?? []), ...(old.palettes ?? [])])].sort();
  const rename = (k: string) => renamed[k] ?? k;
  const arrangement = next.arrangement
    ? {
        ...next.arrangement,
        order: next.arrangement.order.map(rename),
        removed: next.arrangement.removed.map(rename),
      }
    : undefined;
  return {
    doc: {
      ...next,
      pages,
      ...(palettes.length ? { palettes } : {}),
      ...(arrangement ? { arrangement } : {}),
    },
    kept: keep.length,
    dropped: added.length - keep.length,
  };
}
