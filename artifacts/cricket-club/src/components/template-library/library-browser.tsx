/**
 * Studio → Templates → Library (ADR-011 T5.1–T5.3): listed templates, filtered
 * by card kind, size and look, 24 a page, drawn in the club's own data. A
 * template opens to its pages at every size it covers. "Customise this
 * template" makes the club's copy and opens it in the editor (the library
 * original never changes); "Use as default" and "Save to my templates" make the
 * copy without leaving. Double-clicking a tile, or its Edit button, customises
 * straight away.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Pencil } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  createClubTemplate,
  getListClubTemplatesQueryKey,
  getListLibraryLooksQueryKey,
  listLibraryTemplates,
  useListLibraryLooks,
  type LibraryTemplate,
  type ListLibraryTemplatesSize,
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
import { MakeSetDialog } from "./make-set-dialog";
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
export const sizeLabel = (size: string) => SIZE_LABELS[size as CardSize] ?? size;

type Preview = LibraryPreview;

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
  busy,
}: {
  template: LibraryTemplate;
  preview: Preview;
  onOpen: () => void;
  onCustomise: () => void;
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
          {template.look ? ` · ${template.look.name}` : ""} · {template.authorName}
        </p>
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
                {template.look ? ` · ${template.look.name} look` : ""} · by {template.authorName}
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
              {(custom.error ?? status) && (
                <span role="status" className="text-sm text-muted-foreground">
                  {custom.error ?? status}
                </span>
              )}
            </div>
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
  const [open, setOpen] = useState<LibraryTemplate | null>(null);
  const custom = useCustomiseTemplate();
  const looksQ = useListLibraryLooks({ query: { queryKey: getListLibraryLooksQueryKey() } });

  const filters = {
    ...(kind ? { kind } : {}),
    ...(size ? { size: size as ListLibraryTemplatesSize } : {}),
    ...(look ? { look } : {}),
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
      {custom.error && (
        <p role="alert" className="text-sm text-destructive">
          {custom.error}
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
          ...(looksQ.data?.looks ?? []).map((l) => [l.slug, l.name] as [string, string]),
        ])}
      </div>

      {listQ.isError ? (
        <QueryError onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading ? (
        <LoadingState label="Loading templates…" />
      ) : templates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No templates match. Try another card, size or look.
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
