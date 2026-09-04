import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCardSets,
  getListCardSetsQueryKey,
  useCreateCardSet,
  useDeleteCardSet,
  type CardSet,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/stat-badge";
import { Loader2, Plus, Trash2, Globe, Lock } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState, QueryError } from "@/components/data-states";
import { SIZES, type CardSize } from "@/lib/share-card";

/** All carousel sets + the "new set" form. */
export function SetList({ onOpen }: { onOpen: (id: number) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const setsQ = useListCardSets({
    query: { queryKey: getListCardSetsQueryKey() },
  });
  const sets = (setsQ.data ?? []) as CardSet[];
  const [name, setName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListCardSetsQueryKey() });
  const create = useCreateCardSet({ mutation: { onSuccess: invalidate } });
  const remove = useDeleteCardSet({ mutation: { onSuccess: invalidate } });

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const set = await create.mutateAsync({
      data: { name: trimmed, platformSize: "square", slides: [] },
    });
    setName("");
    onOpen((set as CardSet).id);
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Build a linked carousel — 2 to 10 branded slides that post together. Bind each slide to real
        club data, reorder, design, then export the whole set as numbered images at one platform
        size.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>New carousel set</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="set-name">Name</Label>
              <Input
                id="set-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Round 5 wrap-up"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <Button onClick={handleCreate} disabled={!name.trim() || create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {setsQ.isError ? (
        <QueryError onRetry={() => setsQ.refetch()} />
      ) : setsQ.isLoading ? (
        <LoadingState label="Loading sets…" />
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No carousel sets yet. Create one above.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => (
            <Card key={s.id} className="hover:border-primary transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <StatusPill tone={s.isPublished ? "live" : "neutral"} className="shrink-0">
                    {s.isPublished ? (
                      <Globe className="h-2.5 w-2.5" />
                    ) : (
                      <Lock className="h-2.5 w-2.5" />
                    )}
                    {s.isPublished ? "Published" : "Draft"}
                  </StatusPill>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {s.slides.length} slide{s.slides.length === 1 ? "" : "s"} ·{" "}
                  {
                    SIZES[
                      (s.platformSize as CardSize) in SIZES
                        ? (s.platformSize as CardSize)
                        : "square"
                    ].label
                  }
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onOpen(s.id)}>
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Delete set",
                          description: `Delete the carousel set "${s.name}"?`,
                          confirmText: "Delete",
                          destructive: true,
                        })
                      ) {
                        remove.mutate({ id: s.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
