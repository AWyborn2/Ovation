/**
 * Set templates (carousel set editor plan, 23 Oct 2026, part 1): one design
 * that holds every slide of a carousel set, in order.
 *
 * A kind template designs one card kind (ADR-011, PM decision 4), and a set
 * used to be put together at build time from several kinds' pages. A set
 * document holds those pages itself, so the editor shows and edits them all:
 *
 * - a **fixed** page shows once (the cover, the sponsors page, or a design
 *   page with no data);
 * - a **repeating** page is designed once and drawn once per item: a team, a
 *   fixture, a result or a junior day (C2: no per-item overrides).
 *
 * Every page is bound to a card kind's page (`kind`, `page`): its tokens, the
 * ADR-010 content fields behind them and its fit check are that page's. So a
 * set page is checked, validated and rendered as the one-page kind document
 * `setPageDocument` gives, and every kind rule (juniors, private players,
 * presets) applies unchanged.
 *
 * Set templates live where kind templates do: in the library and as club
 * copies, under the kind `set:<type>` (`setTemplateKind`), with the same copy
 * rule, versions and fit check. Ovation's are assembled from each look's kind
 * bundles (`assembleSetDocument`), so a set looks exactly like the cards it is
 * made of. A free set binds no data and is never posted by automation (C3).
 */
import type { DerivedPalette, PageKey, TemplateDocumentV2, TemplateLayerV2 } from "./format";
import { FORMAT_VERSION, isDocumentV2 } from "./format";
import { kindHasPage, primaryPage, templateKindFor } from "./pages";

/** The set types a set template is made for. */
export const SET_TYPES = ["teamLists", "results", "matchDay", "matchSummary", "free"] as const;
export type SetType = (typeof SET_TYPES)[number];
/** The set types that bind data. */
export type DataSetType = Exclude<SetType, "free">;

export const SET_TYPE_LABELS: Record<SetType, string> = {
  teamLists: "Team lists",
  results: "Results",
  matchDay: "Match day",
  matchSummary: "Match summaries",
  free: "Free set",
};

export function isSetType(v: unknown): v is SetType {
  return typeof v === "string" && (SET_TYPES as readonly string[]).includes(v);
}

/** The library and club-copy kind a set template is stored under. */
export const SET_KIND_PREFIX = "set:";

export function setTemplateKind(type: SetType): string {
  return `${SET_KIND_PREFIX}${type}`;
}

/** The set type a stored kind names, or null for a card kind. */
export function setTypeOfKind(kind: string): SetType | null {
  if (!kind.startsWith(SET_KIND_PREFIX)) return null;
  const type = kind.slice(SET_KIND_PREFIX.length);
  return isSetType(type) ? type : null;
}

/** Whether a stored kind is a set template's (`set:<type>`), valid or not. */
export function isSetTemplateKind(kind: string): boolean {
  return kind.startsWith(SET_KIND_PREFIX);
}

// ── Pages ───────────────────────────────────────────────────────────────────

/** Fixed slots: the cover, the sponsors page, or a design page with no data. */
export const SET_FIXED_SLOTS = ["cover", "sponsors", "page"] as const;
/** Repeating slots: one slide per team, fixture, result or junior day. */
export const SET_REPEAT_SLOTS = ["team", "fixture", "result", "day"] as const;
export type SetFixedSlot = (typeof SET_FIXED_SLOTS)[number];
export type SetRepeatSlot = (typeof SET_REPEAT_SLOTS)[number];
export type SetSlot = SetFixedSlot | SetRepeatSlot;

export function isRepeatSlot(slot: string): slot is SetRepeatSlot {
  return (SET_REPEAT_SLOTS as readonly string[]).includes(slot);
}

export type SetPageRole = "fixed" | "repeat";

/** One page of a set: its slot, the kind page that fills it, and its layers. */
export type SetPage = {
  /** Stable within the document; slides of a draft name their page by it. */
  id: string;
  /** Shown in the page strip; the slot's label when absent. */
  name?: string;
  role: SetPageRole;
  slot: SetSlot;
  /** The card kind whose content fills this page. */
  kind: string;
  /** That kind's page (`pages.ts`). */
  page: PageKey;
  layers: TemplateLayerV2[];
  /** The colour behind the page's layers (`TemplatePage.background`). */
  background?: string;
};

/**
 * A draft's slide order (part 3): slide keys in the order they post, and the
 * keys of slides deleted from it. A slide in neither (a team named after the
 * set was edited) keeps its natural place. Set templates don't hold one.
 */
export type SetArrangement = {
  order: string[];
  removed: string[];
  /**
   * A slide's own layout (studio-create S9): slide key → the id of a design
   * page that draws that slide instead of its slot's page. A page named here
   * is a layout page: it draws only the slides mapped to it. Optional; a set
   * without it draws as before, and clearing it puts every slide back on its
   * slot's page.
   */
  pageFor?: Record<string, string>;
};

/** A set document: its pages in slide order. */
export type SetDocument = {
  formatVersion: typeof FORMAT_VERSION;
  set: SetType;
  pages: SetPage[];
  /** Derived palettes any page uses (the union of its sources'). */
  palettes?: DerivedPalette[];
  /** Keep the sponsor strip on: its slots can't be hidden. */
  sponsorLock?: boolean;
  arrangement?: SetArrangement;
};

/** The pages a set's arrangement uses as one slide's own layout (`SetArrangement.pageFor`). */
export function layoutPageIds(doc: Pick<SetDocument, "arrangement">): Set<string> {
  return new Set(Object.values(doc.arrangement?.pageFor ?? {}));
}

/**
 * The page that draws a slide: its own layout when the arrangement names one
 * the set holds, drawing the same kind page (so the slide's input fits it),
 * else the page it would draw by its slot.
 */
export function slideLayoutPage(
  doc: Pick<SetDocument, "arrangement" | "pages">,
  key: string,
  page: SetPage,
): SetPage {
  const id = doc.arrangement?.pageFor?.[key];
  if (!id || id === page.id) return page;
  const own = doc.pages.find((p) => p.id === id);
  return own && own.slot === "page" && own.kind === page.kind && own.page === page.page
    ? own
    : page;
}

/** The most pages a set may hold: a Meta carousel posts at most 10 slides, with room to spare. */
export const MAX_SET_PAGES = 20;
/** A set document's size limit (a few kind documents' worth). */
export const MAX_SET_DOCUMENT_BYTES = 3 * 1024 * 1024;

export const SET_SLOT_LABELS: Record<SetSlot, string> = {
  cover: "Cover",
  sponsors: "Sponsors",
  page: "Page",
  team: "Team",
  fixture: "Fixture",
  result: "Result",
  day: "Junior day",
};

/** A page's name in the page strip. */
export function setPageLabel(page: Pick<SetPage, "name" | "slot">): string {
  return page.name?.trim() || SET_SLOT_LABELS[page.slot];
}

/** Whether a stored document is a set document (declares format 2, a set type and a page list). */
export function isSetDocument(doc: unknown): doc is SetDocument {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return false;
  const d = doc as { formatVersion?: unknown; set?: unknown; pages?: unknown };
  return d.formatVersion === FORMAT_VERSION && isSetType(d.set) && Array.isArray(d.pages);
}

// ── Which kind pages may fill a slot ────────────────────────────────────────

type Source = { kind: string; page: PageKey };

/** The list kinds whose card is a set's cover (`card-sets.ts`, `SET_CAPS`). */
const LIST_COVER_KINDS = ["teamListRound", "roundFixtures", "resultsSummary", "weekendWrap"];

/** The repeating slots each data set type has, and the kind page each binds. */
const REPEAT_SOURCES: Record<DataSetType, Partial<Record<SetRepeatSlot, Source>>> = {
  teamLists: { team: { kind: "teamList", page: "team" } },
  matchDay: {
    fixture: { kind: "matchDay", page: "fixture" },
    day: { kind: "matchDay", page: "day" },
  },
  results: {
    result: { kind: "matchSummary", page: "result" },
    day: { kind: "matchSummary", page: "day" },
  },
  matchSummary: {
    result: { kind: "matchSummary", page: "result" },
    day: { kind: "matchSummary", page: "day" },
  },
};

/**
 * Why a page can't sit in a set of `type`, or null when it can. A cover is a
 * Match Day title page or a list card's cover; a sponsors page is Match Day's;
 * a repeating page binds its slot's kind page; a design page is any kind page.
 */
export function setPageSourceProblem(
  type: SetType,
  page: Pick<SetPage, "role" | "slot" | "kind" | "page">,
): string | null {
  const repeat = isRepeatSlot(page.slot);
  if (repeat !== (page.role === "repeat"))
    return repeat ? "a team, fixture, result or day page repeats" : "only item pages repeat";
  if (!kindHasPage(templateKindFor(page.kind), page.page))
    return `"${page.kind}" has no ${page.page} page`;
  if (type === "free" && page.slot !== "page") return "a free set holds design pages only";
  switch (page.slot) {
    case "page":
      return null;
    case "cover":
      return (page.kind === "matchDay" && page.page === "title") ||
        (LIST_COVER_KINDS.includes(page.kind) && page.page === "card")
        ? null
        : "a cover is a title page or a list card";
    case "sponsors":
      return page.kind === "matchDay" && page.page === "sponsors"
        ? null
        : "a sponsors page is Match Day's";
    default: {
      const source = type === "free" ? undefined : REPEAT_SOURCES[type][page.slot];
      if (!source) return `a ${SET_TYPE_LABELS[type]} set has no ${page.slot} pages`;
      return source.kind === page.kind && source.page === page.page
        ? null
        : `a ${page.slot} page draws ${source.kind}'s ${source.page} page`;
    }
  }
}

/** The repeating slots a set type fills (none for a free set). */
export function setRepeatSlots(type: SetType): SetRepeatSlot[] {
  return type === "free" ? [] : (Object.keys(REPEAT_SOURCES[type]) as SetRepeatSlot[]);
}

/** The kind page a repeating slot binds in a set of `type`. */
export function repeatSource(type: SetType, slot: SetRepeatSlot): Source | null {
  return type === "free" ? null : (REPEAT_SOURCES[type][slot] ?? null);
}

// ── One page as a kind document ─────────────────────────────────────────────

/**
 * A set page as the one-page kind document of its kind: what validation, the
 * fit check, the renderer and the editor work on.
 */
export function setPageDocument(
  doc: Pick<SetDocument, "palettes" | "sponsorLock">,
  page: Pick<SetPage, "page" | "layers" | "background">,
): TemplateDocumentV2 {
  const body = { layers: page.layers, ...(page.background ? { background: page.background } : {}) };
  return {
    formatVersion: FORMAT_VERSION,
    pages: { [page.page]: body },
    ...(doc.palettes?.length ? { palettes: [...doc.palettes] } : {}),
    ...(doc.sponsorLock ? { sponsorLock: true } : {}),
  };
}

/**
 * A set page as the document a card renders with: the page under its own key
 * and under its kind's primary page, so it draws whichever page the input
 * selects (a cover title drawn for a list card, say). For rendering only;
 * validation and the fit check take `setPageDocument`.
 */
export function setPageRenderDocument(
  doc: Pick<SetDocument, "palettes" | "sponsorLock">,
  page: Pick<SetPage, "kind" | "page" | "layers" | "background">,
): TemplateDocumentV2 {
  const out = setPageDocument(doc, page);
  out.pages[primaryPage(page.kind)] = out.pages[page.page];
  return out;
}

/** The set with one page's layers replaced (the editor writing a page back). */
export function withSetPageLayers(
  doc: SetDocument,
  pageId: string,
  layers: TemplateLayerV2[],
): SetDocument {
  return { ...doc, pages: doc.pages.map((p) => (p.id === pageId ? { ...p, layers } : p)) };
}

// ── Assembling a set from kind templates ────────────────────────────────────

type RecipePage = { slot: SetSlot; sources: Source[]; optional?: boolean };

/**
 * What each data set is made of, in slide order: the first source a look has
 * fills each page. Team lists open with the look's Round Team Lists cover when
 * it has one, else its Match Day title page, as every other set does.
 */
export const SET_RECIPES: Record<DataSetType, readonly RecipePage[]> = {
  teamLists: [
    {
      slot: "cover",
      sources: [
        { kind: "teamListRound", page: "card" },
        { kind: "matchDay", page: "title" },
      ],
    },
    { slot: "team", sources: [{ kind: "teamList", page: "team" }] },
    { slot: "sponsors", sources: [{ kind: "matchDay", page: "sponsors" }] },
  ],
  matchDay: [
    { slot: "cover", sources: [{ kind: "matchDay", page: "title" }] },
    { slot: "fixture", sources: [{ kind: "matchDay", page: "fixture" }] },
    { slot: "day", sources: [{ kind: "matchDay", page: "day" }], optional: true },
    { slot: "sponsors", sources: [{ kind: "matchDay", page: "sponsors" }] },
  ],
  results: [
    { slot: "cover", sources: [{ kind: "matchDay", page: "title" }] },
    { slot: "result", sources: [{ kind: "matchSummary", page: "result" }] },
    { slot: "day", sources: [{ kind: "matchSummary", page: "day" }], optional: true },
    { slot: "sponsors", sources: [{ kind: "matchDay", page: "sponsors" }] },
  ],
  matchSummary: [
    { slot: "cover", sources: [{ kind: "matchDay", page: "title" }] },
    { slot: "result", sources: [{ kind: "matchSummary", page: "result" }] },
    { slot: "day", sources: [{ kind: "matchSummary", page: "day" }], optional: true },
    { slot: "sponsors", sources: [{ kind: "matchDay", page: "sponsors" }] },
  ],
};

/** The kinds a set type's recipe may read. */
export function setRecipeKinds(type: DataSetType): string[] {
  return [...new Set(SET_RECIPES[type].flatMap((p) => p.sources.map((s) => s.kind)))];
}

/** The pages of a kind document as stored (v2 only; v1 documents hold the primary page). */
function kindDocPage(doc: unknown, page: PageKey): TemplateLayerV2[] | null {
  if (!isDocumentV2(doc)) return null;
  const layers = (doc.pages as Record<string, { layers?: unknown } | undefined>)[page]?.layers;
  return Array.isArray(layers) && layers.length > 0 ? (layers as TemplateLayerV2[]) : null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Where each page of an assembled set came from: `<kind>.<page>`, in page order. */
export type SetAssembly = { document: SetDocument; sources: string[] };

/**
 * Assemble a data set from kind documents (a look's bundles, or a club's
 * templates): each recipe page takes the first source that has it. Null when
 * a page the set needs has no source. Layers are copied as they are, so every
 * page looks, fits and binds exactly as its kind's card does.
 */
export function assembleSetDocument(
  type: DataSetType,
  documentFor: (kind: string) => unknown,
): SetAssembly | null {
  const pages: SetPage[] = [];
  const sources: string[] = [];
  const palettes = new Set<DerivedPalette>();
  let sponsorLock = false;
  for (const recipe of SET_RECIPES[type]) {
    let found: { source: Source; layers: TemplateLayerV2[]; doc: unknown } | null = null;
    for (const source of recipe.sources) {
      const doc = documentFor(source.kind);
      const layers = kindDocPage(doc, source.page);
      if (layers) {
        found = { source, layers, doc };
        break;
      }
    }
    if (!found) {
      if (recipe.optional) continue;
      return null;
    }
    const doc = found.doc as { palettes?: unknown; sponsorLock?: unknown };
    if (Array.isArray(doc.palettes))
      for (const p of doc.palettes) palettes.add(p as DerivedPalette);
    if (recipe.slot === "sponsors" && doc.sponsorLock === true) sponsorLock = true;
    pages.push({
      id: recipe.slot,
      role: isRepeatSlot(recipe.slot) ? "repeat" : "fixed",
      slot: recipe.slot,
      kind: found.source.kind,
      page: found.source.page,
      layers: clone(found.layers),
    });
    sources.push(`${found.source.kind}.${found.source.page}`);
  }
  return {
    document: {
      formatVersion: FORMAT_VERSION,
      set: type,
      pages,
      ...(palettes.size ? { palettes: [...palettes].sort() } : {}),
      ...(sponsorLock ? { sponsorLock: true } : {}),
    },
    sources,
  };
}

/**
 * A free set started from one design (part 4): the design's primary page as
 * the cover-like first page, and `copies` duplicates after it. A free set binds
 * no data; its pages draw with the club's brand only.
 */
export function freeSetFromDocument(
  kind: string,
  page: PageKey,
  doc: unknown,
  copies = 2,
): SetDocument | null {
  const layers = kindDocPage(doc, page);
  if (!layers) return null;
  const d = doc as { palettes?: unknown; sponsorLock?: unknown };
  const pages: SetPage[] = Array.from({ length: 1 + Math.max(0, copies) }, (_, i) => ({
    id: `page-${i + 1}`,
    role: "fixed" as const,
    slot: "page" as const,
    kind,
    page,
    name: `Page ${i + 1}`,
    layers: clone(layers),
  }));
  return {
    formatVersion: FORMAT_VERSION,
    set: "free",
    pages,
    ...(Array.isArray(d.palettes) && d.palettes.length
      ? { palettes: [...(d.palettes as DerivedPalette[])] }
      : {}),
    ...(d.sponsorLock === true ? { sponsorLock: true } : {}),
  };
}

/**
 * The data set whose pages suit a card of `kind` (full draft editor plan, D9):
 * the set that repeats it (a team list, a result, a fixture), or the one a list
 * card is the cover of. Null for a kind no set draws (a player card).
 */
export function setTypeForKind(kind: string): DataSetType | null {
  const own = templateKindFor(kind);
  for (const type of SET_TYPES) {
    if (type === "free") continue;
    if (Object.values(REPEAT_SOURCES[type]).some((s) => s && templateKindFor(s.kind) === own))
      return type;
  }
  if (kind === "teamListRound") return "teamLists";
  if (kind === "roundFixtures") return "matchDay";
  if (kind === "resultsSummary" || kind === "weekendWrap") return "results";
  return null;
}

/** The pages of a look's set a card can start its own set from (D9): not junior days. */
export function lookPagesForCard(base: SetDocument): SetPage[] {
  return base.pages.filter((p) => p.slot !== "day");
}

/**
 * A card made into a carousel from its design and pages picked from a look's
 * set (full draft editor plan, D9). The set is a free set: every page is a
 * design page drawing the card's own data (a page of the card's kind takes it
 * as the card's, a cover and the sponsors page adapt it). The picked pages keep
 * the look's order, with the card's design (and a copy of it) in place of the
 * look's item page, after its cover.
 */
export function freeSetFromLook(
  kind: string,
  doc: unknown,
  base: SetDocument | null,
  picked: readonly string[],
  copy = false,
): SetDocument | null {
  const page = primaryPage(kind);
  const own = kindDocPage(doc, page);
  if (!own) return null;
  const design: SetPage[] = [
    {
      id: "page-1",
      role: "fixed",
      slot: "page",
      kind,
      page,
      name: "Your design",
      layers: clone(own),
    },
    ...(copy
      ? [
          {
            id: "page-2",
            role: "fixed" as const,
            slot: "page" as const,
            kind,
            page,
            name: "Your design (copy)",
            layers: clone(own),
          },
        ]
      : []),
  ];
  const chosen = new Set(picked);
  const looks = (base ? lookPagesForCard(base) : []).filter((p) => chosen.has(p.id));
  const pages: SetPage[] = [];
  let placed = false;
  for (const p of looks) {
    if (!placed && p.slot !== "cover") {
      pages.push(...design);
      placed = true;
    }
    // A page of the card's own kind draws the card itself.
    const same = templateKindFor(p.kind) === templateKindFor(kind);
    pages.push({
      id: `look-${p.id}`,
      role: "fixed",
      slot: "page",
      kind: same ? kind : p.kind,
      page: p.page,
      name: `Look's ${setPageLabel(p).toLowerCase()}`,
      layers: clone(p.layers),
    });
  }
  if (!placed) pages.push(...design);
  const d = doc as { palettes?: unknown; sponsorLock?: unknown };
  const palettes = new Set<DerivedPalette>(looks.length ? (base?.palettes ?? []) : []);
  if (Array.isArray(d.palettes)) for (const p of d.palettes) palettes.add(p as DerivedPalette);
  const sponsors = looks.some((p) => p.slot === "sponsors") && base?.sponsorLock === true;
  return {
    formatVersion: FORMAT_VERSION,
    set: "free",
    pages: pages.slice(0, MAX_SET_PAGES),
    ...(palettes.size ? { palettes: [...palettes].sort() } : {}),
    ...(d.sponsorLock === true || sponsors ? { sponsorLock: true } : {}),
  };
}

/** Whether a kind page can be a set's cover (a Match Day title, a list card). */
function canCover(kind: string, page: PageKey): boolean {
  return (
    (kind === "matchDay" && page === "title") ||
    (LIST_COVER_KINDS.includes(kind) && page === "card")
  );
}

/**
 * A set started from one design (part 4, "Make a carousel set"): `base` is
 * the look's set template; the design takes every page of it that it can
 * draw (a cover, a team, fixture or result page, the sponsors page), as a
 * Match Day template fills the Match Day set's pages. A design that draws none
 * of them (a player card) becomes the set's first page, in place of its cover,
 * with no data. A free set is the design and copies of it.
 */
export function setFromDesign(
  type: SetType,
  base: SetDocument | null,
  kind: string,
  doc: unknown,
): SetDocument | null {
  const page = primaryPage(kind);
  if (type === "free") return freeSetFromDocument(kind, page, doc);
  if (!base || base.set !== type) return null;
  const d = doc as { palettes?: unknown; sponsorLock?: unknown };
  const palettes = new Set<DerivedPalette>(base.palettes ?? []);
  if (Array.isArray(d.palettes)) for (const p of d.palettes) palettes.add(p as DerivedPalette);
  let used = false;
  const pages = base.pages.map((p) => {
    // A cover may be any title page or list cover; other slots draw their own kind page.
    const fromPage =
      p.slot === "cover"
        ? canCover(kind, page)
          ? page
          : kind === "matchDay" && kindDocPage(doc, "title")
            ? "title"
            : null
        : templateKindFor(kind) === templateKindFor(p.kind)
          ? p.page
          : null;
    const layers = fromPage ? kindDocPage(doc, fromPage) : null;
    if (!fromPage || !layers) return p;
    used = true;
    return p.slot === "cover"
      ? { ...p, kind, page: fromPage, layers: clone(layers) }
      : { ...p, layers: clone(layers) };
  });
  if (!used) {
    const own = kindDocPage(doc, page);
    if (!own) return null;
    const first: SetPage = {
      id: "design",
      name: "Cover",
      role: "fixed",
      slot: "page",
      kind,
      page,
      layers: clone(own),
    };
    const rest = pages.filter((p) => p.slot !== "cover");
    pages.splice(0, pages.length, first, ...rest);
  }
  return {
    ...base,
    pages,
    ...(palettes.size ? { palettes: [...palettes].sort() } : {}),
    ...(base.sponsorLock || d.sponsorLock === true ? { sponsorLock: true } : {}),
  };
}
