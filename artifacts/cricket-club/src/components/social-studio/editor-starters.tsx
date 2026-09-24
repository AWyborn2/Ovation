import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, PenSquare, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/confirm-dialog";
import {
  useCreateSocialDraft,
  useDeleteEditorTemplate,
  useListEditorTemplates,
  getListEditorTemplatesQueryKey,
  type EditorTemplate,
} from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { kindLabel } from "@/lib/social-studio";
import type { CardKind, ShareCardInput } from "@/lib/share-card";

type Props = {
  /** The card being composed on the page. */
  input: ShareCardInput;
  /** The design it previews in (the club's default pack for the kind). */
  packId: string | null;
  /** A fresh card of another kind, for a template saved from that kind. */
  inputFor: (kind: CardKind) => ShareCardInput;
};

/**
 * Ways into the Studio editor from Create a card (U18): the card as composed,
 * a blank canvas, or one of the club's saved editor templates. Each makes an
 * ad-hoc draft (awaiting review, never auto-posted) and opens it.
 */
export function EditorStarters({ input, packId, inputFor }: Props) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const templatesQ = useListEditorTemplates({
    query: { queryKey: getListEditorTemplatesQueryKey() },
  });
  const templates = (templatesQ.data ?? []) as EditorTemplate[];
  const create = useCreateSocialDraft();
  const remove = useDeleteEditorTemplate();

  const start = (body: Parameters<typeof create.mutate>[0]["data"]) => {
    setError(null);
    create.mutate(
      { data: body },
      {
        onSuccess: (draft) => navigate(`/admin/social/editor/${draft.id}`),
        onError: (e) => setError(handleAdminMutationError(e)),
      },
    );
  };

  const fromTemplate = (t: EditorTemplate) => {
    const kind = (t.baseKind ?? input.kind) as CardKind;
    start({
      cardInput: (kind === input.kind ? input : inputFor(kind)) as Record<string, unknown>,
      templateId: t.id,
    });
  };

  const del = async (t: EditorTemplate) => {
    if (
      !(await confirm({
        title: "Delete template",
        description: `Delete "${t.name}"? Cards already made from it keep their design.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    remove.mutate(
      { id: t.id },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListEditorTemplatesQueryKey() }),
        onError: (e) => setError(handleAdminMutationError(e)),
      },
    );
  };

  const cardInput = input as unknown as Record<string, unknown>;
  const busy = create.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Design it yourself</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => start({ cardInput, packId })}>
            <PenSquare className="mr-2 h-4 w-4" aria-hidden />
            Open in editor
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => start({ cardInput, packId: BLANK_PACK_ID })}
          >
            <Square className="mr-2 h-4 w-4" aria-hidden />
            Blank canvas
          </Button>
        </div>

        {templates.length > 0 && (
          <section aria-labelledby="your-templates" className="space-y-2">
            <h3 id="your-templates" className="text-sm font-semibold">
              Your templates
            </h3>
            <ul className="divide-y divide-border rounded-md border border-border">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                  <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    {t.baseKind && (
                      <p className="text-xs text-muted-foreground">
                        {kindLabel(t.baseKind as CardKind)}
                      </p>
                    )}
                  </div>
                  <Button size="sm" disabled={busy} onClick={() => fromTemplate(t)}>
                    Create from this
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => void del(t)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
