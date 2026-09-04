import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCardSets,
  getListCardSetsQueryKey,
  useUpdateCardSet,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  useListCardTemplates,
  getListCardTemplatesQueryKey,
  useCreateCardRenderStill,
  type SocialSettingsBundle,
  type CardSet,
  type CardTheme as ApiCardTheme,
  type CardTemplate,
  type CardLayoutLayer,
} from "@workspace/api-client-react";
import {
  SIZES,
  renderShareCard,
  isAnimatedCard,
  downloadBlob,
  type CardSize,
  type ShareCardInput,
  type RenderOptions,
} from "@/lib/share-card";
import { renderShareCardVideo, canExportVideo } from "@/lib/share-card-animation";
import { type PackCardData } from "@/lib/pack-render";
import {
  buildPackData,
  tenantHashtag,
  kindSponsors,
  presentingSponsorName,
} from "@/lib/pack-card-data";
import { slideRendersViaPack } from "@/lib/carousel-slide-render";
import { resolvePackIdForKind } from "@/lib/card-template";
import { MAX_SLIDES, MIN_SLIDES, newId, toApiSlide, toWorking, type WorkingSlide } from "./model";

/**
 * Editor state for one carousel set: the working slides, per-slide render
 * helpers (theme / sponsors / pack routing), filmstrip previews, slide
 * add/remove/duplicate/reorder, save/publish and the zip export.
 */
export function useSetEditor(id: number) {
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
  // Pack template rows — which design pack each slide's kind renders through.
  const templatesQ = useListCardTemplates({
    query: { queryKey: getListCardTemplatesQueryKey() },
  });

  const update = useUpdateCardSet({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListCardSetsQueryKey() }),
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
      (set.platformSize as CardSize) in SIZES ? (set.platformSize as CardSize) : "square",
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

  // A brand-less tenant gets no clubUrl/hashtag rather than another club's.
  const clubUrl = bundle?.settings.clubUrl ?? "";
  const hashtag = tenantHashtag(bundle);

  // Server-side still harness for pack (Broadcast Dark) slides — the same
  // endpoint the single-card modal uses, so a batched carousel slide exports a
  // pixel-true branded PNG identical to the single card of that kind.
  const stillMutation = useCreateCardRenderStill();

  // Sponsor strip is on for the whole set whenever the tenant has it enabled;
  // the carousel has no per-set toggle (mirrors the modal's default-on state).
  const sponsorsOn = !!bundle?.settings.sponsorsEnabled;

  const slideIsJunior = (slide: WorkingSlide): boolean =>
    "junior" in slide.input && (slide.input as { junior?: boolean }).junior === true;

  // Junior slides are locked to the brown palette (no theme); otherwise the
  // slide's chosen theme (or the default when unset).
  const slideTheme = (slide: WorkingSlide) =>
    slideIsJunior(slide) ? undefined : themes.find((t) => t.id === slide.themeId);

  // Active sponsors filtered to the slide's kind (same predicate the modal uses).
  const slideSponsors = (slide: WorkingSlide): { name: string; logoUrl: string }[] =>
    kindSponsors(bundle, slide.input.kind, sponsorsOn);

  // The tenant's designated presenting (primary) sponsor NAME → the pack cards'
  // "presented by <sponsor>" line. NOT kind-filtered (headline sponsor shown on
  // every slide), gated on the same sponsors-on condition the slide uses so the
  // line stays consistent with the single-card modal (else it drops to "" and
  // `dropEmptyPresentedBy` removes the line — the carousel regression this fixes).
  const presentingSponsor = presentingSponsorName(bundle, sponsorsOn);

  // A slide renders through the pack when the pack supports its kind and it has
  // no admin custom layout (a canvas-only feature the pack can't reproduce).
  /** The pack this slide's kind renders through (null = default pack). */
  const slidePackId = (slide: WorkingSlide): string | null =>
    resolvePackIdForKind(templatesQ.data as CardTemplate[] | undefined, slide.input.kind);

  const slideUsesPack = (slide: WorkingSlide): boolean =>
    slideRendersViaPack(slide.input.kind, slide.layout, slidePackId(slide));

  // Tenant data threaded into the pack path (logo, club name/hashtag, sponsors,
  // the input's own photo) — the pack equivalent of the brand/sponsors the
  // canvas renderer gets via `buildSlideOpts`.
  //
  // Built through the shared `buildPackData` so slides carry the tenant's FULL
  // brand. This used to narrow `brand` to `{ name, logoUrl }`, which dropped
  // `primaryColour` / `juniorsColour` / `tagline` — so `brandDefaultTokens`
  // fell back to the Broadcast-Dark palette and every carousel slide rendered
  // in Halls Head gold regardless of tenant.
  const buildSlidePackData = (slide: WorkingSlide): PackCardData =>
    buildPackData({
      brand: bundle?.brand,
      hashtag,
      sponsors: slideSponsors(slide),
      presentingSponsorName: presentingSponsor,
    });

  // Render one pack slide to a PNG blob via the server harness (parity with the
  // single-card modal's `renderPackStill`; options are opaque over the wire).
  const renderPackStill = (slide: WorkingSlide, size: CardSize): Promise<Blob> =>
    stillMutation.mutateAsync({
      data: {
        input: slide.input,
        options: {
          size,
          sponsorsOn,
          junior: slideIsJunior(slide),
          theme: slideTheme(slide) ?? null,
          data: buildSlidePackData(slide),
          // Must match the filmstrip preview's pack or the exported PNG is a
          // different design from what the admin approved.
          packId: slidePackId(slide),
        },
      },
    }) as Promise<Blob>;

  // Render options for one slide at a given size (canvas path — unsupported
  // kinds and admin-customised slides). Junior slides are locked to the brown
  // palette (no theme); sponsors are filtered per slide kind.
  const buildSlideOpts = (slide: WorkingSlide, size: CardSize): RenderOptions => ({
    size,
    sponsors: slideSponsors(slide),
    clubUrl,
    hashtag,
    theme: slideTheme(slide),
    brand: bundle?.brand,
    layout: slide.layout ?? [],
    motionPreset: slide.motionPreset ?? "none",
  });

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
        // Pack slides preview live via <PackCard> in the filmstrip; only the
        // canvas (BYO / customised) slides need an offscreen render here.
        if (slideUsesPack(slide)) continue;
        try {
          const blob = await renderShareCard(slide.input, buildSlideOpts(slide, platformSize));
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

  // Batch-append several slides at once (carousel "add all…" actions), clamped
  // to the 2–10 slide cap. Extra inputs beyond the remaining room are dropped
  // silently, matching addSlide's single-slot behaviour.
  const addSlides = (inputs: ShareCardInput[]) => {
    if (inputs.length === 0) return;
    setSlides((arr) => {
      const room = MAX_SLIDES - arr.length;
      if (room <= 0) return arr;
      const added: WorkingSlide[] = inputs.slice(0, room).map((input) => ({
        id: newId(),
        input,
        themeId: null,
        motionPreset: "none",
      }));
      return [...arr, ...added];
    });
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
    setSlides((arr) => arr.map((s) => (s.id === sid ? { ...s, ...patch } : s)));

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
        if (slideUsesPack(slide)) {
          // Pack slide: pixel-true branded PNG via the server harness, matching
          // the single-card path. Pack cards are static (KTD10) — no video clip.
          const blob = await renderPackStill(slide, size);
          zip.file(`${base}.png`, blob);
          i++;
          continue;
        }
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
            const { blob: vblob, ext } = await renderShareCardVideo(slide.input, opts);
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

  const tooFew = slides.length < MIN_SLIDES;

  return {
    setsQ,
    set,
    themes,
    update,
    name,
    setName,
    platformSize,
    setPlatformSize,
    slides,
    published,
    selectedSlideId,
    setSelectedSlideId,
    selectedSlide,
    editingLayout,
    setEditingLayout,
    exporting,
    enabledSizes,
    sponsorsOn,
    slideIsJunior,
    slideTheme,
    slidePackId,
    slideUsesPack,
    buildSlidePackData,
    buildSlideOpts,
    previews,
    addSlide,
    addSlides,
    removeSlide,
    duplicateSlide,
    patchSlide,
    dragFrom,
    reorder,
    handleSave,
    canPublish,
    togglePublish,
    handleExport,
    tooFew,
  };
}

export type SetEditorState = ReturnType<typeof useSetEditor>;
