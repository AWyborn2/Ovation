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
 *
 * It shows in the panel beside the editor's rail (the top bar's Layout, or
 * Edit page), so it never opens over the canvas.
 */
import { MAX_SET_PAGES, setPageLabel } from "@workspace/scorecard/kind-templates";
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

/** Whether the slide on the canvas can take a layout of its own (a data slide on a page of the set). */
export function slideLayoutApplies(
  set: SetShareContext,
  design: NonNullable<EditorActionsContext["setDesign"]>,
  naturalPageId: (key: string) => string | undefined,
): boolean {
  const slide = set.slides.find((s) => s.key === set.current) ?? set.slides[0];
  if (!slide || slide.design) return false;
  const natural = naturalPageId(slide.key) ?? slide.page.id;
  return (design.doc.setDesign?.pages ?? []).some((p) => p.id === natural);
}

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
  // The other slides drawn by the same page as this one, as they draw now: a
  // slide with a layout of its own isn't sharing the set's.
  const others = set.slides.filter(
    (s) => s.key !== slide.key && s.page.id === slide.page.id,
  ).length;
  const full = pages.length >= MAX_SET_PAGES;

  // Each choice puts the slide on the canvas to edit.
  const pick = (id: string) =>
    design.edit((doc) => withSlideLayout(doc, slide.key, id === natural ? null : id), slide.key);

  return (
    <div className="space-y-3" data-testid="slide-layout">
      <div>
        <p className="text-sm font-semibold">Layout for {slide.label}</p>
        <p className="text-xs text-[var(--ed-ink2)]">{layoutNote(own, others)}</p>
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
    </div>
  );
}

/** What the panel says about the layout a slide draws with now. */
export function layoutNote(own: boolean, others: number): string {
  const n = `${others} other ${others === 1 ? "slide" : "slides"}`;
  if (own)
    return others === 0
      ? "This slide has its own layout: edits on the canvas change this slide only."
      : `This slide's layout is shared with ${n}: edits on the canvas change them all.`;
  return others === 0
    ? "This slide uses the set's layout."
    : `This slide shares the set's layout with ${n}: edits change them all.`;
}
