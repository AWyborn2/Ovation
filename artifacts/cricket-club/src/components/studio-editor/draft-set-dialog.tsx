/**
 * "Make a carousel set" on a draft's design (full draft editor plan, D9): the
 * card's design is the set's main page, and the look's set offers its other
 * pages (its cover, its version of this card, its sponsors page) to tick, as
 * the template library's "Make a carousel set" starts from a look. Every page
 * draws this card's data; a card no set draws offers the design and a copy.
 */
import { useEffect, useMemo, useState } from "react";
import {
  getGetClubTemplateQueryKey,
  getGetLibraryTemplateQueryKey,
  getListLibraryTemplatesQueryKey,
  useGetClubTemplate,
  useGetLibraryTemplate,
  useListLibraryTemplates,
  type TemplateRef,
} from "@workspace/api-client-react";
import {
  freeSetFromLook,
  isRepeatSlot,
  isSetDocument,
  lookPagesForCard,
  setPageLabel,
  setTemplateKind,
  setTypeForKind,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/data-states";
import { SetPageThumb, useLibraryPreviewData } from "@/components/template-library/previews";
import { cn } from "@/lib/utils";

export function DraftSetDialog({
  open,
  onClose,
  kind,
  document,
  templateRef,
  busy,
  onMake,
}: {
  open: boolean;
  onClose: () => void;
  /** The draft's card kind. */
  kind: string;
  /** The draft's design as it stands in the editor. */
  document: Record<string, unknown>;
  /** The template the draft's design came from: its look is offered first. */
  templateRef?: TemplateRef | null;
  busy: boolean;
  onMake: (set: SetDocument) => void;
}) {
  const type = setTypeForKind(kind);
  const setKind = type ? setTemplateKind(type) : "";
  const preview = useLibraryPreviewData();
  const looksQ = useListLibraryTemplates(
    { kind: setKind },
    {
      query: {
        queryKey: getListLibraryTemplatesQueryKey({ kind: setKind }),
        enabled: open && !!type,
      },
    },
  );
  const copyId = templateRef?.copyId ?? 0;
  const copyQ = useGetClubTemplate(copyId, {
    query: { queryKey: getGetClubTemplateQueryKey(copyId), enabled: open && copyId > 0 },
  });
  // A design started straight from the library names the library template.
  const libraryId = templateRef?.libraryTemplateId ?? 0;
  const libraryQ = useGetLibraryTemplate(libraryId, {
    query: { queryKey: getGetLibraryTemplateQueryKey(libraryId), enabled: open && libraryId > 0 },
  });
  const looks = (looksQ.data?.templates ?? []).filter((t) => t.look && isSetDocument(t.document));
  const draftLook = copyQ.data?.basedOn?.look?.id ?? libraryQ.data?.look?.id ?? null;
  const [lookId, setLookId] = useState<number | null>(null);
  const look = looks.find((t) => t.look?.id === (lookId ?? draftLook)) ?? looks[0] ?? null;
  const base = look && isSetDocument(look.document) ? look.document : null;
  const offered = useMemo(() => (base ? lookPagesForCard(base) : []), [base]);

  // The look's cover and sponsors page start ticked: its version of this card
  // is there to swap in, so it starts unticked.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setPicked(new Set(offered.filter((p) => !isRepeatSlot(p.slot)).map((p) => p.id)));
  }, [offered]);
  const [copy, setCopy] = useState(!type);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const make = () => {
    const set = freeSetFromLook(kind, document, base, [...picked], copy);
    if (set) onMake(set);
  };

  const chip = (on: boolean) =>
    cn(
      "rounded-xl border p-1.5 text-left text-sm transition-colors",
      on ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
    );
  const pageCount = 1 + (copy ? 1 : 0) + offered.filter((p) => picked.has(p.id)).length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make a carousel set</DialogTitle>
          <DialogDescription>
            Your design is the main page. Pick the pages to go with it: every page shows this card,
            and you can add, duplicate, reorder and delete pages after.
          </DialogDescription>
        </DialogHeader>
        {type && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Look</legend>
              {looksQ.isLoading ? (
                <LoadingState label="Loading looks…" />
              ) : looks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No look has pages for this card yet.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {looks.map((t) => {
                    const set = t.document as SetDocument;
                    const on = look?.id === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={t.look!.name}
                          className={cn(chip(on), "w-full")}
                          onClick={() => setLookId(t.look!.id)}
                        >
                          {set.pages[0] && (
                            <SetPageThumb set={set} page={set.pages[0]} preview={preview} />
                          )}
                          <span className="mt-1 block truncate text-xs font-semibold">
                            {t.look!.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
            {base && offered.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Pages from {look!.look!.name}</legend>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {offered.map((p) => {
                    const on = picked.has(p.id);
                    const label = isRepeatSlot(p.slot)
                      ? `The look's ${setPageLabel(p).toLowerCase()} page`
                      : setPageLabel(p);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={label}
                          className={cn(chip(on), "w-full")}
                          onClick={() => toggle(p.id)}
                        >
                          <SetPageThumb set={base} page={p} preview={preview} />
                          <span className="mt-1 block truncate text-xs font-semibold">{label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Add a copy of your design
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={make} disabled={busy || pageCount < 2 || (!!type && looksQ.isLoading)}>
            {busy ? "Making…" : `Make a ${pageCount}-page set`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
