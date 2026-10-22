/**
 * The element library in the Elements panel (editable-elements plan, D3):
 * every look's decorations and the elements clubs saved, from
 * `/template-library/elements`, by look and category or by search.
 *
 * Each tile draws the element on the blank card in the club's own colours,
 * crest and sample data, zoomed to the element. Choosing one adds its layers
 * to the card as native layers (`element-insert.ts`), at the size being
 * edited.
 */
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  getListLibraryElementsQueryKey,
  useListLibraryElements,
  useListLibraryLooks,
  type LibraryElement,
  type LibraryElementCategory,
  type ListLibraryElementsParams,
} from "@workspace/api-client-react";
import { ELEMENT_CATEGORIES, ELEMENT_CATEGORY_LABELS } from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { WhenVisible, useLibraryPreviewData } from "@/components/template-library/previews";
import {
  BLANK_PACK_ID,
  type CardAdjustments,
  type FreeLayer,
  type PackCardData,
} from "@/lib/pack-render";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { elementBounds, elementLayers, type ElementDocumentLike } from "./element-insert";

/** A tile's drawing area, in px. */
const TILE = { w: 128, h: 80 };

/** The card kind element previews draw their sample data from. */
const PREVIEW_KIND = "milestone";

/** What every tile draws with: the club's colours, crest and sample card. */
type ThumbData = { input: ShareCardInput; data: PackCardData };

const layersOfElement = (element: LibraryElement, size: CardSize, now?: number) =>
  elementLayers(element.document as ElementDocumentLike, size, now);

/** One element, drawn on the blank card and zoomed to its layers. */
function ElementThumb({
  element,
  size,
  thumb,
}: {
  element: LibraryElement;
  size: CardSize;
  thumb: ThumbData;
}) {
  const layers = useMemo(() => layersOfElement(element, size, 0), [element, size]);
  const bounds = elementBounds(layers, size);
  const document = useMemo(
    () => ({
      formatVersion: 2,
      pages: { card: { layers } },
      ...(element.document.palettes ? { palettes: element.document.palettes } : {}),
    }),
    [layers, element],
  );
  if (!bounds) return <div className="h-20 rounded-md bg-[#10151B]" aria-hidden />;
  const native = SIZES[size];
  const bw = (Math.max(bounds.w, 1) / 100) * native.w;
  const bh = (Math.max(bounds.h, 1) / 100) * native.h;
  const scale = Math.min((TILE.w * 0.88) / bw, (TILE.h * 0.84) / bh);
  const left = TILE.w / 2 - ((bounds.x / 100) * native.w + bw / 2) * scale;
  const top = TILE.h / 2 - ((bounds.y / 100) * native.h + bh / 2) * scale;
  return (
    <WhenVisible aspect={`${TILE.w} / ${TILE.h}`}>
      <div aria-hidden className="relative h-full w-full overflow-hidden">
        <div className="absolute" style={{ left, top }}>
          <PackCard
            input={thumb.input}
            size={size}
            sponsorsOn
            junior={false}
            data={thumb.data}
            packId={BLANK_PACK_ID}
            adjustments={document as unknown as CardAdjustments}
            width={native.w * scale}
          />
        </div>
      </div>
    </WhenVisible>
  );
}

/** One page of elements; the last page offers the next. */
function ElementPage({
  params,
  size,
  thumb,
  last,
  onMore,
  onAdd,
}: {
  params: ListLibraryElementsParams;
  size: CardSize;
  thumb: ThumbData;
  last: boolean;
  onMore: (cursor: number) => void;
  onAdd: (layers: FreeLayer[]) => void;
}) {
  const q = useListLibraryElements(params, {
    query: { queryKey: getListLibraryElementsQueryKey(params), staleTime: 5 * 60_000 },
  });
  const elements = q.data?.elements ?? [];
  const next = q.data?.nextCursor ?? null;
  if (q.isLoading) {
    return <p className="col-span-2 text-xs text-[var(--ed-ink2)]">Loading elements…</p>;
  }
  if (q.isError) {
    return <p className="col-span-2 text-xs text-[var(--ed-ink2)]">Elements didn't load.</p>;
  }
  return (
    <>
      {elements.map((element) => (
        <button
          key={element.id}
          type="button"
          aria-label={`Add ${element.name}`}
          title={`${element.name} · ${element.look?.name ?? element.authorName}`}
          onClick={() => onAdd(layersOfElement(element, size))}
          className="flex flex-col gap-1.5 rounded-lg bg-[var(--ed-card)] p-1.5 text-left text-[11px] font-semibold text-[var(--ed-ink2)] hover:ring-1 hover:ring-[var(--ed-accent)]"
        >
          <ElementThumb element={element} size={size} thumb={thumb} />
          <span className="truncate">{element.name}</span>
          <span className="-mt-1 truncate text-[10px] font-normal opacity-70">
            {element.look?.name ?? element.authorName}
          </span>
        </button>
      ))}
      {params.cursor === undefined && elements.length === 0 && (
        <p className="col-span-2 text-xs text-[var(--ed-ink2)]">No elements match.</p>
      )}
      {last && next !== null && (
        <button
          type="button"
          onClick={() => onMore(next)}
          className="col-span-2 rounded-lg bg-[var(--ed-card)] py-1.5 text-xs font-semibold text-[var(--ed-ink2)] hover:ring-1 hover:ring-[var(--ed-accent)]"
        >
          More elements
        </button>
      )}
    </>
  );
}

/** Every look's decorations, by look and category, or searched by name and tag. */
export function LibraryElements({
  size,
  onAdd,
}: {
  size: CardSize;
  onAdd: (layers: FreeLayer[]) => void;
}) {
  const looksQ = useListLibraryLooks();
  const preview = useLibraryPreviewData();
  // `dataFor` caches per kind, so the same data comes back until the club's settings change.
  const data = preview.dataFor(PREVIEW_KIND);
  const input = useMemo(() => sampleCardInput(PREVIEW_KIND, preview.clubName), [preview.clubName]);
  const thumb = useMemo<ThumbData>(() => ({ input, data }), [input, data]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [look, setLook] = useState("");
  const [category, setCategory] = useState<LibraryElementCategory | "">("");
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);

  // Search as the admin pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  // A new filter starts from the first page.
  useEffect(() => setCursors([undefined]), [search, look, category]);

  const base: ListLibraryElementsParams = {
    ...(search ? { q: search } : {}),
    ...(look ? { look } : {}),
    ...(category ? { category } : {}),
  };
  const looks = looksQ.data?.looks ?? [];

  return (
    <section aria-label="Element library" className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ed-ink2)]">
        Element library
      </h3>
      <label className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2">
        <Search className="h-3.5 w-3.5 text-[var(--ed-ink2)]" aria-hidden />
        <input
          aria-label="Search the element library"
          placeholder="Search the element library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <select
        aria-label="Look"
        value={look}
        onChange={(e) => setLook(e.target.value)}
        className="mt-2 h-8 w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]"
      >
        <option value="">Every look</option>
        {looks.map((l) => (
          <option key={l.id} value={l.slug}>
            {l.name}
          </option>
        ))}
      </select>
      <div
        className="mt-2 flex flex-wrap gap-1"
        role="group"
        aria-label="Element library categories"
      >
        {[
          { id: "" as const, label: "All" },
          ...ELEMENT_CATEGORIES.map((id) => ({ id, label: ELEMENT_CATEGORY_LABELS[id] })),
        ].map((c) => (
          <button
            key={c.id || "all"}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              category === c.id
                ? "bg-[var(--ed-accent)] text-[var(--ed-on-accent)]"
                : "bg-[var(--ed-card)] text-[var(--ed-ink2)]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {cursors.map((cursor, i) => (
          <ElementPage
            key={cursor ?? "first"}
            params={cursor === undefined ? base : { ...base, cursor }}
            size={size}
            thumb={thumb}
            last={i === cursors.length - 1}
            onMore={(next) => setCursors((c) => [...c, next])}
            onAdd={onAdd}
          />
        ))}
      </div>
    </section>
  );
}
