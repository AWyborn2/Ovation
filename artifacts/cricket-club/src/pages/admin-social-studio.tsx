import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSocialSettings,
  useListCardTemplates,
  useCreateCardTemplate,
  useUpdateCardTemplate,
  useDeleteCardTemplate,
  getListCardTemplatesQueryKey,
  type CardTemplate,
  type SocialSettingsBundle,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  type CardTheme as ApiCardTheme,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Plus, IdCard } from "lucide-react";
import { CardLayoutEditor, type TemplateMode } from "@/components/card-layout-editor";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { DEFAULT_PACK_ID } from "@/lib/pack-templates/registry";
import { usePackSelection } from "@/lib/use-pack-selection";
import { PackPreviewTile } from "@/components/social-studio/pack-preview-tile";
import { DesignPacksSection } from "@/components/social-studio/design-packs-section";
import { MatchSummarySettings } from "@/components/social-studio/match-summary-settings";
import {
  DEFAULT_PACK_NAME,
  THUMB_SIZE,
  kindLabel,
  packName,
  type CardKind,
} from "@/lib/social-studio";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { renderShareCard, SIZES, type RenderOptions, type ShareCardInput } from "@/lib/share-card";
import {
  buildPackData,
  tenantHashtag,
  kindSponsors,
  presentingSponsorName,
  shortClubName,
} from "@/lib/pack-card-data";
import { type PackCardData } from "@/lib/pack-render";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState, QueryError } from "@/components/data-states";

// Renders a card preview (built-in body + optional saved layout) to an <img>.
function CardThumb({
  input,
  baseOpts,
  layout,
}: {
  input: ShareCardInput;
  baseOpts: RenderOptions;
  layout?: CardTemplate["layers"] | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const layoutSig = JSON.stringify(layout ?? []);

  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    setFailed(false);
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
      } catch (e) {
        if (cancelled) return;
        // A render failure shouldn't break the whole gallery — show a
        // retryable error state on this tile instead of a spinner forever.
        console.error("Card thumbnail render failed", input.kind, e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.kind, layoutSig, baseOpts.brand, retryToken]);

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded bg-muted"
      style={{ aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}` }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : failed ? (
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setRetryToken((t) => t + 1)}
        >
          <span>Preview failed</span>
          <span className="underline">Retry</span>
        </button>
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

type EditorState =
  | { mode: "template-new"; baseKind: CardKind }
  | { mode: "template-edit"; template: CardTemplate };

export default function AdminSocialStudio() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const settingsQ = useGetSocialSettings();
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const templatesQ = useListCardTemplates();

  const [editing, setEditing] = useState<EditorState | null>(null);
  const [newBaseKind, setNewBaseKind] = useState<CardKind>("milestone");
  const [error, setError] = useState<string | null>(null);

  const templates = (templatesQ.data as CardTemplate[] | undefined) ?? [];

  // Everything about the tenant's design-pack choice — what each kind resolves
  // to, what it could resolve to, and the two write paths that change it.
  const packs = usePackSelection({ templates, confirm });
  // Which of the TENANT'S OWN templates (if any) is the default for each card
  // kind. Pack rows share the `defaultForKinds` column but are deliberately
  // excluded: a pack claim is reported by the pack selector below, and only
  // there — one surface per decision.
  const defaultByKind = new Map<string, CardTemplate>();
  for (const t of templates) {
    if (t.source === "pack") continue;
    for (const k of t.defaultForKinds ?? []) defaultByKind.set(k, t);
  }

  const baseOpts: RenderOptions = {
    size: THUMB_SIZE,
    brand: bundle?.brand ?? null,
  };

  // --- Tenant branding for the card-type gallery -----------------------------
  // The gallery answers "what does a Match Result card look like FOR US", so
  // thumbnails render the tenant's own logo, name, hashtag, sponsors and
  // colours. Only the card *content* stays sample data (`sampleCardInput`) — a
  // thumbnail is a style preview, not a real card.
  //
  // Without this the thumbnails fall through to the Broadcast-Dark sample
  // literals, so every tenant browsed a gallery branded "HALLS HEAD".
  const themesQ = useListCardThemes({
    query: { queryKey: getListCardThemesQueryKey() },
  });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const galleryTheme = themes.find((t) => t.isDefault) ?? themes[0] ?? null;

  // Sample CONTENT speaks as the tenant too: "Mandurah won by 5 wickets", the
  // ladder's highlighted row is Mandurah's — not a generic "Sample Club". The
  // thumbnails then read as "our cards", not a stranger's.
  const galleryClubName = shortClubName(bundle?.brand?.name ?? "") || undefined;

  // One sample input per card kind, memoised for the same reason as the payload
  // below: `sampleCardInput` deep-clones whenever a club name is supplied, so
  // calling it inline in JSX handed <PackCard> a fresh `input` identity on every
  // render. `input` is one of that component's html-memo keys, so all 23 mounts
  // re-ran the expensive renderPackCard on any unrelated state change.
  const galleryInputByKind = useMemo(() => {
    const out = new Map<CardKind, ShareCardInput>();
    for (const o of CARD_KIND_OPTIONS) {
      out.set(o.value, sampleCardInput(o.value, galleryClubName));
    }
    return out;
  }, [galleryClubName]);

  // One payload per card kind, memoised so <PackCard>'s html memo (keyed on
  // `data` identity) is not defeated on every parent re-render.
  const galleryDataByKind = useMemo(() => {
    const sponsorsOn = !!bundle?.settings.sponsorsEnabled;
    const out = new Map<string, PackCardData>();
    for (const o of CARD_KIND_OPTIONS) {
      out.set(
        o.value,
        buildPackData({
          brand: bundle?.brand,
          hashtag: tenantHashtag(bundle),
          sponsors: kindSponsors(bundle, o.value, sponsorsOn),
          presentingSponsorName: presentingSponsorName(bundle, sponsorsOn),
        }),
      );
    }
    return out;
  }, [bundle]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCardTemplatesQueryKey() });
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

  // --- Design pack selection -------------------------------------------------
  // One write path for both switcher surfaces, and ONE PATCH per action, to one
  // canonical row per pack. The server's `clearDefaultKinds` strips the claimed
  // kinds from every other row in the tenant, so a second write would undo the
  // first — three sequential writes across a pack's square/portrait/story rows
  // would leave only the last one claiming anything.

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

  if (settingsQ.isError || templatesQ.isError) {
    return (
      <QueryError
        onRetry={() => {
          settingsQ.refetch();
          templatesQ.refetch();
        }}
      />
    );
  }
  if (settingsQ.isLoading || templatesQ.isLoading) {
    return <LoadingState label="Loading studio…" />;
  }

  // Full-screen editor takes over the tab while open.
  if (editing) {
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
  // Uploaded backgrounds only. Pack rows are code-rendered designs, not
  // uploads: they carry no background image, can't be opened in the Cards tab,
  // and Delete on one isn't durable (the server re-creates it on next start).
  const bgTemplates = templates.filter((t) => t.source === "background");

  return (
    <div className="space-y-8">
      {/* Two independent error sources, one banner. `packs.error` was
          unreachable for a release: the #110 split gave the pack hook its own
          mutation and its own error state, and nothing was ever wired to read
          it. There is no toast and no MutationCache handler, so a failing pack
          write showed as a spinner that changed nothing — which is exactly how
          a 100%-reproducible 500 from `clearDefaultKinds` stayed invisible.
          The selector is controlled off server state and always snaps back on
          the render `setPendingKind` forces, so without this banner a failure
          is indistinguishable from success. */}
      {(error || packs.error) && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? packs.error}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Design every kind of share card from one place. Edit a card type's built-in layout, or build
        named templates you can assign to one or many card types — and set one as the default for a
        type so it's applied automatically everywhere that card is shared.
      </p>

      {/* Design packs — the bulk path, met before the per-kind selectors */}
      <DesignPacksSection
        selection={packs}
        previewInput={
          galleryInputByKind.get("matchSummary") ?? sampleCardInput("matchSummary", galleryClubName)
        }
        previewData={galleryDataByKind.get("matchSummary") ?? null}
        theme={galleryTheme}
      />

      {/* Card types gallery */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Card types</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CARD_KIND_OPTIONS.map((o) => {
            const kind = o.value;
            const def = defaultByKind.get(kind);
            return (
              <PackPreviewTile
                key={kind}
                input={galleryInputByKind.get(kind) ?? sampleCardInput(kind, galleryClubName)}
                theme={galleryTheme}
                data={galleryDataByKind.get(kind) ?? null}
                packId={packs.packIdByKind.get(kind) ?? null}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium">{o.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    aria-label={`Design pack for ${o.label}`}
                    className="h-7 w-full min-w-0 rounded-md border bg-background px-1 text-[11px]"
                    // No claim and an explicit default-pack claim render the
                    // same card, so both present as the leading "" option —
                    // otherwise an explicit default claim holds a value that
                    // the filtered option list no longer contains and the
                    // control goes blank.
                    value={
                      (packs.packIdByKind.get(kind) ?? DEFAULT_PACK_ID) === DEFAULT_PACK_ID
                        ? ""
                        : packs.packIdByKind.get(kind)!
                    }
                    // Gate on ANY in-flight pack write, not just this kind's.
                    // Every kind of a pack claims through the same canonical
                    // row and the PATCH replaces the whole array, so a second
                    // selection made against the pre-write cache would drop
                    // the first claim.
                    disabled={packs.busy}
                    onChange={(e) => packs.selectPack(kind, e.target.value)}
                  >
                    {/* Explicit leading option: without it a kind with no
                          claim holds a value absent from the option list and
                          the control renders blank. */}
                    <option value="">{DEFAULT_PACK_NAME} (default)</option>
                    {/* The default pack already has the leading option above;
                          it is also registered and covers every kind, so mapping
                          it again would list it twice under two values that
                          apply the same pack. */}
                    {(packs.selectablePacksByKind.get(kind) ?? [])
                      .filter((p) => p !== DEFAULT_PACK_ID)
                      .map((p) => (
                        <option key={p} value={p}>
                          {packName(p)}
                        </option>
                      ))}
                  </select>
                  {packs.pendingKind === kind && (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </div>
                {def && (
                  // A "layers" template makes the card bypass the pack
                  // entirely, so the selector above it is not what ships —
                  // say so, rather than captioning it as a plain default.
                  <p className="truncate text-[11px] text-muted-foreground">
                    {def.source === "layers"
                      ? `Overridden by template: ${def.name}`
                      : `Default template: ${def.name}`}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setEditing({ mode: "template-new", baseKind: kind })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Template
                  </Button>
                </div>
              </PackPreviewTile>
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
              onClick={() => setEditing({ mode: "template-new", baseKind: newBaseKind })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> New template
            </Button>
          </div>
        </div>

        {layerTemplates.length === 0 ? (
          <p className="rounded border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No templates yet. Build one with the layer editor, then assign it to card types and pick
            a default.
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
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 text-xs"
                        onClick={() => setEditing({ mode: "template-edit", template: t })}
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
              Choose which stats and awards appear on collectible player trading cards, with
              optional per-role overrides.
            </p>
            <Link href="/admin/social/trading-cards">
              <Button size="sm" variant="outline">
                Configure trading cards
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Match summary auto-draft settings */}
      {bundle && (
        <MatchSummarySettings
          settings={bundle.settings}
          onSaved={() =>
            qc.invalidateQueries({
              queryKey: getGetSocialSettingsQueryKey(),
            })
          }
        />
      )}
    </div>
  );
}
