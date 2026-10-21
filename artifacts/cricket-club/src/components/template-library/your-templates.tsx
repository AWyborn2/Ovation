/**
 * Studio → Templates → Your templates (ADR-011 T5.5): the club's own copies
 * per card kind, its default first. Duplicate, delete (never the default) and
 * set as default (not while its layout check is running). A copy taken from
 * the library credits it: "Based on X by Y".
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  deleteClubTemplate,
  duplicateClubTemplate,
  getGetClubTemplateQueryKey,
  getListClubTemplatesQueryKey,
  setClubTemplateDefault,
  useGetClubTemplate,
  useListClubTemplates,
  type ClubTemplateSummary,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { kindLabel } from "@/lib/social-studio";
import { TemplateThumb, useLibraryPreviewData, usePreviewInput } from "./previews";

type Preview = ReturnType<typeof useLibraryPreviewData>;

/** "Based on Club Kit Match Day by Ovation", for a copy taken from the library. */
export function basedOnLabel(t: ClubTemplateSummary): string | null {
  return t.basedOn ? `Based on ${t.basedOn.name} by ${t.basedOn.authorName}` : null;
}

function CopyRow({
  template,
  preview,
  onAction,
  busy,
}: {
  template: ClubTemplateSummary;
  preview: Preview;
  onAction: (action: "default" | "duplicate" | "delete", t: ClubTemplateSummary) => void;
  busy: boolean;
}) {
  const q = useGetClubTemplate(template.id, {
    query: { queryKey: getGetClubTemplateQueryKey(template.id), staleTime: 60_000 },
  });
  const input = usePreviewInput(template.kind, preview.clubName);
  const pending = template.fitStatus === "pending";
  const credit = basedOnLabel(template);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="w-20 shrink-0">
        {q.data ? (
          <TemplateThumb
            document={q.data.document}
            kind={template.kind}
            input={input}
            data={preview.dataFor(template.kind)}
          />
        ) : (
          <div className="aspect-square rounded-md bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span className="truncate">{template.name}</span>
          {template.isDefault && <Badge>Default</Badge>}
          {template.edited && <Badge variant="outline">Your design</Badge>}
          {pending && <Badge variant="outline">Checking layout…</Badge>}
          {template.fitStatus === "fail" && <Badge variant="destructive">Layout warnings</Badge>}
        </p>
        {credit && <p className="truncate text-xs text-muted-foreground">{credit}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {template.isDefault ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/social/templates/${template.kind}`}>Edit</Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pending}
            title={pending ? "Its layout check is still running" : undefined}
            onClick={() => onAction("default", template)}
          >
            Set as default
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("duplicate", template)}>
          Duplicate
        </Button>
        {!template.isDefault && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAction("delete", template)}
            aria-label={`Delete ${template.name}`}
          >
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

export function YourTemplates({ preview }: { preview: Preview }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useListClubTemplates(undefined, {
    query: { queryKey: getListClubTemplatesQueryKey() },
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onAction = async (action: "default" | "duplicate" | "delete", t: ClubTemplateSummary) => {
    if (
      action === "delete" &&
      !(await confirm({
        title: "Delete template",
        description: `Delete "${t.name}"? Cards already made with it keep their design.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setStatus(null);
    try {
      if (action === "default") {
        await setClubTemplateDefault(t.id);
        setStatus(`"${t.name}" is now your ${kindLabel(t.kind)} default.`);
      } else if (action === "duplicate") {
        await duplicateClubTemplate(t.id);
        setStatus(`Duplicated "${t.name}".`);
      } else {
        await deleteClubTemplate(t.id);
        setStatus(`Deleted "${t.name}".`);
      }
      await qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
    } catch (e) {
      setStatus(handleAdminMutationError(e) ?? "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (q.isError) return <QueryError onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState label="Loading your templates…" />;
  const templates = q.data?.templates ?? [];
  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Your club has no templates yet. Use one from the library, or adopt a look.
      </p>
    );
  }
  const kinds = [...new Set(templates.map((t) => t.kind))];
  return (
    <div className="space-y-5">
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      {kinds.map((kind) => (
        <section key={kind} aria-label={kindLabel(kind)}>
          <h3 className="mb-2 text-sm font-semibold">{kindLabel(kind)}</h3>
          <ul className="space-y-2">
            {templates
              .filter((t) => t.kind === kind)
              .map((t) => (
                <CopyRow key={t.id} template={t} preview={preview} onAction={onAction} busy={busy} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
