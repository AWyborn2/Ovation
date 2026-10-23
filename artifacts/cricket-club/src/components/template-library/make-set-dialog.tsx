/**
 * "Make a carousel set" (carousel set editor plan, part 4): pick the set
 * type, then (from Studio home) a look, then a size, and the new set opens in
 * the editor. Started from a template (its detail dialog or the editor), the
 * design takes the set's pages it fits and the same look's set gives the
 * rest; a free set is the design and copies of it, with no data, and is never
 * posted automatically.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListClubTemplatesQueryKey,
  getListLibraryTemplatesQueryKey,
  makeCarouselSet,
  useListLibraryTemplates,
  type MakeCarouselSetRequestSetType,
  type TemplateRef,
} from "@workspace/api-client-react";
import {
  isSetDocument,
  setTemplateKind,
  SET_TYPE_LABELS,
  type SetType,
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
import { handleAdminMutationError } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import { SIZES, type CardSize } from "@/lib/share-card";
import { SetPageThumb, useLibraryPreviewData } from "./previews";

/** The set types offered, with what each repeats. */
export const MAKE_SET_TYPES: Array<{ type: SetType; detail: string }> = [
  { type: "teamLists", detail: "A cover, a slide per team, then sponsors" },
  { type: "results", detail: "A cover, a slide per result, then sponsors" },
  { type: "matchDay", detail: "A cover, a slide per fixture, then sponsors" },
  { type: "matchSummary", detail: "A cover, a slide per match summary, then sponsors" },
  { type: "free", detail: "Your own pages, no data: never posted automatically" },
];

const SET_SIZES: CardSize[] = ["square", "portrait", "story"];

/** Where the new set opens: the editor, at the size picked. */
export const setEditorHref = (id: number, size: CardSize) =>
  `/admin/social/template/${id}?size=${size}`;

export function MakeSetDialog({
  open,
  onClose,
  from,
}: {
  open: boolean;
  onClose: () => void;
  /** The template to start from; absent from Studio home (pick a look instead). */
  from?: { ref: TemplateRef; name: string } | null;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [type, setType] = useState<SetType>("teamLists");
  const [lookId, setLookId] = useState<number | null>(null);
  const [size, setSize] = useState<CardSize>("square");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useLibraryPreviewData();
  const pickLook = !from && type !== "free";
  const kind = setTemplateKind(type);
  const looksQ = useListLibraryTemplates(
    { kind },
    {
      query: { queryKey: getListLibraryTemplatesQueryKey({ kind }), enabled: open && pickLook },
    },
  );
  const looks = (looksQ.data?.templates ?? []).filter((t) => t.look);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const look = looks.find((t) => t.look?.id === lookId) ?? looks[0];
      const set = await makeCarouselSet({
        setType: type as MakeCarouselSetRequestSetType,
        ...(from ? { from: from.ref, name: `${from.name} · ${SET_TYPE_LABELS[type]}` } : {}),
        ...(pickLook && look?.look ? { lookId: look.look.id } : {}),
      });
      await qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      onClose();
      navigate(setEditorHref(set.id, size));
    } catch (e) {
      setError(handleAdminMutationError(e) ?? "Couldn't make the set. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    cn(
      "rounded-xl border p-3 text-left text-sm transition-colors",
      on ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
    );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make a carousel set</DialogTitle>
          <DialogDescription>
            {from
              ? `"${from.name}" takes the pages it fits; the rest come from the same look.`
              : "Pick the set, a look and a size, then design every slide in one place."}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Set</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MAKE_SET_TYPES.map((o) => (
              <button
                key={o.type}
                type="button"
                aria-pressed={type === o.type}
                className={chip(type === o.type)}
                onClick={() => setType(o.type)}
              >
                <span className="block font-semibold">{SET_TYPE_LABELS[o.type]}</span>
                <span className="block text-xs text-muted-foreground">{o.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {pickLook && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Look</legend>
            {looksQ.isLoading ? (
              <LoadingState label="Loading looks…" />
            ) : looks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No look has this set yet.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {looks.map((t) => {
                  const set = isSetDocument(t.document) ? t.document : null;
                  const on = (lookId ?? looks[0]?.look?.id) === t.look?.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={t.look!.name}
                        className={cn(chip(on), "w-full p-1.5")}
                        onClick={() => setLookId(t.look!.id)}
                      >
                        {set?.pages[0] && (
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
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Size</legend>
          <div className="flex flex-wrap gap-2">
            {SET_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={size === s}
                className={chip(size === s)}
                onClick={() => setSize(s)}
              >
                {SIZES[s].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Every slide takes this size; you can change it in the editor.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!from && (
          <p className="text-sm text-muted-foreground">
            To post this weekend&apos;s fixtures, teams or results, build the set from your data in{" "}
            <Link href="/admin/social/sets" className="text-primary-text hover:underline">
              Carousel sets
            </Link>
            , then open it from the queue with Edit set to restyle every slide.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={make} disabled={busy || (pickLook && looks.length === 0)}>
            {busy ? "Making…" : "Make the set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
