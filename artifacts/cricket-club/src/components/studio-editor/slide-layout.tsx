/**
 * A slide's own layout in the set editor (studio-create-consolidation S9, New
 * Studio only). A data slide draws with its slot's page, shared by every slide
 * of that slot. Here one slide can take a layout of its own (a copy of the
 * page, edited on the canvas like any page, changing that slide alone), go
 * back to the shared one, or hand its layout to every slide of the slot.
 *
 * The layout is stored as `arrangement.pageFor` in the set draft's design.
 * The slide's data never changes, only the page that draws it; clearing the
 * map draws every slide as before.
 */
import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { MAX_SET_PAGES, setPageLabel } from "@workspace/scorecard/kind-templates";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PackCard } from "@/components/pack-card";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { cn } from "@/lib/utils";
import type { EditorActionsContext } from "@/pages/admin-template-editor";
import type { SetShareContext } from "./export/share-panel";
import {
  applyLayoutToAll,
  layoutPages,
  newSlideLayout,
  pageRenderDocument,
  withSlideLayout,
} from "./set-doc";

export function SlideLayoutPanel({
  set,
  design,
  naturalPageId,
}: {
  set: SetShareContext;
  design: NonNullable<EditorActionsContext["setDesign"]>;
  /** The page slide `key` draws with when it has no layout of its own. */
  naturalPageId: (key: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const slide = set.slides.find((s) => s.key === set.current) ?? set.slides[0];
  // A design page is its own layout already: only data slides take one.
  if (!slide || slide.design) return null;
  const natural = naturalPageId(slide.key) ?? slide.page.id;
  const pages = design.doc.setDesign?.pages ?? [];
  const layouts = layoutPages(design.doc);
  const naturalMeta = pages.find((p) => p.id === natural);
  if (!naturalMeta) return null;
  // The shared page, then each layout of the same kind page another slide made.
  const options = pages.filter(
    (p) =>
      p.id === natural ||
      (layouts.has(p.id) && p.kind === naturalMeta.kind && p.page === naturalMeta.page),
  );
  const own = slide.page.id !== natural;
  const sharers = set.slides.filter((s) => (naturalPageId(s.key) ?? s.page.id) === natural).length;
  const full = pages.length >= MAX_SET_PAGES;

  // Each choice puts the slide on the canvas to edit, so the panel closes.
  const pick = (id: string) => {
    design.edit((doc) => withSlideLayout(doc, slide.key, id === natural ? null : id), slide.key);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)]"
        >
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Layout
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="studio-editor w-80 space-y-3">
        <div>
          <p className="text-sm font-semibold">Layout for {slide.label}</p>
          <p className="text-xs text-[var(--ed-ink2)]">
            {own
              ? "This slide has its own layout: edits on the canvas change this slide only."
              : `This slide shares its layout with ${sharers - 1} other ${sharers - 1 === 1 ? "slide" : "slides"}: edits change them all.`}
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-2">
          {options.map((p) => {
            const on = p.id === slide.page.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(p.id)}
                  className={cn(
                    "w-full rounded-lg border p-1 text-left",
                    on ? "border-[var(--ed-accent)]" : "border-[var(--ed-line)]",
                  )}
                >
                  <PackCard
                    input={slide.input}
                    size={set.size}
                    sponsorsOn={slide.sponsorsOn}
                    junior={slide.junior}
                    data={slide.data}
                    packId={BLANK_PACK_ID}
                    adjustments={pageRenderDocument(design.doc, p)}
                    page={p.page}
                    width={76}
                  />
                  <span className="mt-1 block truncate text-[11px] font-semibold">
                    {p.id === natural ? "Shared" : setPageLabel(p)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="space-y-2">
          <button
            type="button"
            disabled={full}
            onClick={() => {
              design.edit(
                (doc) => newSlideLayout(doc, slide.key, slide.page.id, `${slide.label} layout`).doc,
                slide.key,
              );
              setOpen(false);
            }}
            className="flex h-9 w-full items-center justify-center rounded-lg bg-[var(--ed-accent)] text-sm font-semibold text-[var(--ed-on-accent)] disabled:opacity-40"
          >
            New layout for this slide
          </button>
          {full && (
            <p className="text-xs text-[var(--ed-ink2)]">
              The set holds {MAX_SET_PAGES} pages, the most it can. Delete one to add a layout.
            </p>
          )}
          <button
            type="button"
            disabled={!own && options.length === 1}
            onClick={() => {
              design.edit((doc) => applyLayoutToAll(doc, slide.page.id, natural), slide.key);
              setOpen(false);
            }}
            className="flex h-9 w-full items-center justify-center rounded-lg border border-[var(--ed-line)] text-sm font-semibold hover:bg-[var(--ed-card)] disabled:opacity-40"
          >
            Apply to every slide
          </button>
          <p className="text-xs text-[var(--ed-ink2)]">
            Every {setPageLabel(naturalMeta).toLowerCase()} slide takes this slide&rsquo;s layout.
            Undo puts it back.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
