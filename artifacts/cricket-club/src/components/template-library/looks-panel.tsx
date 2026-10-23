/**
 * Studio → Templates → Looks (ADR-011 T5.4): each look's kinds side by side,
 * and Adopt look, which makes the look's templates the club's defaults for the
 * kinds it covers. The confirmation names the defaults that change; kinds the
 * look doesn't cover keep theirs.
 */
import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  adoptLibraryLook,
  getListClubTemplatesQueryKey,
  getListLibraryLooksQueryKey,
  getListLibraryTemplatesQueryKey,
  useListClubTemplates,
  useListLibraryLooks,
  useListLibraryTemplates,
  type ClubTemplateSummary,
  type LibraryLook,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/broadcast";
import {
  LookPackControls,
  PACK_PREVIEW_FORMATS,
  useDesignPacks,
} from "@/components/social-studio/design-packs-section";
import { type CardSize } from "@/lib/share-card";
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { kindLabel } from "@/lib/social-studio";
import { groupFamilies } from "./look-families";
import { TemplateThumb, usePreviewInput, type LibraryPreview } from "./previews";

type Preview = LibraryPreview;

/** The kinds whose default adopting `look` would change, given the club's templates. */
export function defaultsAdoptionChanges(
  look: LibraryLook,
  clubTemplates: ClubTemplateSummary[],
): string[] {
  return look.templates
    .filter((t) => {
      const current = clubTemplates.find((c) => c.kind === t.kind && c.isDefault);
      return !(
        current &&
        !current.edited &&
        current.basedOn?.templateId === t.id &&
        current.basedOn.version === t.version
      );
    })
    .map((t) => t.kind);
}

function KindThumb({ look, kind, preview }: { look: string; kind: string; preview: Preview }) {
  const params = { look, kind };
  const q = useListLibraryTemplates(params, {
    query: { queryKey: getListLibraryTemplatesQueryKey(params), staleTime: 60_000 },
  });
  const input = usePreviewInput(kind, preview.clubName);
  const template = q.data?.templates[0];
  return (
    <figure className="w-28 shrink-0">
      {template ? (
        <TemplateThumb
          document={template.document}
          kind={kind}
          input={input}
          data={preview.dataFor(kind)}
        />
      ) : (
        <div className="aspect-square rounded-md bg-muted" />
      )}
      <figcaption className="mt-1 truncate text-center text-xs text-muted-foreground">
        {kindLabel(kind)}
      </figcaption>
    </figure>
  );
}

export function LooksPanel({ preview }: { preview: Preview }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const looksQ = useListLibraryLooks({ query: { queryKey: getListLibraryLooksQueryKey() } });
  const clubQ = useListClubTemplates(undefined, {
    query: { queryKey: getListClubTemplatesQueryKey() },
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const packs = useDesignPacks(preview.clubName);
  const [format, setFormat] = useState<CardSize>("square");

  const adopt = async (look: LibraryLook) => {
    const changes = defaultsAdoptionChanges(look, clubQ.data?.templates ?? []);
    if (changes.length === 0) {
      setStatus(`${look.name} is already your look for every card it designs.`);
      return;
    }
    const ok = await confirm({
      title: `Adopt the ${look.name} look?`,
      description: (
        <>
          <span className="block">
            New cards of these kinds will use {look.name}:{" "}
            {changes.map((k) => kindLabel(k)).join(", ")}.
          </span>
          <span className="mt-2 block">
            Other card kinds keep their current design. Cards already waiting keep theirs until you
            apply the new design to them.
          </span>
        </>
      ),
      confirmText: "Adopt look",
    });
    if (!ok) return;
    setBusy(look.id);
    setStatus(null);
    try {
      const result = await adoptLibraryLook(look.id);
      await qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      setStatus(
        `${look.name} adopted: ${result.changed.length} ${result.changed.length === 1 ? "default" : "defaults"} changed.`,
      );
    } catch (e) {
      setStatus(handleAdminMutationError(e) ?? "Couldn't adopt the look. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (looksQ.isError) return <QueryError onRetry={() => looksQ.refetch()} />;
  if (looksQ.isLoading) return <LoadingState label="Loading looks…" />;
  const looks = looksQ.data?.looks ?? [];
  if (looks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No looks in the library yet.
      </p>
    );
  }
  const packFor = (look: LibraryLook) => packs.packForLook(look.slug);
  // A pack whose look isn't listed keeps its controls, below the looks.
  const otherPacks = packs.selection.availablePacks.filter(
    (p) => !looks.some((l) => packFor(l)?.packId === p.packId),
  );
  const hasPacks = looks.some((l) => packFor(l)) || otherPacks.length > 0;
  const packData = preview.dataFor("matchSummary");
  return (
    <div className="space-y-4">
      {packs.error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {packs.error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      {hasPacks && (
        <div className="flex justify-end">
          <SegmentedControl
            label="Preview format"
            options={PACK_PREVIEW_FORMATS}
            value={format}
            onChange={(v) => setFormat(v as CardSize)}
          />
        </div>
      )}
      <ul className="space-y-3">
        {groupFamilies(looks).map((look, i, all) => {
          const pack = packFor(look);
          // A design system's looks sit together under its name (M3).
          const familyStart = !!look.family && all[i - 1]?.family !== look.family;
          return (
            <Fragment key={look.id}>
              {familyStart && (
                <li className="pt-2">
                  <h3 className="text-sm font-semibold">{look.family}</h3>
                  <p className="text-xs text-muted-foreground">
                    {all.filter((l) => l.family === look.family).length} styles from one design
                    system
                  </p>
                </li>
              )}
              <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-3 sm:flex-row">
                {pack && (
                  <div className="w-full shrink-0 sm:w-56">
                    <LookPackControls packs={packs} pack={pack} format={format} data={packData} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{look.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {look.templates.length} {look.templates.length === 1 ? "card" : "cards"} ·
                        by {look.authorName}
                      </p>
                      {look.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{look.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={busy === look.id || !clubQ.data}
                      onClick={() => adopt(look)}
                    >
                      Adopt look
                    </Button>
                  </div>
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                    {look.templates.map((t) => (
                      <KindThumb key={t.id} look={look.slug} kind={t.kind} preview={preview} />
                    ))}
                  </div>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
      {otherPacks.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {otherPacks.map((p) => (
            <LookPackControls
              key={p.packId}
              packs={packs}
              pack={p}
              format={format}
              data={packData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
