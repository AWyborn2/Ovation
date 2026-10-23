import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDeleteCardTemplate,
  getListCardTemplatesQueryKey,
  type CardTemplate,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { THUMB_SIZE, kindLabel } from "@/lib/social-studio";
import { SIZES } from "@/lib/share-card";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * The old upload-based background templates. New designs are made in the
 * Studio editor (U18), so these are read-only here: they still render and can
 * be deleted, but no longer edited. Hidden when the club has none.
 *
 * Uploaded backgrounds only. Pack rows are code-rendered designs, not uploads:
 * they carry no background image, can't be opened in the Cards tab, and Delete
 * on one isn't durable (the server re-creates it on next start).
 */
export function LegacyBackgroundsSection({
  id,
  templates,
}: {
  id?: string;
  templates: CardTemplate[];
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const deleteMut = useDeleteCardTemplate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListCardTemplatesQueryKey() }),
      onError: (e: unknown) => setError(handleAdminMutationError(e)),
    },
  });

  const bgTemplates = templates.filter((t) => t.source === "background");
  if (bgTemplates.length === 0) return null;

  const handleDelete = async (t: CardTemplate) => {
    if (
      !(await confirm({
        title: "Delete template",
        description: `Delete "${t.name}"? Any card types it was the default for will fall back to the built-in design.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    deleteMut.mutate({ id: t.id });
  };

  return (
    <section
      id={id}
      className="scroll-mt-24 space-y-3"
      aria-labelledby="legacy-backgrounds-heading"
    >
      <h2 id="legacy-backgrounds-heading" className="text-lg font-semibold">
        Legacy backgrounds
      </h2>
      <p className="text-sm text-muted-foreground">
        Background templates from the old upload-based cards. They still draw the cards that use
        them; edit them in the Cards tab, or delete them here.
      </p>
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {bgTemplates.map((t) => (
          <Card key={t.id} className="overflow-hidden">
            <div
              className="flex items-center justify-center overflow-hidden rounded bg-muted"
              style={{
                aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}`,
              }}
            >
              {t.backgroundImageUrl ? (
                <img src={t.backgroundImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">No background</span>
              )}
            </div>
            <CardContent className="space-y-2 p-3">
              <span className="block truncate text-sm font-medium">{t.name}</span>
              <div className="flex flex-wrap gap-1">
                {(t.cardKinds?.length ?? 0) === 0 ? (
                  <Badge variant="outline" className="text-[10px]">
                    All cards
                  </Badge>
                ) : (
                  t.cardKinds.map((k) => (
                    <Badge
                      key={k}
                      variant={t.defaultForKinds?.includes(k) ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {kindLabel(k)}
                      {t.defaultForKinds?.includes(k) ? " ★" : ""}
                    </Badge>
                  ))
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-full text-xs text-destructive"
                onClick={() => handleDelete(t)}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
