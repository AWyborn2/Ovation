/**
 * Pick the template one post is drawn with (ADR-011 T5.15): the club's own
 * templates for the kind, then the library's. The kind's default is
 * preselected. Picking one never changes the default.
 */
import { useEffect } from "react";
import {
  getGetClubTemplateQueryKey,
  getListClubTemplatesQueryKey,
  getListLibraryTemplatesQueryKey,
  useGetClubTemplate,
  useListClubTemplates,
  useListLibraryTemplates,
  type ClubTemplateSummary,
  type LibraryTemplate,
  type TemplateRef,
} from "@workspace/api-client-react";
import { templateKindFor } from "@workspace/scorecard/kind-templates";
import { cn } from "@/lib/utils";
import type { ShareCardInput } from "@/lib/share-card";
import type { PackCardData } from "@/lib/pack-render";
import { TemplateThumb } from "./previews";

export type PickedTemplate = { ref: TemplateRef; document: unknown; name: string };

export const sameRef = (a: TemplateRef | null | undefined, b: TemplateRef | null | undefined) =>
  !!a &&
  !!b &&
  a.version === b.version &&
  (a.copyId ?? null) === (b.copyId ?? null) &&
  (a.libraryTemplateId ?? null) === (b.libraryTemplateId ?? null);

function Tile({
  name,
  note,
  selected,
  onSelect,
  children,
}: {
  name: string;
  note?: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={note ? `${name} (${note})` : name}
      onClick={onSelect}
      className={cn(
        "w-24 shrink-0 rounded-lg border p-1 text-left",
        selected ? "border-primary ring-2 ring-primary" : "border-border",
      )}
    >
      {children}
      <span className="mt-1 block truncate text-[11px] font-medium">{name}</span>
      {note && <span className="block truncate text-[10px] text-muted-foreground">{note}</span>}
    </button>
  );
}

function CopyTile({
  copy,
  value,
  onChange,
  input,
  data,
  preselect,
}: {
  copy: ClubTemplateSummary;
  value: PickedTemplate | null;
  onChange: (picked: PickedTemplate) => void;
  input: ShareCardInput;
  data: PackCardData;
  preselect: boolean;
}) {
  const q = useGetClubTemplate(copy.id, {
    query: { queryKey: getGetClubTemplateQueryKey(copy.id), staleTime: 60_000 },
  });
  const ref = { copyId: copy.id, version: copy.version };
  const pick = () => q.data && onChange({ ref, document: q.data.document, name: copy.name });
  // The default is picked as soon as its document is in.
  useEffect(() => {
    if (preselect && q.data) onChange({ ref, document: q.data.document, name: copy.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect, q.data]);
  return (
    <Tile
      name={copy.name}
      note={copy.isDefault ? "Default" : undefined}
      selected={sameRef(value?.ref, ref)}
      onSelect={pick}
    >
      {q.data ? (
        <TemplateThumb document={q.data.document} kind={copy.kind} input={input} data={data} />
      ) : (
        <div className="aspect-square rounded-md bg-muted" />
      )}
    </Tile>
  );
}

export function TemplatePicker({
  kind,
  value,
  onChange,
  input,
  data,
}: {
  kind: string;
  value: PickedTemplate | null;
  onChange: (picked: PickedTemplate) => void;
  /** The card the tiles draw (the post being made). */
  input: ShareCardInput;
  data: PackCardData;
}) {
  const templateKind = templateKindFor(kind);
  const copiesParams = { kind: templateKind };
  const copiesQ = useListClubTemplates(copiesParams, {
    query: { queryKey: getListClubTemplatesQueryKey(copiesParams) },
  });
  const libraryParams = { kind: templateKind };
  const libraryQ = useListLibraryTemplates(libraryParams, {
    query: { queryKey: getListLibraryTemplatesQueryKey(libraryParams) },
  });
  const copies = copiesQ.data?.templates ?? [];
  const library = (libraryQ.data?.templates ?? []) as LibraryTemplate[];
  const hasValue = value !== null;

  if (copies.length === 0 && library.length === 0) return null;
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Template" className="flex gap-2 overflow-x-auto pb-1">
        {copies.map((c) => (
          <CopyTile
            key={`copy-${c.id}`}
            copy={c}
            value={value}
            onChange={onChange}
            input={input}
            data={data}
            preselect={c.isDefault && !hasValue}
          />
        ))}
        {library.map((t) => {
          const ref = { libraryTemplateId: t.id, version: t.version };
          return (
            <Tile
              key={`lib-${t.id}`}
              name={t.name}
              note={t.look?.name ?? t.authorName}
              selected={sameRef(value?.ref, ref)}
              onSelect={() => onChange({ ref, document: t.document, name: t.name })}
            >
              <TemplateThumb document={t.document} kind={t.kind} input={input} data={data} />
            </Tile>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {value ? `Drawn with ${value.name}.` : "Pick a design."} Your default for this card
        doesn&apos;t change.
      </p>
    </div>
  );
}
