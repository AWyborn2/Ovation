/**
 * Studio → Templates → Library (ADR-011 T5.1–T5.3): listed templates, filtered
 * by card kind, size and look, 24 a page, drawn in the club's own data. A
 * template opens to its pages at every size it covers. "Customise this
 * template" makes the club's copy and opens it in the editor (the library
 * original never changes); "Use as default" and "Save to my templates" make the
 * copy without leaving. Double-clicking a tile, or its Edit button, customises
 * straight away. Release 2: a club's template credits the club and counts the
 * other clubs using it, and the club that published it can unlist it; clubs
 * filter by style tag, sort, keep favourites and report a template to Ovation.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Pencil, Star } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  createClubTemplate,
  favouriteLibraryTemplate,
  getListClubTemplatesQueryKey,
  getListLibraryLooksQueryKey,
  listLibraryTemplates,
  reportLibraryTemplate,
  unfavouriteLibraryTemplate,
  unlistOwnLibraryTemplate,
  useListLibraryLooks,
  type LibraryTemplate,
  type ListLibraryTemplatesSize,
  type ListLibraryTemplatesSort,
} from "@workspace/api-client-react";
import {
  isSetDocument,
  setPageLabel,
  setTemplateKind,
  SET_TYPE_LABELS,
  TEMPLATE_CARD_KINDS,
  type DataSetType,
  type PageKey,
} from "@workspace/scorecard/kind-templates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, QueryError } from "@/components/data-states";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { kindLabel } from "@/lib/social-studio";
import type { CardSize } from "@/lib/share-card";
import { groupFamilies, lookLabel } from "./look-families";
import { MakeSetDialog } from "./make-set-dialog";
import { TAG_LABELS } from "./style-tags";
import {
  SetPageThumb,
  templateKindLabel,
  TemplateThumb,
  usePreviewInput,
  type LibraryPreview,
} from "./previews";

/** The set templates the library offers (carousel set editor plan). */
const SET_FILTERS: DataSetType[] = ["teamLists", "matchDay", "results", "matchSummary"];

const SIZE_LABELS: Record<CardSize, string> = {
  square: "Square",
  portrait: "Portrait",
  story: "Story",
  landscape: "Landscape",
};

const PAGE_LABELS: Record<string, string> = {
  card: "Card",
  fixture: "Fixture",
  title: "Title page",
  day: "Junior day",
  sponsors: "Sponsors page",
  result: "Result",
  team: "Team",
};

export const pageLabel = (page: string) => PAGE_LABELS[page] ?? page;

const SORT_LABELS: Record<ListLibraryTemplatesSort, string> = {
  popular: "Most used",
  new: "Newest",
  ovation: "Ovation's first",
  club: "Clubs' first",
};

/** The longest report reason (the API's limit). */
const MAX_REPORT = 500;

/** "Used by 3 clubs", or null when no other club has a copy. */
export function usedByLabel(t: Pick<LibraryTemplate, "usedBy">): string | null {
  const n = t.usedBy ?? 0;
  return n > 0 ? `Used by ${n} ${n === 1 ? "club" : "clubs"}` : null;
}
export const sizeLabel = (size: string) => SIZE_LABELS[size as CardSize] ?? size;

type Preview = LibraryPreview;

/**
 * Add or take a template off the club's favourites, refreshing the library.
 * Answers the new state, or null when it failed.
 */
export function useToggleFavourite() {
  const qc = useQueryClient();
  return async (template: Pick<LibraryTemplate, "id">, favourite: boolean) => {
    try {
      if (favourite) await favouriteLibraryTemplate(template.id);
      else await unfavouriteLibraryTemplate(template.id);
      await qc.invalidateQueries({ queryKey: ["template-library"] });
      return favourite;
    } catch {
      return null;
    }
  };
}

/** The star that adds a template to, or takes it off, the club's favourites. */
function FavouriteButton({
  name,
  favourite,
  onToggle,
  className = "",
}: {
  name: string;
  favourite: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      size="icon"
      variant="secondary"
      className={`h-8 w-8 shadow-sm ${className}`}
      aria-label={favourite ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      aria-pressed={favourite}
      onClick={onToggle}
    >
      <Star className={`h-4 w-4 ${favourite ? "fill-current text-amber-500" : ""}`} />
    </Button>
  );
}

/**
 * Make the club's copy of a library template (a `card_templates` row from the
 * library version) and open it in the template editor.
 */
export function useCustomiseTemplate() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const customise = async (template: LibraryTemplate) => {
    setBusyId(template.id);
    setError(null);
    try {
      const copy = await createClubTemplate({
        libraryTemplateId: template.id,
        version: template.version,
        makeDefault: false,
      });
      await qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      navigate(`/admin/social/template/${copy.id}`);
    } catch (e) {
      setError(handleAdminMutationError(e) ?? "Couldn't copy the template. Try again.");
    } finally {
      setBusyId(null);
    }
  };
  return { customise, busyId, error };
}

function TemplateTile({
  template,
  preview,
  onOpen,
  onCustomise,
  onFavourite,
  busy,
}: {
  template: LibraryTemplate;
  preview: Preview;
  onOpen: () => void;
  onCustomise: () => void;
  onFavourite: () => void;
  busy: boolean;
}) {
  const input = usePreviewInput(template.kind, preview.clubName);
  const set = isSetDocument(template.document) ? template.document : null;
  return (
    <li className="group relative rounded-xl border border-border bg-card p-2">
      <button
        type="button"
        className="block w-full text-left"
        onClick={onOpen}
        onDoubleClick={onCustomise}
        aria-label={`Open ${template.name}`}
      >
        {set?.pages[0] ? (
          <SetPageThumb set={set} page={set.pages[0]} preview={preview} />
        ) : (
          <TemplateThumb
            document={template.document}
            kind={template.kind}
            input={input}
            data={preview.dataFor(template.kind)}
          />
        )}
        <p className="mt-2 truncate text-sm font-medium">{template.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {set
            ? `${templateKindLabel(template.kind)} · ${set.pages.length} pages`
            : kindLabel(template.kind)}
          {template.look ? ` · ${lookLabel(template.look)}` : ""} · {template.authorName}
        </p>
        {usedByLabel(template) && (
          <p className="truncate text-xs text-muted-foreground">{usedByLabel(template)}</p>
        )}
      </button>
      {/* Shown on hover or focus where there is a pointer; always on small screens. */}
      <Button
        size="sm"
        variant="secondary"
        className="absolute right-3 top-3 h-8 gap-1 shadow-sm transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
        aria-label={`Edit ${template.name}`}
        disabled={busy}
        onClick={onCustomise}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
      <FavouriteButton
        name={template.name}
        favourite={template.favourite === true}
        onToggle={onFavourite}
        className={`absolute left-3 top-3 transition-opacity ${
          template.favourite
            ? ""
            : "sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
        }`}
      />
    </li>
  );
}

/** A template's pages at every size it covers, and the two ways to use it. */
export function TemplateDetailDialog({
  template,
  preview,
  onClose,
}: {
  template: LibraryTemplate | null;
  preview: Preview;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const input = usePreviewInput(template?.kind ?? "milestone", preview.clubName);
  const custom = useCustomiseTemplate();
  const set = template && isSetDocument(template.document) ? template.document : null;
  const [making, setMaking] = useState(false);
  const toggleFavourite = useToggleFavourite();
  // The dialog holds its own copy of the star, so it answers before the list refreshes.
  const [favourite, setFavourite] = useState<{ id: number; on: boolean } | null>(null);
  const isFavourite = template
    ? favourite?.id === template.id
      ? favourite.on
      : template.favourite === true
    : false;
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");

  const favourited = async () => {
    if (!template) return;
    const on = await toggleFavourite(template, !isFavourite);
    if (on === null) setStatus("Couldn't change your favourites. Try again.");
    else setFavourite({ id: template.id, on });
  };

  // Any club but the author can tell Ovation something is wrong with it.
  const report = async () => {
    if (!template || !reason.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await reportLibraryTemplate(template.id, { reason: reason.trim() });
      setReporting(false);
      setReason("");
      setStatus("Reported. Ovation will take a look.");
    } catch (e) {
      setStatus(handleAdminMutationError(e) ?? "Couldn't send the report. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // The club that published it takes it out of the library; copies keep working.
  const unlist = async () => {
    if (!template) return;
    setBusy(true);
    setStatus(null);
    try {
      await unlistOwnLibraryTemplate(template.id);
      await qc.invalidateQueries({ queryKey: ["template-library"] });
      setStatus("Unlisted. Other clubs no longer see it; publish it again to list it.");
    } catch (e) {
      setStatus(handleAdminMutationError(e) ?? "Couldn't unlist the template. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const use = async (makeDefault: boolean) => {
    if (!template) return;
    setBusy(true);
    setStatus(null);
    try {
      await createClubTemplate({
        libraryTemplateId: template.id,
        version: template.version,
        makeDefault,
      });
      await qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      setStatus(
        makeDefault
          ? `Added to your templates and set as your ${templateKindLabel(template.kind)} default.`
          : "Added to your templates.",
      );
    } catch (e) {
      setStatus(handleAdminMutationError(e) ?? "Couldn't add the template. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={template !== null}
      onOpenChange={(open) => {
        if (!open) {
          setStatus(null);
          setReporting(false);
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {template && (
          <>
            <DialogHeader>
              <DialogTitle>{template.name}</DialogTitle>
              <DialogDescription>
                {templateKindLabel(template.kind)}
                {template.look ? ` · ${lookLabel(template.look)} look` : ""} · by{" "}
                {template.ownedByClub ? "your club" : template.authorName}
                {usedByLabel(template) ? ` · ${usedByLabel(template)}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {set?.pages.map((page, i) => (
                <section key={page.id} aria-label={setPageLabel(page)}>
                  <h3 className="mb-2 text-sm font-semibold">
                    {i + 1}. {setPageLabel(page)}
                    {page.role === "repeat" && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        one slide per {page.slot === "day" ? "junior day" : page.slot}
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {template.coverage.sizes.map((size) => (
                      <figure key={size}>
                        <SetPageThumb
                          set={set}
                          page={page}
                          preview={preview}
                          size={size as CardSize}
                        />
                        <figcaption className="mt-1 text-center text-xs text-muted-foreground">
                          {sizeLabel(size)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              ))}
              {!set &&
                template.coverage.pages.map((page) => (
                  <section key={page} aria-label={pageLabel(page)}>
                    <h3 className="mb-2 text-sm font-semibold">{pageLabel(page)}</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {template.coverage.sizes.map((size) => (
                        <figure key={size}>
                          <TemplateThumb
                            document={template.document}
                            kind={template.kind}
                            input={input}
                            data={preview.dataFor(template.kind)}
                            size={size as CardSize}
                            page={page as PageKey}
                          />
                          <figcaption className="mt-1 text-center text-xs text-muted-foreground">
                            {sizeLabel(size)}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </section>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                disabled={busy || custom.busyId !== null}
                onClick={() => custom.customise(template)}
              >
                Customise this template
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => use(true)}>
                Use as default
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => use(false)}>
                Save to my templates
              </Button>
              {!set && (
                <Button variant="ghost" disabled={busy} onClick={() => setMaking(true)}>
                  Make a carousel set
                </Button>
              )}
              {template.ownedByClub && template.listed && (
                <Button variant="ghost" disabled={busy} onClick={unlist}>
                  Unlist
                </Button>
              )}
              {template.listed && (
                <Button variant="ghost" className="gap-1" onClick={favourited}>
                  <Star className={`h-4 w-4 ${isFavourite ? "fill-current text-amber-500" : ""}`} />
                  {isFavourite ? "Favourite" : "Add to favourites"}
                </Button>
              )}
              {!template.ownedByClub && template.listed && !reporting && (
                <Button variant="ghost" disabled={busy} onClick={() => setReporting(true)}>
                  Report
                </Button>
              )}
              {(custom.error ?? status) && (
                <span role="status" className="text-sm text-muted-foreground">
                  {custom.error ?? status}
                </span>
              )}
            </div>
            {reporting && (
              <form
                className="space-y-2 rounded-lg border border-border p-3"
                aria-label="Report this template"
                onSubmit={(e) => {
                  e.preventDefault();
                  void report();
                }}
              >
                <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="report-reason">
                  What&rsquo;s wrong with it?
                  <textarea
                    id="report-reason"
                    className="min-h-20 rounded-md border border-input bg-background px-2 py-1 text-sm font-normal"
                    maxLength={MAX_REPORT}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Ovation reads every report. The club that made it isn&rsquo;t told who sent it.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy || !reason.trim()}>
                    Send report
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReporting(false);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>
      {template && !set && (
        <MakeSetDialog
          open={making}
          onClose={() => setMaking(false)}
          from={{
            ref: { libraryTemplateId: template.id, version: template.version },
            name: template.name,
          }}
        />
      )}
    </Dialog>
  );
}

export function LibraryBrowser({ preview }: { preview: Preview }) {
  const [kind, setKind] = useState("");
  const [size, setSize] = useState("");
  const [look, setLook] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("");
  const [favourites, setFavourites] = useState(false);
  const [open, setOpen] = useState<LibraryTemplate | null>(null);
  const [favouriteError, setFavouriteError] = useState<string | null>(null);
  const custom = useCustomiseTemplate();
  const toggleFavourite = useToggleFavourite();
  const looksQ = useListLibraryLooks({ query: { queryKey: getListLibraryLooksQueryKey() } });

  const filters = {
    ...(kind ? { kind } : {}),
    ...(size ? { size: size as ListLibraryTemplatesSize } : {}),
    ...(look ? { look } : {}),
    ...(tag ? { tags: tag } : {}),
    ...(sort ? { sort: sort as ListLibraryTemplatesSort } : {}),
    ...(favourites ? { favourites: true } : {}),
  };
  const listQ = useInfiniteQuery({
    queryKey: ["template-library", filters],
    queryFn: ({ pageParam }) =>
      listLibraryTemplates({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const templates = listQ.data?.pages.flatMap((p) => p.templates) ?? [];

  const select = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: Array<[string, string]>,
  ) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor={id}>
      {label}
      <select
        id={id}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      {(custom.error ?? favouriteError) && (
        <p role="alert" className="text-sm text-destructive">
          {custom.error ?? favouriteError}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {select("library-kind", "Card", kind, setKind, [
          ["", "Every card"],
          ...TEMPLATE_CARD_KINDS.map((k) => [k, kindLabel(k)] as [string, string]),
          ...SET_FILTERS.map(
            (t) => [setTemplateKind(t), `Carousel set: ${SET_TYPE_LABELS[t]}`] as [string, string],
          ),
        ])}
        {select("library-size", "Size", size, setSize, [
          ["", "Every size"],
          ...Object.entries(SIZE_LABELS),
        ])}
        {select("library-look", "Look", look, setLook, [
          ["", "Every look"],
          ...groupFamilies(looksQ.data?.looks ?? []).map(
            (l) => [l.slug, lookLabel(l)] as [string, string],
          ),
        ])}
        {select("library-tag", "Style", tag, setTag, [
          ["", "Every style"],
          ...Object.entries(TAG_LABELS),
        ])}
        {select("library-sort", "Sort", sort, setSort, [
          ["", "Library order"],
          ...Object.entries(SORT_LABELS),
        ])}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={favourites}
            onChange={(e) => setFavourites(e.target.checked)}
          />
          Favourites only
        </label>
      </div>

      {listQ.isError ? (
        <QueryError onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading ? (
        <LoadingState label="Loading templates…" />
      ) : templates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {favourites
            ? "No favourites here yet. Star a template to keep it handy."
            : "No templates match. Try another card, size, look or style."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {templates.map((t) => (
            <TemplateTile
              key={t.id}
              template={t}
              preview={preview}
              onOpen={() => setOpen(t)}
              onCustomise={() => custom.customise(t)}
              onFavourite={async () => {
                const on = await toggleFavourite(t, !t.favourite);
                setFavouriteError(
                  on === null ? "Couldn't change your favourites. Try again." : null,
                );
              }}
              busy={custom.busyId === t.id}
            />
          ))}
        </ul>
      )}
      {listQ.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={listQ.isFetchingNextPage}
            onClick={() => listQ.fetchNextPage()}
          >
            {listQ.isFetchingNextPage ? "Loading…" : "More templates"}
          </Button>
        </div>
      )}
      <TemplateDetailDialog template={open} preview={preview} onClose={() => setOpen(null)} />
    </div>
  );
}
