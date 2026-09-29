import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Paintbrush, PenSquare, Square, Trash2 } from "lucide-react";
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
import { BLANK_PACK_ID, type PackCardData } from "@/lib/pack-render";
import { kindLabel } from "@/lib/social-studio";
import type { CardKind, CardSize, ShareCardInput } from "@/lib/share-card";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import { CLUB_KIT_PACK } from "@/lib/pack-templates/club-kit";
import { getElement } from "@/lib/studio-elements/registry";

const STARTER_SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];

/** A Club Kit starting point: one design (kind + leader preset). */
export interface ClubKitStarter {
  designKey: string;
  name: string;
  kind: CardKind;
  category?: string;
}

/** Every Club Kit design, as an ad-hoc starting point. */
export const CLUB_KIT_STARTERS: ClubKitStarter[] = CLUB_KIT_PACK.designs.map((d) => ({
  designKey: d.designKey,
  name: d.template.name,
  kind: d.kind as CardKind,
  ...(d.categoryPreset ? { category: d.categoryPreset } : {}),
}));

/** The input a Club Kit starter opens with. */
export function starterInput(
  starter: ClubKitStarter,
  current: ShareCardInput,
  inputFor: (kind: CardKind) => ShareCardInput,
): ShareCardInput {
  const base = starter.kind === current.kind ? current : inputFor(starter.kind);
  return starter.category ? ({ ...base, category: starter.category } as ShareCardInput) : base;
}

/** A blank canvas already carrying the Club Kit background in every format. */
export function clubKitBackgroundAdjustments(): { layers: Record<string, unknown>[] } {
  const def = getElement("ck.background")!;
  return {
    layers: [
      {
        id: "ck-bg",
        kind: "element",
        name: def.label,
        locked: true,
        element: { id: def.id },
        geometry: Object.fromEntries(STARTER_SIZES.map((s) => [s, def.defaultBox(s)])),
      },
    ],
  };
}

type Props = {
  /** The card being composed on the page. */
  input: ShareCardInput;
  /** The design it previews in (the club's default pack for the kind). */
  packId: string | null;
  /** A fresh card of another kind, for a template saved from that kind. */
  inputFor: (kind: CardKind) => ShareCardInput;
  /** Tenant data and theme, for the Club Kit design thumbnails. */
  data?: PackCardData | null;
  theme?: ApiCardTheme | null;
};

/**
 * Ways into the Studio editor from Create a card (U18): the card as composed,
 * a blank canvas (plain, or on the Club Kit background), any Club Kit design,
 * or one of the club's saved editor templates. Each makes an ad-hoc draft
 * (awaiting review, never auto-posted) and opens it; the editor's Elements
 * panel then offers every Club Kit element for the design.
 */
export function EditorStarters({ input, packId, inputFor, data = null, theme = null }: Props) {
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
          <Button
            variant="outline"
            disabled={busy}
            className="sm:col-span-2"
            onClick={() =>
              start({
                cardInput,
                packId: BLANK_PACK_ID,
                adjustments: clubKitBackgroundAdjustments(),
              })
            }
          >
            <Paintbrush className="mr-2 h-4 w-4" aria-hidden />
            Start on the Club Kit background
          </Button>
        </div>

        <section aria-labelledby="club-kit-designs" className="space-y-2">
          <h3 id="club-kit-designs" className="text-sm font-semibold">
            Start from a Club Kit design
          </h3>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {CLUB_KIT_STARTERS.map((st) => {
              const stInput = starterInput(st, input, inputFor);
              return (
                <li key={st.designKey}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Start from Club Kit ${st.name}`}
                    onClick={() =>
                      start({
                        cardInput: stInput as unknown as Record<string, unknown>,
                        packId: CLUB_KIT_PACK.packId,
                      })
                    }
                    className="flex w-full flex-col gap-1 rounded-md border border-border p-1 text-left text-[11px] font-medium hover:border-primary disabled:opacity-50"
                  >
                    <span className="block overflow-hidden rounded-sm">
                      <PackCard
                        input={stInput}
                        size="square"
                        sponsorsOn
                        junior={false}
                        theme={theme}
                        data={data}
                        packId={CLUB_KIT_PACK.packId}
                      />
                    </span>
                    <span className="truncate">{st.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

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
