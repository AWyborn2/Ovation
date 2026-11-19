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
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import type { PackCardData } from "@/lib/pack-render";
import { TemplateThumb } from "./previews";

export type PickedTemplate = { ref: TemplateRef; document: unknown; name: string };

export const sameRef = (a: TemplateRef | null | undefined, b: TemplateRef | null | undefined) =>
  !!a &&
  !!b &&
  a.version === b.version &&
  (a.copyId ?? null) === (b.copyId ?? null) &&
  (a.libraryTemplateId ?? null) === (b.libraryTemplateId ?? null);

/** A look's note when it doesn't come in the size being made ("No Story size"). */
export const noSizeNote = (size: CardSize) => `No ${SIZES_NAME[size]} size`;

const SIZES_NAME: Record<CardSize, string> = {
  square: "Square",
  portrait: "Portrait",
  story: "Story",
  landscape: "Landscape",
};

/** Whether a template's coverage has `size` (any size when none is asked for). */
export const coversSize = (coverage: { sizes: readonly string[] } | undefined, size?: CardSize) =>
  !size || !coverage || coverage.sizes.includes(size);

function Tile({
  name,
  note,
  selected,
  onSelect,
  disabled = false,
  children,
}: {
  name: string;
  note?: string;
  selected: boolean;
  onSelect: () => void;
  /** A look that can't be picked (it lacks the size being made). */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={note ? `${name} (${note})` : name}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "w-24 shrink-0 rounded-lg border p-1 text-left disabled:cursor-not-allowed disabled:opacity-50",
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
  junior,
  size,
}: {
  copy: ClubTemplateSummary;
  value: PickedTemplate | null;
  onChange: (picked: PickedTemplate) => void;
  input: ShareCardInput;
  data: PackCardData;
  preselect: boolean;
  junior: boolean;
  size?: CardSize;
}) {
  const fits = coversSize(copy.coverage, size);
  const q = useGetClubTemplate(copy.id, {
    query: { queryKey: getGetClubTemplateQueryKey(copy.id), staleTime: 60_000 },
  });
  const ref = { copyId: copy.id, version: copy.version };
  const pick = () => q.data && onChange({ ref, document: q.data.document, name: copy.name });
  // The default is picked as soon as its document is in, when it comes in the size.
  useEffect(() => {
    if (preselect && fits && q.data) onChange({ ref, document: q.data.document, name: copy.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect, fits, q.data]);
  return (
    <Tile
      name={copy.name}
      note={!fits && size ? noSizeNote(size) : copy.isDefault ? "Default" : undefined}
      selected={sameRef(value?.ref, ref)}
      onSelect={pick}
      disabled={!fits}
    >
      {q.data ? (
        <TemplateThumb
          document={q.data.document}
          kind={copy.kind}
          input={input}
          data={data}
          junior={junior}
        />
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
  junior = false,
  size,
  onUnpick,
}: {
  kind: string;
  value: PickedTemplate | null;
  onChange: (picked: PickedTemplate) => void;
  /** The card the tiles draw (the post being made). */
  input: ShareCardInput;
  data: PackCardData;
  /** Junior tiles: drawn as junior cards with no photo (juniors isolation). */
  junior?: boolean;
  /**
   * The size being made (round 9 B13): a look without it shows "No Story size"
   * and can't be picked, and a pick without it is dropped (`onUnpick`), never
   * swapped for another look.
   */
  size?: CardSize;
  onUnpick?: () => void;
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
  // A pick that doesn't come in the size now asked for is dropped.
  const pickedCoverage = value
    ? (copies.find((c) => sameRef(value.ref, { copyId: c.id, version: c.version }))?.coverage ??
      library.find((t) => sameRef(value.ref, { libraryTemplateId: t.id, version: t.version }))
        ?.coverage)
    : undefined;
  const pickedFits = coversSize(pickedCoverage, size);
  useEffect(() => {
    if (value && !pickedFits) onUnpick?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pickedFits]);

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
            junior={junior}
            size={size}
          />
        ))}
        {library.map((t) => {
          const ref = { libraryTemplateId: t.id, version: t.version };
          const fits = coversSize(t.coverage, size);
          return (
            <Tile
              key={`lib-${t.id}`}
              name={t.name}
              note={!fits && size ? noSizeNote(size) : (t.look?.name ?? t.authorName)}
              selected={sameRef(value?.ref, ref)}
              onSelect={() => onChange({ ref, document: t.document, name: t.name })}
              disabled={!fits}
            >
              <TemplateThumb
                document={t.document}
                kind={t.kind}
                input={input}
                data={data}
                junior={junior}
              />
            </Tile>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {value
          ? `Drawn with ${value.name}.`
          : size
            ? `Pick a design that comes in ${SIZES_NAME[size]} (${SIZES[size].code}).`
            : "Pick a design."}{" "}
        Your default for this card doesn&apos;t change.
      </p>
    </div>
  );
}
