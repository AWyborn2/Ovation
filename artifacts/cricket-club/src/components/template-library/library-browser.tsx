/**
 * Studio → Templates → Library (ADR-011 T5.1–T5.3): listed templates, filtered
 * by card kind, size and look, 24 a page, drawn in the club's own data. A
 * template opens to its pages at every size it covers, with Use and Use as
 * default.
 */
import { useState } from "react";
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
import { TEMPLATE_CARD_KINDS, type PageKey } from "@workspace/scorecard/kind-templates";
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
import { TemplateThumb, useLibraryPreviewData, usePreviewInput } from "./previews";

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

type Preview = ReturnType<typeof useLibraryPreviewData>;

function TemplateTile({
  template,
  preview,
  onOpen,
}: {
  template: LibraryTemplate;
  preview: Preview;
  onOpen: () => void;
}) {
  const input = usePreviewInput(template.kind, preview.clubName);
  return (
    <li className="rounded-xl border border-border bg-card p-2">
      <button
        type="button"
        className="block w-full text-left"
        onClick={onOpen}
        aria-label={`Open ${template.name}`}
      >
        <TemplateThumb
          document={template.document}
          kind={template.kind}
          input={input}
          data={preview.dataFor(template.kind)}
        />
        <p className="mt-2 truncate text-sm font-medium">{template.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {kindLabel(template.kind)}
          {template.look ? ` · ${template.look.name}` : ""} · {template.authorName}
        </p>
      </button>
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
          ? `Added to your templates and set as your ${kindLabel(template.kind)} default.`
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
                {kindLabel(template.kind)}
                {template.look ? ` · ${template.look.name} look` : ""} · by {template.authorName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {template.coverage.pages.map((page) => (
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
              <Button disabled={busy} onClick={() => use(false)}>
                Use
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => use(true)}>
                Use as default
              </Button>
              {status && (
                <span role="status" className="text-sm text-muted-foreground">
                  {status}
                </span>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LibraryBrowser({ preview }: { preview: Preview }) {
  const [kind, setKind] = useState("");
  const [size, setSize] = useState("");
  const [look, setLook] = useState("");
  const [open, setOpen] = useState<LibraryTemplate | null>(null);
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
      <div className="flex flex-wrap gap-3">
        {select("library-kind", "Card", kind, setKind, [
          ["", "Every card"],
          ...TEMPLATE_CARD_KINDS.map((k) => [k, kindLabel(k)] as [string, string]),
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
            <TemplateTile key={t.id} template={t} preview={preview} onOpen={() => setOpen(t)} />
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
