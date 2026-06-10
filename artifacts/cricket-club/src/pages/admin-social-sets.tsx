import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCardSets,
  getListCardSetsQueryKey,
  useCreateCardSet,
  useUpdateCardSet,
  useDeleteCardSet,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  useListMatches,
  useGetMatch,
  getGetMatchQueryKey,
  useListPlayers,
  getListPlayersQueryKey,
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  type SocialSettingsBundle,
  type CardSet,
  type CardSetSlide,
  type CardTheme as ApiCardTheme,
  type CardLayoutLayer,
  type Stat,
  type Player,
  type MatchSummary as MatchSummaryDto,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  Download,
  GripVertical,
  Wand2,
  Save,
  Film,
  Image as ImageIcon,
  Copy,
  Globe,
  Lock,
} from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState, QueryError } from "@/components/data-states";
import { CardLayoutEditor } from "@/components/card-layout-editor";
import { matchToSummaryInput, seasonLabel } from "@/lib/match-summary";
import {
  SIZES,
  renderShareCard,
  renderShareCardVideo,
  isAnimatedCard,
  canExportVideo,
  downloadBlob,
  sponsorAppliesToKind,
  type CardSize,
  type ShareCardInput,
  type RenderOptions,
  type MotionPreset,
  type StatLine,
} from "@/lib/share-card";

const MOTION_OPTIONS: { value: MotionPreset; label: string }[] = [
  { value: "none", label: "No animation (still PNG)" },
  { value: "fadeIn", label: "Fade in" },
  { value: "countUp", label: "Count up numbers" },
];

const MIN_SLIDES = 2;
const MAX_SLIDES = 10;

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

// Working copy of a slide. The persisted `CardSetSlide.input` is opaque jsonb;
// in the editor we treat it as a concrete `ShareCardInput` so the renderer,
// studio editor and pickers can all share one type.
type WorkingSlide = {
  id: string;
  input: ShareCardInput;
  layout?: CardLayoutLayer[];
  themeId?: number | null;
  motionPreset?: MotionPreset;
};

const newId = () =>
  `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const toWorking = (s: CardSetSlide): WorkingSlide => ({
  id: s.id,
  input: s.input as unknown as ShareCardInput,
  layout: s.layout ?? undefined,
  themeId: s.themeId ?? null,
  motionPreset: (s.motionPreset as MotionPreset | undefined) ?? "none",
});

const toApiSlide = (s: WorkingSlide): CardSetSlide => ({
  id: s.id,
  input: s.input as unknown as CardSetSlide["input"],
  layout: s.layout && s.layout.length ? s.layout : undefined,
  themeId: s.themeId ?? null,
  motionPreset: s.motionPreset ?? "none",
});

// Short human label for a bound slide so the filmstrip is scannable.
function slideLabel(input: ShareCardInput): string {
  switch (input.kind) {
    case "matchSummary":
      return input.matchTitle;
    case "player":
      return input.playerName;
    case "gradeLeader":
      return `${input.playerName} — ${input.grade}`;
    case "record":
      return `${input.title}: ${input.playerName}`;
    default:
      return input.kind;
  }
}

export default function AdminSocialSets() {
  const [openId, setOpenId] = useState<number | null>(null);

  if (openId != null) {
    return <SetEditor id={openId} onBack={() => setOpenId(null)} />;
  }
  return <SetList onOpen={setOpenId} />;
}

/* --------------------------------------------------------------- Set list */

function SetList({ onOpen }: { onOpen: (id: number) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const setsQ = useListCardSets({
    query: { queryKey: getListCardSetsQueryKey() },
  });
  const sets = (setsQ.data ?? []) as CardSet[];
  const [name, setName] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListCardSetsQueryKey() });
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
        Build a linked carousel — 2 to 10 branded slides that post together.
        Bind each slide to real club data, reorder, design, then export the whole
        set as numbered images at one platform size.
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
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || create.isPending}
            >
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
        <p className="text-sm text-muted-foreground">
          No carousel sets yet. Create one above.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => (
            <Card key={s.id} className="hover:border-primary transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.isPublished
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.isPublished ? (
                      <Globe className="h-2.5 w-2.5" />
                    ) : (
                      <Lock className="h-2.5 w-2.5" />
                    )}
                    {s.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {s.slides.length} slide{s.slides.length === 1 ? "" : "s"} ·{" "}
                  {SIZES[(s.platformSize as CardSize) in SIZES ? (s.platformSize as CardSize) : "square"].label}
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

/* ------------------------------------------------------------- Set editor */

function SetEditor({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const setsQ = useListCardSets({
    query: { queryKey: getListCardSetsQueryKey() },
  });
  const set = useMemo(
    () => ((setsQ.data ?? []) as CardSet[]).find((s) => s.id === id) ?? null,
    [setsQ.data, id],
  );

  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const themesQ = useListCardThemes({
    query: { queryKey: getListCardThemesQueryKey() },
  });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];

  const update = useUpdateCardSet({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getListCardSetsQueryKey() }),
    },
  });

  const [name, setName] = useState("");
  const [platformSize, setPlatformSize] = useState<CardSize>("square");
  const [slides, setSlides] = useState<WorkingSlide[]>([]);
  const [published, setPublished] = useState(false);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [exporting, setExporting] = useState(false);
  const loadedFor = useRef<number | null>(null);

  // Seed local working state once the set arrives.
  useEffect(() => {
    if (!set || loadedFor.current === set.id) return;
    setName(set.name);
    setPlatformSize(
      (set.platformSize as CardSize) in SIZES
        ? (set.platformSize as CardSize)
        : "square",
    );
    setSlides(set.slides.map(toWorking));
    setPublished(set.isPublished);
    loadedFor.current = set.id;
  }, [set]);

  const enabledSizes: CardSize[] = useMemo(() => {
    const s = bundle?.settings;
    const out: CardSize[] = [];
    if (!s || s.sizeSquare) out.push("square");
    if (!s || s.sizePortrait) out.push("portrait");
    if (!s || s.sizeStory) out.push("story");
    return out.length ? out : ["square"];
  }, [bundle]);

  const clubUrl = bundle?.settings.clubUrl ?? "hallsheadcricket.com.au";
  const hashtag = bundle?.settings.clubHashtag ?? "#HHCC";

  // Render options for one slide at a given size. Junior slides are locked to
  // the brown palette (no theme); sponsors are filtered per slide kind.
  const buildSlideOpts = (slide: WorkingSlide, size: CardSize): RenderOptions => {
    const isJunior =
      "junior" in slide.input &&
      (slide.input as { junior?: boolean }).junior === true;
    const theme = isJunior
      ? undefined
      : themes.find((t) => t.id === slide.themeId);
    const sponsors =
      bundle?.settings.sponsorsEnabled && bundle?.activeSponsors
        ? bundle.activeSponsors
            .filter((sp) => sponsorAppliesToKind(sp.cardKinds, slide.input.kind))
            .map((sp) => ({ name: sp.name, logoUrl: sp.logoUrl }))
        : [];
    return {
      size,
      sponsors,
      clubUrl,
      hashtag,
      theme,
      brand: bundle?.brand,
      layout: slide.layout ?? [],
      motionPreset: slide.motionPreset ?? "none",
    };
  };

  // Filmstrip previews — one still PNG per slide at the chosen platform size.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const slidesSig = useMemo(
    () =>
      JSON.stringify(
        slides.map((s) => ({
          id: s.id,
          input: s.input,
          layout: s.layout ?? null,
          themeId: s.themeId ?? null,
        })),
      ),
    [slides],
  );
  useEffect(() => {
    if (!bundle) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const slide of slides) {
        try {
          const blob = await renderShareCard(
            slide.input,
            buildSlideOpts(slide, platformSize),
          );
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next[slide.id] = url;
        } catch {
          // ignore a single slide's render failure
        }
      }
      if (!cancelled) setPreviews(next);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slidesSig, platformSize, bundle, themes]);

  const selectedSlide = slides.find((s) => s.id === selectedSlideId) ?? null;

  const addSlide = (input: ShareCardInput) => {
    if (slides.length >= MAX_SLIDES) return;
    const slide: WorkingSlide = {
      id: newId(),
      input,
      themeId: null,
      motionPreset: "none",
    };
    setSlides((arr) => [...arr, slide]);
    setSelectedSlideId(slide.id);
  };

  const removeSlide = (sid: string) => {
    setSlides((arr) => arr.filter((s) => s.id !== sid));
    if (selectedSlideId === sid) setSelectedSlideId(null);
  };

  // Insert an independent clone of a slide right after it (new id + deep-copied
  // input/layout so editing the copy never mutates the original).
  const duplicateSlide = (sid: string) => {
    if (slides.length >= MAX_SLIDES) return;
    setSlides((arr) => {
      const idx = arr.findIndex((s) => s.id === sid);
      if (idx === -1) return arr;
      const src = arr[idx];
      const clone: WorkingSlide = {
        id: newId(),
        input: JSON.parse(JSON.stringify(src.input)) as ShareCardInput,
        layout: src.layout
          ? (JSON.parse(JSON.stringify(src.layout)) as CardLayoutLayer[])
          : undefined,
        themeId: src.themeId ?? null,
        motionPreset: src.motionPreset ?? "none",
      };
      const next = [...arr];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };

  const patchSlide = (sid: string, patch: Partial<WorkingSlide>) =>
    setSlides((arr) =>
      arr.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
    );

  // Native HTML5 drag-and-drop reorder (no extra dnd library).
  const dragFrom = useRef<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setSlides((arr) => {
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSave = (overridePublished?: boolean) => {
    const nextPublished = overridePublished ?? published;
    if (overridePublished !== undefined) setPublished(overridePublished);
    update.mutate({
      id,
      data: {
        name: name.trim() || "Untitled set",
        platformSize,
        slides: slides.map(toApiSlide),
        isPublished: nextPublished,
      },
    });
  };

  // Publishing requires a complete carousel (2-10 slides); the server enforces
  // this too, but we gate the button so the admin gets immediate feedback.
  const canPublish = slides.length >= MIN_SLIDES && slides.length <= MAX_SLIDES;
  const togglePublish = () => {
    if (!published && !canPublish) return;
    handleSave(!published);
  };

  const handleExport = async () => {
    if (slides.length < MIN_SLIDES) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const size = platformSize;
      const videoOk = canExportVideo();
      let i = 1;
      for (const slide of slides) {
        const num = String(i).padStart(2, "0");
        const base = `${num}-${slide.input.kind}`;
        const opts = buildSlideOpts(slide, size);
        const blob = await renderShareCard(slide.input, opts);
        zip.file(`${base}.png`, blob);
        const animated = isAnimatedCard({
          size,
          template: null,
          motionPreset: slide.motionPreset ?? "none",
        });
        if (animated && videoOk) {
          try {
            const { blob: vblob, ext } = await renderShareCardVideo(
              slide.input,
              opts,
            );
            zip.file(`${base}.${ext}`, vblob);
          } catch {
            // still PNG already included; skip the clip on failure
          }
        }
        i++;
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const safe = (name.trim() || "carousel")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      downloadBlob(zipBlob, `${safe || "carousel"}-${SIZES[size].code}.zip`);
    } finally {
      setExporting(false);
    }
  };

  if (setsQ.isLoading) return <LoadingState label="Loading set…" />;
  if (!set) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to sets
        </Button>
        <QueryError onRetry={() => setsQ.refetch()} />
      </div>
    );
  }

  const tooFew = slides.length < MIN_SLIDES;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Size</Label>
          <select
            className={selectClass + " w-44"}
            value={platformSize}
            onChange={(e) => setPlatformSize(e.target.value as CardSize)}
          >
            {enabledSizes.map((s) => (
              <option key={s} value={s}>
                {SIZES[s].label} ({SIZES[s].code})
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              published
                ? "bg-emerald-100 text-emerald-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {published ? (
              <Globe className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            {published ? "Published" : "Draft"}
          </span>
          <Button
            onClick={() => handleSave()}
            disabled={update.isPending}
            variant="secondary"
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
          <Button
            onClick={togglePublish}
            disabled={update.isPending || (!published && !canPublish)}
            variant={published ? "outline" : "default"}
          >
            {published ? (
              <Lock className="h-4 w-4 mr-2" />
            ) : (
              <Globe className="h-4 w-4 mr-2" />
            )}
            {published ? "Unpublish" : "Publish"}
          </Button>
          <Button onClick={handleExport} disabled={exporting || tooFew}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export set (zip)
          </Button>
        </div>
      </div>

      {tooFew && (
        <p className="text-xs text-amber-600">
          A carousel needs at least {MIN_SLIDES} slides before it can be exported
          or published.
        </p>
      )}

      {/* Filmstrip */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Slides ({slides.length}/{MAX_SLIDES})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {slides.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No slides yet — add one from the sources below.
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {slides.map((slide, idx) => (
                <div
                  key={slide.id}
                  draggable
                  onDragStart={() => (dragFrom.current = idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom.current != null) reorder(dragFrom.current, idx);
                    dragFrom.current = null;
                  }}
                  onClick={() => setSelectedSlideId(slide.id)}
                  className={`relative shrink-0 w-32 cursor-pointer rounded-md border-2 p-1 transition-colors ${
                    selectedSlideId === slide.id
                      ? "border-primary"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  <div className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] font-bold text-white">
                    {idx + 1}
                  </div>
                  <div className="absolute right-1 top-1 z-10 flex gap-1">
                    <button
                      type="button"
                      title="Duplicate slide"
                      disabled={slides.length >= MAX_SLIDES}
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateSlide(slide.id);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title="Remove slide"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSlide(slide.id);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div
                    className="flex items-center justify-center overflow-hidden rounded bg-muted"
                    style={{
                      aspectRatio: `${SIZES[platformSize].w} / ${SIZES[platformSize].h}`,
                    }}
                  >
                    {previews[slide.id] ? (
                      <img
                        src={previews[slide.id]}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <GripVertical className="h-3 w-3 shrink-0" />
                    <span className="truncate">{slideLabel(slide.input)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected slide design controls */}
      {selectedSlide && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Slide {slides.findIndex((s) => s.id === selectedSlide.id) + 1} —{" "}
              {slideLabel(selectedSlide.input)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingLayout ? (
              <CardLayoutEditor
                input={selectedSlide.input}
                baseOpts={buildSlideOpts(selectedSlide, platformSize)}
                activeSize={platformSize}
                onClose={() => setEditingLayout(false)}
                controlledLayout={selectedSlide.layout ?? []}
                onSaveLayout={(layers) =>
                  patchSlide(selectedSlide.id, { layout: layers })
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">Motion</Label>
                  <select
                    className={selectClass}
                    value={selectedSlide.motionPreset ?? "none"}
                    onChange={(e) =>
                      patchSlide(selectedSlide.id, {
                        motionPreset: e.target.value as MotionPreset,
                      })
                    }
                  >
                    {MOTION_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!(
                  "junior" in selectedSlide.input &&
                  (selectedSlide.input as { junior?: boolean }).junior
                ) &&
                  themes.length > 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-sm">Card theme</Label>
                      <select
                        className={selectClass}
                        value={selectedSlide.themeId ?? ""}
                        onChange={(e) =>
                          patchSlide(selectedSlide.id, {
                            themeId: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">Default theme</option>
                        {themes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.isDefault ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                <div className="md:col-span-2 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingLayout(true)}
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-1" />
                    {selectedSlide.layout && selectedSlide.layout.length
                      ? "Edit layout"
                      : "Customise layout"}
                  </Button>
                  {selectedSlide.layout && selectedSlide.layout.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Custom layout applied
                    </span>
                  )}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {isAnimatedCard({
                      size: platformSize,
                      template: null,
                      motionPreset: selectedSlide.motionPreset ?? "none",
                    }) ? (
                      <>
                        <Film className="h-3.5 w-3.5" /> Exports a video clip
                      </>
                    ) : (
                      <>
                        <ImageIcon className="h-3.5 w-3.5" /> Still image
                      </>
                    )}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add-slide sources */}
      {slides.length < MAX_SLIDES && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add a slide</CardTitle>
          </CardHeader>
          <CardContent>
            <SlideSourcePicker onAdd={addSlide} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------- Slide source UI */

function SlideSourcePicker({ onAdd }: { onAdd: (i: ShareCardInput) => void }) {
  return (
    <Tabs defaultValue="match">
      <TabsList>
        <TabsTrigger value="match">Match</TabsTrigger>
        <TabsTrigger value="player">Player</TabsTrigger>
        <TabsTrigger value="gradeLeader">Grade leader</TabsTrigger>
      </TabsList>
      <TabsContent value="match" className="mt-4">
        <MatchSource onAdd={onAdd} />
      </TabsContent>
      <TabsContent value="player" className="mt-4">
        <PlayerSource onAdd={onAdd} />
      </TabsContent>
      <TabsContent value="gradeLeader" className="mt-4">
        <GradeLeaderSource onAdd={onAdd} />
      </TabsContent>
    </Tabs>
  );
}

function MatchSource({ onAdd }: { onAdd: (i: ShareCardInput) => void }) {
  const [grade, setGrade] = useState(GRADES[0]);
  const [season, setSeason] = useState<number | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);

  const matchesQ = useListMatches({ grade });
  const matches = (matchesQ.data ?? []) as MatchSummaryDto[];
  const seasons = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((m) => set.add(m.season));
    return [...set].sort((a, b) => b - a);
  }, [matches]);
  const effectiveSeason = season ?? seasons[0] ?? null;
  const filtered = useMemo(
    () => matches.filter((m) => m.season === effectiveSeason),
    [matches, effectiveSeason],
  );
  const detailQ = useGetMatch(matchId ?? 0, {
    query: {
      enabled: matchId != null,
      queryKey: getGetMatchQueryKey(matchId ?? 0),
    },
  });

  const matchLabel = (m: MatchSummaryDto) => {
    const round = m.stage ?? (m.round != null ? `Round ${m.round}` : "Match");
    return `${round} — vs ${m.opponent ?? "Unknown"}${m.result ? ` (${m.result})` : ""}`;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select
          className={selectClass}
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            setSeason(null);
            setMatchId(null);
          }}
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={effectiveSeason ?? ""}
          disabled={seasons.length === 0}
          onChange={(e) => {
            setSeason(e.target.value ? Number(e.target.value) : null);
            setMatchId(null);
          }}
        >
          {seasons.length === 0 && <option value="">No matches</option>}
          {seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={matchId ?? ""}
          disabled={filtered.length === 0}
          onChange={(e) => setMatchId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">
            {filtered.length === 0 ? "No matches" : "Select a match…"}
          </option>
          {filtered.map((m) => (
            <option key={m.id} value={m.id}>
              {matchLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => detailQ.data && onAdd(matchToSummaryInput(detailQ.data))}
          disabled={matchId == null || detailQ.isLoading || !detailQ.data}
        >
          {detailQ.isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add match slide
        </Button>
      </div>
    </div>
  );
}

function PlayerSource({ onAdd }: { onAdd: (i: ShareCardInput) => void }) {
  const [search, setSearch] = useState("");
  const params = { search: search.trim(), limit: 15 };
  const playersQ = useListPlayers(params, {
    query: {
      enabled: search.trim().length > 1,
      queryKey: getListPlayersQueryKey(params),
    },
  });
  const players = playersQ.data?.players ?? [];

  const playerToInput = (p: Player): ShareCardInput => {
    const stats: StatLine[] = [
      { label: "Games", value: p.totalGames ?? 0 },
      { label: "Runs", value: p.totalRuns ?? 0 },
      { label: "Wickets", value: p.totalWickets ?? 0 },
    ];
    if ((p.premiershipsWon ?? 0) > 0) {
      stats.push({ label: "Premierships", value: p.premiershipsWon ?? 0 });
    }
    return {
      kind: "player",
      playerName: `${p.givenName} ${p.surname}`.trim(),
      gradesPlayed: p.gradesPlayed,
      stats,
      photoUrl: p.imageUrl,
    };
  };

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players by name…"
      />
      {search.trim().length > 1 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {playersQ.isLoading ? (
            <LoadingState label="Searching…" />
          ) : players.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players found.</p>
          ) : (
            players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAdd(playerToInput(p))}
                className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:border-primary"
              >
                <span>
                  {p.givenName} {p.surname}
                </span>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GradeLeaderSource({ onAdd }: { onAdd: (i: ShareCardInput) => void }) {
  const [grade, setGrade] = useState(GRADES[0]);
  const [category, setCategory] = useState<"Runs" | "Wickets">("Runs");
  const statsQ = useGetGradeLeaderboard(grade, {
    query: { queryKey: getGetGradeLeaderboardQueryKey(grade) },
  });
  const stats = (statsQ.data ?? []) as Stat[];
  const ranked = useMemo(() => {
    const val = (s: Stat) => (category === "Runs" ? s.runs ?? 0 : s.wickets ?? 0);
    return [...stats]
      .filter((s) => val(s) > 0)
      .sort((a, b) => val(b) - val(a))
      .slice(0, 12);
  }, [stats, category]);

  const toInput = (s: Stat): ShareCardInput => ({
    kind: "gradeLeader",
    grade,
    category,
    playerName: `${s.givenName} ${s.surname}`.trim(),
    value: category === "Runs" ? s.runs ?? 0 : s.wickets ?? 0,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          className={selectClass}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as "Runs" | "Wickets")}
        >
          <option value="Runs">Most runs</option>
          <option value="Wickets">Most wickets</option>
        </select>
      </div>
      {statsQ.isLoading ? (
        <LoadingState label="Loading leaderboard…" />
      ) : ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stats for this grade.</p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {ranked.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAdd(toInput(s))}
              className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:border-primary"
            >
              <span>
                {s.givenName} {s.surname}
              </span>
              <span className="font-mono text-muted-foreground">
                {category === "Runs" ? s.runs ?? 0 : s.wickets ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
