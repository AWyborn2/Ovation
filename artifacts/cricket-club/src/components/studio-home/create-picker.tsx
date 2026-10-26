/**
 * Studio home → Create: pick a size, then a template (the club's default for
 * the kind first), or start blank. Either makes an ad-hoc draft (awaiting
 * review, never auto-posted) and opens it in the Studio editor at that size.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  getGetClubTemplateQueryKey,
  getListClubTemplatesQueryKey,
  getListLibraryTemplatesQueryKey,
  useCreateSocialDraft,
  useGetClubTemplate,
  useListClubTemplates,
  useListLibraryTemplates,
  type CreateSocialDraftRequest,
  type ListLibraryTemplatesSize,
} from "@workspace/api-client-react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/data-states";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { kindLabel } from "@/lib/social-studio";
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import {
  TemplateThumb,
  usePreviewInput,
  type LibraryPreview,
} from "@/components/template-library/previews";

export const CREATE_SIZES: { value: CardSize; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "story", label: "Story" },
  { value: "landscape", label: "Landscape" },
];

/** A blank design's card: an Announcement, the most open-ended kind. */
export const BLANK_DESIGN_KIND = "announcement";

/** Make a draft and open it in the editor at `size`. */
export function useStartDesign() {
  const [, navigate] = useLocation();
  const create = useCreateSocialDraft();
  const [error, setError] = useState<string | null>(null);
  const start = (body: CreateSocialDraftRequest, size: CardSize) => {
    setError(null);
    create.mutate(
      { data: body },
      {
        onSuccess: (draft) => navigate(`/admin/social/editor/${draft.id}?format=${size}`),
        onError: (e) => setError(handleAdminMutationError(e) ?? "Couldn't start the design."),
      },
    );
  };
  return { start, busy: create.isPending, error };
}

const cardInputOf = (input: ShareCardInput) => input as unknown as Record<string, unknown>;

function ClubTemplateOption({
  id,
  name,
  isDefault,
  kind,
  size,
  input,
  preview,
  disabled,
  onPick,
}: {
  id: number;
  name: string;
  isDefault: boolean;
  kind: string;
  size: CardSize;
  input: ShareCardInput;
  preview: LibraryPreview;
  disabled: boolean;
  onPick: () => void;
}) {
  const q = useGetClubTemplate(id, {
    query: { queryKey: getGetClubTemplateQueryKey(id), staleTime: 60_000 },
  });
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        aria-label={`Use ${name}`}
        className="block w-full rounded-xl border border-border bg-card p-2 text-left hover:border-primary disabled:opacity-60"
      >
        {q.data ? (
          <TemplateThumb
            document={q.data.document}
            kind={kind}
            input={input}
            data={preview.dataFor(kind)}
            size={size}
          />
        ) : (
          <div
            className="rounded-md bg-muted"
            style={{ aspectRatio: `${SIZES[size].w} / ${SIZES[size].h}` }}
          />
        )}
        <p className="mt-2 truncate text-sm font-medium">{name}</p>
        {isDefault && <p className="text-xs text-primary-text">Your default</p>}
      </button>
    </li>
  );
}

function TemplateStep({
  kind,
  size,
  preview,
  start,
  busy,
}: {
  kind: string;
  size: CardSize;
  preview: LibraryPreview;
  start: (body: CreateSocialDraftRequest) => void;
  busy: boolean;
}) {
  const input = usePreviewInput(kind, preview.clubName);
  const clubParams = { kind };
  const clubQ = useListClubTemplates(clubParams, {
    query: { queryKey: getListClubTemplatesQueryKey(clubParams) },
  });
  const libParams = { kind, size: size as ListLibraryTemplatesSize };
  const libQ = useListLibraryTemplates(libParams, {
    query: { queryKey: getListLibraryTemplatesQueryKey(libParams), staleTime: 60_000 },
  });
  // The club's own templates that come in this size, its default first.
  const club = (clubQ.data?.templates ?? [])
    .filter((t) => t.coverage.sizes.includes(size))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const library = libQ.data?.templates ?? [];
  const cardInput = cardInputOf(input);

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => start({ cardInput, packId: BLANK_PACK_ID })}
      >
        <Square className="mr-2 h-4 w-4" aria-hidden /> Start blank
      </Button>
      {clubQ.isLoading || libQ.isLoading ? (
        <LoadingState label="Loading templates…" />
      ) : (
        <>
          {club.length > 0 && (
            <section aria-label="Your templates" className="space-y-2">
              <h3 className="text-sm font-semibold">Your templates</h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {club.map((t) => (
                  <ClubTemplateOption
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    isDefault={t.isDefault}
                    kind={kind}
                    size={size}
                    input={input}
                    preview={preview}
                    disabled={busy}
                    onPick={() =>
                      start({ cardInput, templateRef: { copyId: t.id, version: t.version } })
                    }
                  />
                ))}
              </ul>
            </section>
          )}
          {library.length > 0 && (
            <section aria-label="Template library" className="space-y-2">
              <h3 className="text-sm font-semibold">From the library</h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {library.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Use ${t.name}`}
                      onClick={() =>
                        start({
                          cardInput,
                          templateRef: { libraryTemplateId: t.id, version: t.version },
                        })
                      }
                      className="block w-full rounded-xl border border-border bg-card p-2 text-left hover:border-primary disabled:opacity-60"
                    >
                      <TemplateThumb
                        document={t.document}
                        kind={kind}
                        input={input}
                        data={preview.dataFor(kind)}
                        size={size}
                      />
                      <p className="mt-2 truncate text-sm font-medium">{t.name}</p>
                      {t.look && (
                        <p className="truncate text-xs text-muted-foreground">{t.look.name}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {club.length === 0 && library.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No templates come in this size yet. Start blank, or pick another size.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The Create picker. `kind` opens it for a card kind; `blank` opens it for a
 * blank design, which needs only a size.
 */
export function CreatePicker({
  target,
  preview,
  onClose,
}: {
  target: { kind: string } | { blank: true } | null;
  preview: LibraryPreview;
  onClose: () => void;
}) {
  const [size, setSize] = useState<CardSize | null>(null);
  const design = useStartDesign();
  const blankInput = usePreviewInput(BLANK_DESIGN_KIND, preview.clubName);
  const blank = target !== null && "blank" in target;
  const kind = target && "kind" in target ? target.kind : BLANK_DESIGN_KIND;

  const close = () => {
    setSize(null);
    onClose();
  };
  const pickSize = (s: CardSize) => {
    if (blank) {
      design.start({ cardInput: cardInputOf(blankInput), packId: BLANK_PACK_ID }, s);
      return;
    }
    setSize(s);
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{blank ? "Blank design" : `New ${kindLabel(kind)}`}</DialogTitle>
          <DialogDescription>
            {size === null
              ? "Choose a size."
              : "Choose a template, or start blank. It opens in the editor."}
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-2">
          {CREATE_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={size === s.value}
              disabled={design.busy}
              onClick={() => pickSize(s.value)}
              className={cn(
                "flex w-24 flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium",
                size === s.value ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <span
                aria-hidden
                className="block w-10 rounded-sm bg-primary/20"
                style={{ aspectRatio: `${SIZES[s.value].w} / ${SIZES[s.value].h}` }}
              />
              {s.label}
            </button>
          ))}
        </div>
        {size !== null && !blank && (
          <TemplateStep
            kind={kind}
            size={size}
            preview={preview}
            busy={design.busy}
            start={(body) => design.start(body, size)}
          />
        )}
        {design.error && (
          <p role="alert" className="text-sm text-destructive">
            {design.error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
