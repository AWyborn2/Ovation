import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSocialSettings,
  useListCardLayouts,
  useListCardTemplates,
  useCreateCardTemplate,
  useUpdateCardTemplate,
  useDeleteCardTemplate,
  getListCardTemplatesQueryKey,
  getListCardLayoutsQueryKey,
  type CardLayout,
  type CardTemplate,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, Pencil, Trash2, Plus, IdCard } from "lucide-react";
import {
  CardLayoutEditor,
  type TemplateMode,
} from "@/components/card-layout-editor";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import {
  renderShareCard,
  SIZES,
  type CardSize,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState, QueryError } from "@/components/data-states";

const THUMB_SIZE: CardSize = "square";

type CardKind = ShareCardInput["kind"];

const kindLabel = (k: string) =>
  CARD_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

// Renders a card preview (built-in body + optional saved layout) to an <img>.
function CardThumb({
  input,
  baseOpts,
  layout,
}: {
  input: ShareCardInput;
  baseOpts: RenderOptions;
  layout?: CardLayout["layers"] | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const layoutSig = JSON.stringify(layout ?? []);

  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    (async () => {
      try {
        const blob = await renderShareCard(input, {
          ...baseOpts,
          size: THUMB_SIZE,
          layout: layout ?? [],
        });
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
      } catch {
        /* leave spinner — a render failure shouldn't break the gallery */
      }
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.kind, layoutSig, baseOpts.brand]);

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded bg-muted"
      style={{ aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}` }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

type EditorState =
  | { mode: "builtin"; kind: CardKind }
  | { mode: "template-new"; baseKind: CardKind }
  | { mode: "template-edit"; template: CardTemplate };

export default function AdminSocialStudio() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const settingsQ = useGetSocialSettings();
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const layoutsQ = useListCardLayouts();
  const templatesQ = useListCardTemplates();

  const [editing, setEditing] = useState<EditorState | null>(null);
  const [newBaseKind, setNewBaseKind] = useState<CardKind>("milestone");
  const [error, setError] = useState<string | null>(null);

  const layouts = (layoutsQ.data as CardLayout[] | undefined) ?? [];
  const templates = (templatesQ.data as CardTemplate[] | undefined) ?? [];
  const layoutByKind = new Map(layouts.map((l) => [l.cardKind, l]));
  // Which template (if any) is the default for each card kind.
  const defaultByKind = new Map<string, CardTemplate>();
  for (const t of templates) {
    for (const k of t.defaultForKinds ?? []) defaultByKind.set(k, t);
  }

  const baseOpts: RenderOptions = {
    size: THUMB_SIZE,
    brand: bundle?.brand ?? null,
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCardTemplatesQueryKey() });
    qc.invalidateQueries({ queryKey: getListCardLayoutsQueryKey() });
  };
  const onError = (e: unknown) => setError(handleAdminMutationError(e));

  const createMut = useCreateCardTemplate({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditing(null);
      },
      onError,
    },
  });
  const updateMut = useUpdateCardTemplate({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditing(null);
      },
      onError,
    },
  });
  const deleteMut = useDeleteCardTemplate({
    mutation: { onSuccess: invalidate, onError },
  });

  const buildTemplateMode = (
    baseKind: CardKind,
    init: {
      name: string;
      cardKinds: string[];
      defaultForKinds: string[];
      id?: number;
    },
  ): TemplateMode => ({
    initialName: init.name,
    initialCardKinds: init.cardKinds,
    initialDefaultForKinds: init.defaultForKinds,
    saving: createMut.isPending || updateMut.isPending,
    onSaveTemplate: (data) => {
      setError(null);
      const body = { ...data, source: "layers" as const, baseKind };
      if (init.id !== undefined) {
        updateMut.mutate({ id: init.id, data: body });
      } else {
        createMut.mutate({ data: body });
      }
    },
  });

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

  if (settingsQ.isError || layoutsQ.isError || templatesQ.isError) {
    return (
      <QueryError
        onRetry={() => {
          settingsQ.refetch();
          layoutsQ.refetch();
          templatesQ.refetch();
        }}
      />
    );
  }
  if (settingsQ.isLoading || layoutsQ.isLoading || templatesQ.isLoading) {
    return <LoadingState label="Loading studio…" />;
  }

  // Full-screen editor takes over the tab while open.
  if (editing) {
    if (editing.mode === "builtin") {
      return (
        <CardLayoutEditor
          input={sampleCardInput(editing.kind)}
          baseOpts={baseOpts}
          activeSize={THUMB_SIZE}
          onClose={() => setEditing(null)}
        />
      );
    }
    if (editing.mode === "template-new") {
      return (
        <CardLayoutEditor
          input={sampleCardInput(editing.baseKind)}
          baseOpts={baseOpts}
          activeSize={THUMB_SIZE}
          onClose={() => setEditing(null)}
          controlledLayout={[]}
          templateMode={buildTemplateMode(editing.baseKind, {
            name: "",
            cardKinds: [editing.baseKind],
            defaultForKinds: [],
          })}
        />
      );
    }
    const t = editing.template;
    const baseKind = (t.baseKind as CardKind) ?? "milestone";
    return (
      <CardLayoutEditor
        input={sampleCardInput(baseKind)}
        baseOpts={baseOpts}
        activeSize={THUMB_SIZE}
        onClose={() => setEditing(null)}
        controlledLayout={t.layers ?? []}
        templateMode={buildTemplateMode(baseKind, {
          id: t.id,
          name: t.name,
          cardKinds: t.cardKinds ?? [],
          defaultForKinds: t.defaultForKinds ?? [],
        })}
      />
    );
  }

  const layerTemplates = templates.filter((t) => t.source === "layers");
  const bgTemplates = templates.filter((t) => t.source !== "layers");

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Design every kind of share card from one place. Edit a card type's
        built-in layout, or build named templates you can assign to one or many
        card types — and set one as the default for a type so it's applied
        automatically everywhere that card is shared.
      </p>

      {/* Card types gallery */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Card types</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CARD_KIND_OPTIONS.map((o) => {
            const kind = o.value;
            const layout = layoutByKind.get(kind);
            const def = defaultByKind.get(kind);
            return (
              <Card key={kind} className="overflow-hidden">
                <CardThumb
                  input={sampleCardInput(kind)}
                  baseOpts={baseOpts}
                  layout={layout?.layers ?? []}
                />
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium">{o.label}</span>
                    {(layout?.layers?.length ?? 0) > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Custom
                      </Badge>
                    )}
                  </div>
                  {def && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      Default template: {def.name}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setEditing({ mode: "builtin", kind })}
                    >
                      <Wand2 className="mr-1 h-3 w-3" /> Edit built-in
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditing({ mode: "template-new", baseKind: kind })
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" /> Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Saved layer templates */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Templates</h2>
          <div className="flex items-center gap-1.5">
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={newBaseKind}
              onChange={(e) => setNewBaseKind(e.target.value as CardKind)}
            >
              {CARD_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() =>
                setEditing({ mode: "template-new", baseKind: newBaseKind })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> New template
            </Button>
          </div>
        </div>

        {layerTemplates.length === 0 ? (
          <p className="rounded border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No templates yet. Build one with the layer editor, then assign it to
            card types and pick a default.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {layerTemplates.map((t) => {
              const baseKind = (t.baseKind as CardKind) ?? "milestone";
              return (
                <Card key={t.id} className="overflow-hidden">
                  <CardThumb
                    input={sampleCardInput(baseKind)}
                    baseOpts={baseOpts}
                    layout={t.layers ?? []}
                  />
                  <CardContent className="space-y-2 p-3">
                    <span className="block truncate text-sm font-medium">
                      {t.name}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(t.cardKinds?.length ?? 0) === 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          All cards
                        </Badge>
                      ) : (
                        t.cardKinds.map((k) => (
                          <Badge
                            key={k}
                            variant={
                              t.defaultForKinds?.includes(k)
                                ? "default"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {kindLabel(k)}
                            {t.defaultForKinds?.includes(k) ? " ★" : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 text-xs"
                        onClick={() =>
                          setEditing({ mode: "template-edit", template: t })
                        }
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive"
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {bgTemplates.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground">
              Background templates (upload-based — edit in the Cards tab)
            </p>
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
                      <img
                        src={t.backgroundImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No background
                      </span>
                    )}
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <span className="block truncate text-sm font-medium">
                      {t.name}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(t.cardKinds?.length ?? 0) === 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          All cards
                        </Badge>
                      ) : (
                        t.cardKinds.map((k) => (
                          <Badge
                            key={k}
                            variant={
                              t.defaultForKinds?.includes(k)
                                ? "default"
                                : "outline"
                            }
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
          </div>
        )}
      </section>

      {/* Trading cards entry */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Trading cards</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <IdCard className="h-4 w-4" /> Player trading cards
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Choose which stats and awards appear on collectible player trading
              cards, with optional per-role overrides.
            </p>
            <Link href="/admin/social/trading-cards">
              <Button size="sm" variant="outline">
                Configure trading cards
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
