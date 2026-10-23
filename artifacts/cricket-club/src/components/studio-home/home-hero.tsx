/**
 * Studio home hero: "What will you design today?" with one search across card
 * types, library templates, library elements and the club's own designs, its
 * results grouped by type.
 */
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  getListLibraryElementsQueryKey,
  getListLibraryTemplatesQueryKey,
  useListLibraryElements,
  useListLibraryTemplates,
  type LibraryElement,
  type LibraryTemplate,
} from "@workspace/api-client-react";
import { useHeroImage } from "@/lib/use-hero-image";
import { kindLabel, matchCardKinds, type CardKind } from "@/lib/social-studio";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { TemplateDetailDialog } from "@/components/template-library/library-browser";
import { usePreviewInput, type LibraryPreview } from "@/components/template-library/previews";
import { elementLayers, type ElementDocumentLike } from "@/components/studio-editor/element-insert";
import { DesignGrid, useRecentDesigns } from "./recent-designs";
import { BLANK_DESIGN_KIND, useStartDesign } from "./create-picker";

/** The search box waits this long after the last key before it asks the server. */
const DEBOUNCE_MS = 250;

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return debounced;
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SearchResults({
  query,
  preview,
  onPickKind,
}: {
  query: string;
  preview: LibraryPreview;
  onPickKind: (kind: CardKind) => void;
}) {
  const q = query.trim().slice(0, 60);
  const kinds = matchCardKinds(q).slice(0, 6);
  const params = { q };
  const templatesQ = useListLibraryTemplates(params, {
    query: { queryKey: getListLibraryTemplatesQueryKey(params), enabled: q.length > 1 },
  });
  const elementsQ = useListLibraryElements(params, {
    query: { queryKey: getListLibraryElementsQueryKey(params), enabled: q.length > 1 },
  });
  const recent = useRecentDesigns();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const mine = recent.items
    .filter((d) => {
      const text =
        `${d.type === "draft" ? "" : d.name} ${d.type === "set" ? "carousel set" : kindLabel(d.kind)}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .slice(0, 6);
  const templates = (templatesQ.data?.templates ?? []).slice(0, 8);
  const elements = (elementsQ.data?.elements ?? []).slice(0, 8);
  const [open, setOpen] = useState<LibraryTemplate | null>(null);
  const design = useStartDesign();
  const blankInput = usePreviewInput(BLANK_DESIGN_KIND, preview.clubName);

  const startWithElement = (element: LibraryElement) =>
    design.start(
      {
        cardInput: blankInput as unknown as Record<string, unknown>,
        packId: BLANK_PACK_ID,
        adjustments: {
          layers: elementLayers(element.document as ElementDocumentLike, "square"),
        },
      },
      "square",
    );

  const loading = templatesQ.isFetching || elementsQ.isFetching;
  const nothing =
    !loading &&
    kinds.length === 0 &&
    templates.length === 0 &&
    elements.length === 0 &&
    mine.length === 0;

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-4" aria-live="polite">
      {kinds.length > 0 && (
        <ResultGroup title="Card types">
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onPickKind(k)}
                className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:border-primary"
              >
                {kindLabel(k)}
              </button>
            ))}
          </div>
        </ResultGroup>
      )}
      {templates.length > 0 && (
        <ResultGroup title="Templates">
          <ul className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpen(t)}
                  className="rounded-lg border border-border px-3 py-1.5 text-left text-sm hover:border-primary"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {kindLabel(t.kind)}
                    {t.look ? ` · ${t.look.name}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ResultGroup>
      )}
      {elements.length > 0 && (
        <ResultGroup title="Elements">
          <ul className="flex flex-wrap gap-2">
            {elements.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={design.busy}
                  onClick={() => startWithElement(e)}
                  aria-label={`Start a design with ${e.name}`}
                  className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm hover:border-primary"
                >
                  {e.thumbnailUrl && (
                    <img src={e.thumbnailUrl} alt="" className="h-8 w-8 rounded object-contain" />
                  )}
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
          {design.error && (
            <p role="alert" className="text-sm text-destructive">
              {design.error}
            </p>
          )}
        </ResultGroup>
      )}
      {mine.length > 0 && (
        <ResultGroup title="Your designs">
          <DesignGrid designs={mine} preview={preview} />
        </ResultGroup>
      )}
      {loading && <p className="text-sm text-muted-foreground">Searching…</p>}
      {nothing && (
        <p className="text-sm text-muted-foreground">
          Nothing matches &ldquo;{q}&rdquo;. Try a card type, like &ldquo;milestone&rdquo;.
        </p>
      )}
      <TemplateDetailDialog template={open} preview={preview} onClose={() => setOpen(null)} />
    </div>
  );
}

export function HomeHero({
  preview,
  onPickKind,
}: {
  preview: LibraryPreview;
  onPickKind: (kind: CardKind) => void;
}) {
  const image = useHeroImage("home");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const searching = useMemo(() => debounced.trim().length > 0, [debounced]);

  return (
    <div className="space-y-3">
      <section
        className="relative overflow-hidden rounded-2xl border border-border"
        style={{
          background: image
            ? `center 40% / cover no-repeat url("${image}")`
            : "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.35) 100%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
        <div className="relative space-y-4 px-5 py-8 sm:px-8 sm:py-12">
          <h2 className="font-serif text-[clamp(30px,4vw,46px)] font-bold uppercase leading-[.95] text-white">
            What will you design today?
          </h2>
          <form
            role="search"
            className="max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              const first = matchCardKinds(query)[0];
              if (first) onPickKind(first);
            }}
          >
            <label className="flex h-12 items-center gap-2 rounded-full bg-background/95 px-4 text-foreground shadow-lg">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Search templates, elements and your designs</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={60}
                placeholder="Search templates, elements and your designs"
                className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
          </form>
        </div>
      </section>
      {searching && <SearchResults query={debounced} preview={preview} onPickKind={onPickKind} />}
    </div>
  );
}
