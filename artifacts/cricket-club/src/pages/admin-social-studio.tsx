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
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  type SocialSettings,
  type CardTheme as ApiCardTheme,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Pencil, Trash2, Plus, IdCard, Save } from "lucide-react";
import {
  CardLayoutEditor,
  type TemplateMode,
} from "@/components/card-layout-editor";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import {
  resolvePackIdForKind,
  listSelectablePacksForKind,
  canonicalPackRowFor,
  nextDefaultForKinds,
  byoDefaultsClearedBy,
} from "@/lib/card-template";
import {
  listPackManifests,
  DEFAULT_PACK_ID,
} from "@/lib/pack-templates/registry";
import { PackCard } from "@/components/pack-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import {
  renderShareCard,
  SIZES,
  type CardSize,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";
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

const THUMB_SIZE: CardSize = "square";

type CardKind = ShareCardInput["kind"];

const kindLabel = (k: string) =>
  CARD_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

const ALL_CARD_KINDS: CardKind[] = CARD_KIND_OPTIONS.map((o) => o.value);

/** A pack's catalogue name, falling back to its id for a withdrawn pack. */
const packName = (packId: string): string =>
  listPackManifests().find((m) => m.packId === packId)?.name ?? packId;

const DEFAULT_PACK_NAME = packName(DEFAULT_PACK_ID);

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
  // Which card kind has a pack write in flight, and which pack a bulk apply is
  // running for. Tracked per kind (not from `updateMut.isPending`) so only the
  // control the admin touched goes busy.
  const [pendingKind, setPendingKind] = useState<CardKind | null>(null);
  const [bulkPackId, setBulkPackId] = useState<string | null>(null);

  const templates = (templatesQ.data as CardTemplate[] | undefined) ?? [];
  // Which of the TENANT'S OWN templates (if any) is the default for each card
  // kind. Pack rows share the `defaultForKinds` column but are deliberately
  // excluded: a pack claim is reported by the pack selector below, and only
  // there — one surface per decision.
  const defaultByKind = new Map<string, CardTemplate>();
  for (const t of templates) {
    if (t.source === "pack") continue;
    for (const k of t.defaultForKinds ?? []) defaultByKind.set(k, t);
  }

  // The pack each kind resolves to today, read once through the single reader
  // so the selectors, the thumbnails and the pack cards' counts cannot disagree.
  const packIdByKind = new Map<CardKind, string | null>(
    ALL_CARD_KINDS.map((k) => [k, resolvePackIdForKind(templates, k)] as const),
  );

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
  const claimKindsForPack = (
    packId: string,
    kinds: CardKind[],
    onSettled?: () => void,
  ) => {
    setError(null);
    const row = canonicalPackRowFor(templates, packId);
    if (!row || kinds.length === 0) {
      if (!row) {
        setError(`"${packName(packId)}" isn't available for this club yet.`);
      }
      onSettled?.();
      return;
    }
    let next = row.defaultForKinds ?? [];
    for (const k of kinds) next = nextDefaultForKinds({ defaultForKinds: next }, k);
    updateMut.mutate(
      { id: row.id, data: { defaultForKinds: next } },
      { onSettled: () => onSettled?.() },
    );
  };

  const handleSelectPack = (kind: CardKind, value: string) => {
    // "" is the leading option: the default pack, written as an explicit claim
    // rather than an empty body, so the choice is stored rather than inferred.
    setPendingKind(kind);
    claimKindsForPack(value || DEFAULT_PACK_ID, [kind], () => setPendingKind(null));
  };

  /** The kinds a pack can actually render for this tenant, in gallery order. */
  const kindsCoveredByPack = (packId: string): CardKind[] =>
    ALL_CARD_KINDS.filter((k) =>
      listSelectablePacksForKind(templates, k).includes(packId),
    );

  const handleUsePackEverywhere = async (packId: string) => {
    const name = packName(packId);
    const covered = kindsCoveredByPack(packId);
    if (covered.length === 0) return;
    const uncovered = ALL_CARD_KINDS.filter((k) => !covered.includes(k));
    // `defaultForKinds` is one namespace: claiming these kinds for the pack also
    // clears them from the tenant's OWN templates, and a cleared `layers`
    // default changes which renderer the card ships through. Name the cost.
    const cleared = byoDefaultsClearedBy(templates, covered);
    const clearedNames = cleared
      .slice(0, 4)
      .map((t) => `"${t.name}"`)
      .join(", ");
    const ok = await confirm({
      title: `Use ${name} for all card types?`,
      description: (
        <>
          <span className="block">
            {name} will be used for {covered.length} card{" "}
            {covered.length === 1 ? "type" : "types"}.
          </span>
          {uncovered.length > 0 && (
            <span className="block pt-2">
              {uncovered.length} card {uncovered.length === 1 ? "type" : "types"}{" "}
              this pack doesn't cover stay as they are:{" "}
              {uncovered.map(kindLabel).join(", ")}.
            </span>
          )}
          <span className="block pt-2">
            {cleared.length === 0
              ? "None of your own templates lose their per-card-type default."
              : `${cleared.length} of your own ${
                  cleared.length === 1 ? "template" : "templates"
                } will lose their per-card-type default: ${clearedNames}${
                  cleared.length > 4 ? `, and ${cleared.length - 4} more` : ""
                }.`}
          </span>
        </>
      ),
      confirmText: "Apply to all card types",
      destructive: cleared.length > 0,
    });
    if (!ok) return;
    setBulkPackId(packId);
    claimKindsForPack(packId, covered, () => setBulkPackId(null));
  };

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

  // The packs this tenant can choose from — a registered pack with an active
  // row, in catalogue order.
  const availablePacks = listPackManifests().filter((m) =>
    canonicalPackRowFor(templates, m.packId),
  );

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

      {/* Design packs — the bulk path, met before the 18 per-kind selectors */}
      {availablePacks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Design packs</h2>
          <p className="text-sm text-muted-foreground">
            A pack is a complete set of card designs. Apply one to every card
            type at once, or pick a different pack for a single card type below.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {availablePacks.map((m) => {
              const owned = ALL_CARD_KINDS.filter(
                (k) => packIdByKind.get(k) === m.packId,
              ).length;
              return (
                <Card key={m.packId} className="overflow-hidden">
                  <div
                    className="overflow-hidden rounded bg-muted"
                    style={{
                      aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}`,
                    }}
                  >
                    <PackCard
                      input={sampleCardInput("matchSummary", galleryClubName)}
                      size={THUMB_SIZE}
                      sponsorsOn
                      junior={false}
                      theme={galleryTheme}
                      data={galleryDataByKind.get("matchSummary") ?? null}
                      packId={m.packId}
                    />
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <span className="block truncate text-sm font-medium">
                      {m.name}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {owned === 0
                        ? "Not used by any card type"
                        : `Used by ${owned} of ${ALL_CARD_KINDS.length} card types`}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full text-xs"
                      aria-label={`Use ${m.name} for all card types`}
                      disabled={bulkPackId !== null}
                      onClick={() => handleUsePackEverywhere(m.packId)}
                    >
                      {bulkPackId === m.packId && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      Use for all card types
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Card types gallery */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Card types</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CARD_KIND_OPTIONS.map((o) => {
            const kind = o.value;
            const def = defaultByKind.get(kind);
            return (
              <Card key={kind} className="overflow-hidden">
                <div
                  className="overflow-hidden rounded bg-muted"
                  style={{
                    aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}`,
                  }}
                >
                  <PackCard
                    input={sampleCardInput(kind, galleryClubName)}
                    size={THUMB_SIZE}
                    sponsorsOn
                    junior={false}
                    theme={galleryTheme}
                    data={galleryDataByKind.get(kind) ?? null}
                    packId={packIdByKind.get(kind) ?? null}
                  />
                </div>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium">{o.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label={`Design pack for ${o.label}`}
                      className="h-7 w-full min-w-0 rounded-md border bg-background px-1 text-[11px]"
                      value={packIdByKind.get(kind) ?? ""}
                      disabled={pendingKind === kind}
                      onChange={(e) => handleSelectPack(kind, e.target.value)}
                    >
                      {/* Explicit leading option: without it a kind with no
                          claim holds a value absent from the option list and
                          the control renders blank. */}
                      <option value="">{DEFAULT_PACK_NAME} (default)</option>
                      {listSelectablePacksForKind(templates, kind).map((p) => (
                        <option key={p} value={p}>
                          {packName(p)}
                        </option>
                      ))}
                    </select>
                    {pendingKind === kind && (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {def?.source === "layers" && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      Overridden by template: {def.name}
                    </p>
                  )}
                  {def && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      Default template: {def.name}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
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

// ---------------------------------------------------------------------------
// Match summary auto-draft settings
// ---------------------------------------------------------------------------

/** Per-grade match summary config shape (matches the OpenAPI schema). */
type MatchSummaryGradeConfig = Record<string, { enabled: boolean }>;

const SENIOR_GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "One Day",
  "T20",
];
const JUNIOR_GRADES = ["Under 10", "Under 12", "Under 14", "Under 16"];
const ALL_DEFAULT_GRADES = [...SENIOR_GRADES, ...JUNIOR_GRADES];

function isJuniorGrade(grade: string): boolean {
  return JUNIOR_GRADES.includes(grade) || /^under\s/i.test(grade);
}

function MatchSummarySettings({
  settings,
  onSaved,
}: {
  settings: SocialSettings;
  onSaved: () => void;
}) {
  const [masterEnabled, setMasterEnabled] = useState<boolean>(
    settings.engineMatchSummary === true,
  );
  const [autoseedEnabled, setAutoseedEnabled] = useState<boolean>(
    settings.autoseedCarousels === true,
  );
  const [gradeConfig, setGradeConfig] = useState<MatchSummaryGradeConfig>(
    () => settings.matchSummaryGradeConfig ?? {},
  );
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  useEffect(() => {
    setMasterEnabled(settings.engineMatchSummary === true);
    setAutoseedEnabled(settings.autoseedCarousels === true);
    setGradeConfig(settings.matchSummaryGradeConfig ?? {});
  }, [settings]);

  // Merge default grades with any extra grades stored in the config.
  const allGrades = useMemo(() => {
    const set = new Set(ALL_DEFAULT_GRADES);
    for (const g of Object.keys(gradeConfig)) set.add(g);
    return Array.from(set);
  }, [gradeConfig]);

  const isGradeEnabled = (grade: string): boolean => {
    if (gradeConfig[grade] !== undefined) return gradeConfig[grade].enabled;
    // Default: senior grades ON, junior grades OFF.
    return !isJuniorGrade(grade);
  };

  const toggleGrade = (grade: string, enabled: boolean) => {
    setGradeConfig((prev) => ({ ...prev, [grade]: { enabled } }));
  };

  const save = () => {
    setError(null);
    update.mutate({
      data: {
        engineMatchSummary: masterEnabled,
        autoseedCarousels: autoseedEnabled,
        matchSummaryGradeConfig: gradeConfig,
      },
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Match summary auto-draft</h2>
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Master toggle */}
          <div className="flex items-start justify-between gap-3 border rounded p-3">
            <div>
              <div className="font-medium">Match Summary Auto-Draft</div>
              <div className="text-xs text-muted-foreground">
                Automatically draft match summary cards when results are
                committed
              </div>
            </div>
            <Switch
              checked={masterEnabled}
              onCheckedChange={setMasterEnabled}
            />
          </div>

          {/* Per-grade config — visible only when master switch is on */}
          {masterEnabled && (
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold mb-1 text-sm uppercase tracking-wide text-muted-foreground">
                  Grade Configuration
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Control which grades auto-draft match summary cards. Senior
                  grades default to ON, junior grades default to OFF.
                </p>
              </div>

              <div className="space-y-2">
                {allGrades.map((grade) => {
                  const junior = isJuniorGrade(grade);
                  return (
                    <div
                      key={grade}
                      className="flex items-center justify-between gap-3 border rounded p-3"
                    >
                      <div className="flex items-center gap-2">
                        {junior && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "#42342B" }}
                            title="Junior grade"
                          />
                        )}
                        <span className="font-medium text-sm">{grade}</span>
                        {junior && (
                          <span className="text-[10px] text-muted-foreground">
                            Junior
                          </span>
                        )}
                      </div>
                      <Switch
                        checked={isGradeEnabled(grade)}
                        onCheckedChange={(v) => toggleGrade(grade, v)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-seed carousels toggle (dormant by default). Turns a round's
              APPROVED match-summary drafts into a carousel set. */}
          <div className="flex items-start justify-between gap-3 border rounded p-3">
            <div>
              <div className="font-medium">Auto-Seed Round Carousels</div>
              <div className="text-xs text-muted-foreground">
                When a round's match-summary drafts are approved, assemble them
                into one carousel set (re-running updates the same set)
              </div>
            </div>
            <Switch
              checked={autoseedEnabled}
              onCheckedChange={setAutoseedEnabled}
            />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
