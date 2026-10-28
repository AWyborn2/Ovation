import { useState } from "react";
import { useLocation } from "wouter";
import { Paintbrush, PenSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateSocialDraft, type TemplateRef } from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { getElement } from "@/lib/studio-elements/registry";

const STARTER_SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];

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
  /**
   * The template picked for this card (ADR-011): "Open in editor" then makes
   * the draft from that template rather than the pack.
   */
  templateRef?: TemplateRef | null;
  /** The player the card is about (player sponsors); saved on the draft. */
  subjectPlayerId?: number | null;
};

/**
 * Ways into the Studio editor from Create a card (U18): the card as composed
 * (drawn with the picked template, ADR-011), or a blank canvas (plain, or on
 * the Club Kit background). New posts start from templates, never packs
 * (T5.19): saved editor templates and the Club Kit design starters are
 * retired; the template library holds every design. Each makes an ad-hoc draft
 * (awaiting review, never auto-posted) and opens it; the editor's Elements
 * panel then offers every Club Kit element for the design.
 */
export function EditorStarters({
  input,
  packId,
  templateRef = null,
  subjectPlayerId = null,
}: Props) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSocialDraft();

  const start = (body: Parameters<typeof create.mutate>[0]["data"]) => {
    setError(null);
    create.mutate(
      // The card's player carries over, so the draft shows their sponsors.
      { data: subjectPlayerId != null ? { ...body, subjectPlayerId } : body },
      {
        onSuccess: (draft) => navigate(`/admin/social/editor/${draft.id}`),
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
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => start(templateRef ? { cardInput, templateRef } : { cardInput, packId })}
          >
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

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
