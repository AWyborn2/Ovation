/**
 * Studio → Templates → Looks (ADR-011 T5.4): each look's kinds side by side,
 * and Adopt look, which makes the look's templates the club's defaults for the
 * kinds it covers. The confirmation names the defaults that change; kinds the
 * look doesn't cover keep theirs.
 */
import { useState } from "react";
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
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { kindLabel } from "@/lib/social-studio";
import { TemplateThumb, useLibraryPreviewData, usePreviewInput } from "./previews";

type Preview = ReturnType<typeof useLibraryPreviewData>;

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
  return (
    <div className="space-y-4">
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      <ul className="space-y-3">
        {looks.map((look) => (
          <li key={look.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{look.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {look.templates.length} {look.templates.length === 1 ? "card" : "cards"} · by{" "}
                  {look.authorName}
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
          </li>
        ))}
      </ul>
    </div>
  );
}
