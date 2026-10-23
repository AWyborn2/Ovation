/**
 * Studio home → Templates for you: a strip from the library, the club's
 * adopted look first (the look most of its templates are based on), then the
 * others. A tile opens the template's detail, where it can be customised.
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  getListClubTemplatesQueryKey,
  getListLibraryTemplatesQueryKey,
  useListClubTemplates,
  useListLibraryTemplates,
  type LibraryTemplate,
} from "@workspace/api-client-react";
import { LoadingState } from "@/components/data-states";
import { TemplateDetailDialog } from "@/components/template-library/library-browser";
import {
  TemplateThumb,
  usePreviewInput,
  type LibraryPreview,
} from "@/components/template-library/previews";
import { kindLabel } from "@/lib/social-studio";

/** The look the club has adopted: the one most of its templates come from. */
export function adoptedLookId(
  library: LibraryTemplate[],
  basedOn: (number | undefined)[],
): number | null {
  const lookOf = new Map(library.map((t) => [t.id, t.look?.id ?? null]));
  const counts = new Map<number, number>();
  for (const id of basedOn) {
    const look = id === undefined ? null : lookOf.get(id);
    if (look != null) counts.set(look, (counts.get(look) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [look, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = look;
  return best;
}

function StripTile({
  template,
  preview,
  onOpen,
}: {
  template: LibraryTemplate;
  preview: LibraryPreview;
  onOpen: () => void;
}) {
  const input = usePreviewInput(template.kind, preview.clubName);
  return (
    <li className="w-36 shrink-0 sm:w-44">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${template.name}`}
        className="block w-full rounded-xl border border-border bg-card p-2 text-left hover:border-primary"
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
          {template.look ? ` · ${template.look.name}` : ""}
        </p>
      </button>
    </li>
  );
}

export function TemplatesStrip({ preview }: { preview: LibraryPreview }) {
  const libQ = useListLibraryTemplates(undefined, {
    query: { queryKey: getListLibraryTemplatesQueryKey(), staleTime: 60_000 },
  });
  const clubQ = useListClubTemplates(undefined, {
    query: { queryKey: getListClubTemplatesQueryKey() },
  });
  const [open, setOpen] = useState<LibraryTemplate | null>(null);
  const library = libQ.data?.templates ?? [];
  const adopted = adoptedLookId(
    library,
    (clubQ.data?.templates ?? []).map((t) => t.basedOn?.templateId),
  );
  // Stable sort: the adopted look's templates first, library order otherwise.
  const ordered = [...library].sort(
    (a, b) => Number(b.look?.id === adopted) - Number(a.look?.id === adopted),
  );

  return (
    <section aria-labelledby="templates-for-you-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="templates-for-you-heading" className="text-lg font-semibold">
          Templates for you
        </h2>
        <Link
          href="/admin/social/template-library"
          className="text-sm text-primary-text hover:underline"
        >
          See all
        </Link>
      </div>
      {libQ.isLoading ? (
        <LoadingState label="Loading templates…" />
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates in the library yet.</p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {ordered.slice(0, 12).map((t) => (
            <StripTile key={t.id} template={t} preview={preview} onOpen={() => setOpen(t)} />
          ))}
        </ul>
      )}
      <TemplateDetailDialog template={open} preview={preview} onClose={() => setOpen(null)} />
    </section>
  );
}
