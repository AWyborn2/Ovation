import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  useListCardTemplates,
  getListCardTemplatesQueryKey,
  useListCardLayouts,
  getListCardLayoutsQueryKey,
  type SocialSettingsBundle,
  type CardTheme as ApiCardTheme,
  type CardTemplate,
  type CardLayout,
  type CardLayoutLayer,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Copy, Check } from "lucide-react";
import {
  SIZES,
  renderShareCard,
  renderShareCardVideo,
  renderShareCardGif,
  isAnimatedCard,
  canExportVideo,
  canExportGif,
  videoFormatLabel,
  DEFAULT_DURATION_MS,
  downloadBlob,
  cardBaseFilename,
  type CardSize,
  type ShareCardInput,
  type PhotoTransform,
  type MotionPreset,
  type RenderOptions,
} from "@/lib/share-card";
import { templateAppliesToKind } from "@/lib/card-template";
import { CardLayoutEditor } from "@/components/card-layout-editor";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { Wand2 } from "lucide-react";
import { PLATFORM_LIMITS } from "@/lib/captions";
import { PLATFORMS, MOTION_OPTIONS, LENGTH_OPTIONS, SPEED_OPTIONS, type EngineKey, type Props } from "@/components/share-card-modal/constants";
import { AnimatedCardPreview } from "@/components/share-card-modal/animated-card-preview";
import { usePhotoControls } from "@/components/share-card-modal/use-photo-controls";
import { PhotoControls } from "@/components/share-card-modal/photo-controls";
import { useCaptions } from "@/components/share-card-modal/use-captions";
import { useSponsors } from "@/components/share-card-modal/use-sponsors";
import { useCardPreview } from "@/components/share-card-modal/use-card-preview";
import { useVideoExport } from "@/components/share-card-modal/use-video-export";

export type { EngineKey } from "@/components/share-card-modal/constants";

export function ShareCardModal({
  open,
  onOpenChange,
  input,
  engine = "ondemand",
  appPath,
  trackedSlug,
  playerId,
  onApprove,
  approveLabel = "Approve & download",
}: Props) {
  const settingsQ = useGetSocialSettings({
    query: { enabled: open, queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;

  const photo = usePhotoControls({ open, playerId, input });
  const {
    showPhotoControls,
    photoPlacement,
    photoTransform,
    renderTransform,
    effectivePhotoUrl,
  } = photo;

  const themesQ = useListCardThemes({
    query: { enabled: open, queryKey: getListCardThemesQueryKey() },
  });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  useEffect(() => {
    if (!open || themes.length === 0) return;
    if (selectedThemeId !== null && themes.some((t) => t.id === selectedThemeId)) return;
    const def = themes.find((t) => t.isDefault) ?? themes[0];
    setSelectedThemeId(def.id);
  }, [open, themes, selectedThemeId]);
  // Junior cards are locked to the brown junior palette (no admin theme) and the
  // built-in layout, so we suppress theme + custom-template selection entirely.
  const isJunior =
    !!input && "junior" in input && (input as { junior?: boolean }).junior === true;
  const selectedTheme = useMemo(
    () => (isJunior ? undefined : themes.find((t) => t.id === selectedThemeId)),
    [isJunior, themes, selectedThemeId],
  );

  // Custom "bring your own" templates that apply to this card kind.
  const templatesQ = useListCardTemplates({
    query: { enabled: open, queryKey: getListCardTemplatesQueryKey() },
  });
  const applicableTemplates = useMemo<CardTemplate[]>(() => {
    if (!input) return [];
    return (templatesQ.data ?? []).filter((t) =>
      templateAppliesToKind(t, input.kind),
    );
  }, [templatesQ.data, input]);
  // `null` = built-in layout; otherwise a template id.
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [layoutTouched, setLayoutTouched] = useState(false);
  // Pre-select the default template when it applies; otherwise keep built-in.
  useEffect(() => {
    if (!open || layoutTouched) return;
    const def = applicableTemplates.find((t) => t.isDefault);
    if (def) setLayoutId(def.id);
  }, [open, layoutTouched, applicableTemplates]);
  // Reset the layout choice each time the modal opens or the card changes.
  useEffect(() => {
    if (open) {
      setLayoutId(null);
      setLayoutTouched(false);
      setMotion("none");
      setMotionTouched(false);
    }
  }, [open, input]);
  const selectedTemplate = useMemo<CardTemplate | null>(
    () =>
      isJunior || layoutId === null
        ? null
        : applicableTemplates.find((t) => t.id === layoutId) ?? null,
    [isJunior, layoutId, applicableTemplates],
  );

  // Admin-only layer authoring. The saved custom layout (if any) drives every
  // render — preview, PNG and zip — for both admins and the public; only admins
  // get the "Customise layout" editor.
  const adminQ = useCurrentAdmin();
  const isAdmin = !!adminQ.data;
  const layoutsQ = useListCardLayouts({
    query: { enabled: open, queryKey: getListCardLayoutsQueryKey() },
  });
  const savedLayout = useMemo<CardLayoutLayer[]>(() => {
    if (!input) return [];
    const row = (layoutsQ.data as CardLayout[] | undefined)?.find(
      (l) => l.cardKind === input.kind,
    );
    return row?.layers ?? [];
  }, [layoutsQ.data, input]);
  const layoutSig = useMemo(
    () => (savedLayout.length ? JSON.stringify(savedLayout) : "none"),
    [savedLayout],
  );
  const [editingLayout, setEditingLayout] = useState(false);
  useEffect(() => {
    if (!open) setEditingLayout(false);
  }, [open]);

  // Motion preset. Defaults to the selected template's own preset (so an
  // animated template animates out of the box) until the club picks one.
  const [motion, setMotion] = useState<MotionPreset>("none");
  const [motionTouched, setMotionTouched] = useState(false);
  useEffect(() => {
    if (!open || motionTouched) return;
    setMotion((selectedTemplate?.motionPreset as MotionPreset | undefined) ?? "none");
  }, [open, motionTouched, selectedTemplate]);

  // Admin-only clip length + speed controls (safe bounds enforced in the engine).
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_DURATION_MS);
  const [speed, setSpeed] = useState<number>(1);
  useEffect(() => {
    if (!open) {
      setDurationMs(DEFAULT_DURATION_MS);
      setSpeed(1);
    }
  }, [open]);

  const enabledSizes: CardSize[] = useMemo(() => {
    const s = bundle?.settings;
    const out: CardSize[] = [];
    if (!s || s.sizeSquare) out.push("square");
    if (!s || s.sizePortrait) out.push("portrait");
    if (!s || s.sizeStory) out.push("story");
    return out.length ? out : ["square"];
  }, [bundle]);

  const [activeSize, setActiveSize] = useState<CardSize>("square");

  // A video/GIF template always animates; otherwise the motion preset decides.
  const animated = useMemo(
    () => isAnimatedCard({ size: activeSize, template: selectedTemplate, motionPreset: motion }),
    [activeSize, selectedTemplate, motion],
  );
  const videoSupported = useMemo(() => canExportVideo(), []);
  const videoFormat = useMemo(() => videoFormatLabel(), []);
  const [includeSponsors, setIncludeSponsors] = useState(true);
  const [zipping, setZipping] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (open && enabledSizes.length > 0 && !enabledSizes.includes(activeSize)) {
      setActiveSize(enabledSizes[0]);
    }
  }, [open, enabledSizes, activeSize]);

  const { sponsors, sponsorSig } = useSponsors({ bundle, includeSponsors, input });

  const clubUrl = bundle?.settings.clubUrl ?? "hallsheadcricket.com.au";
  const hashtag = bundle?.settings.clubHashtag ?? "#HHCC";

  const {
    platform,
    setPlatform,
    captionDraft,
    setCaptionDraft,
    captionDrafts,
    copied,
    handleCopyCaption,
  } = useCaptions({ open, input, bundle, engine, appPath, trackedSlug, clubUrl, hashtag });

  // Build the render options shared by the still preview, PNG/zip export and the
  // animated preview/video export. `transform` is supplied separately because
  // the preview uses a debounced transform while downloads use the live one.
  const buildOpts = (size: CardSize, transform: PhotoTransform): RenderOptions => ({
    size,
    sponsors,
    clubUrl,
    hashtag,
    theme: selectedTheme,
    brand: bundle?.brand,
    template: selectedTemplate,
    layout: savedLayout,
    photoUrl: effectivePhotoUrl,
    photoPlacement,
    photoTransform: transform,
    motionPreset: motion,
    durationMs,
    speed,
  });

  const { previewUrls, rendering } = useCardPreview({
    open,
    input,
    animated,
    activeSize,
    renderTransform,
    buildOpts,
    renderDeps: [open, input, activeSize, sponsors, clubUrl, hashtag, selectedTheme, selectedTemplate, layoutSig, effectivePhotoUrl, photoPlacement, renderTransform],
    invalidateDeps: [includeSponsors, input, selectedThemeId, layoutId, layoutSig, sponsorSig, effectivePhotoUrl, photoPlacement, renderTransform],
  });

  const {
    videoExporting,
    videoPreview,
    handleDownloadVideo,
    handleSaveVideo,
    closeVideoPreview,
    gifExporting,
    gifSupported,
    handleDownloadGif,
  } = useVideoExport({ open, input, buildOpts, photoTransform });

  // Stable key for the animated preview so it only re-prepares when something
  // that affects the animation actually changes.
  const animSig = useMemo(
    () =>
      [
        activeSize,
        layoutId ?? "builtin",
        selectedThemeId ?? "none",
        motion,
        durationMs,
        speed,
        effectivePhotoUrl ?? "nophoto",
        photoPlacement,
        `${renderTransform.focalX},${renderTransform.focalY},${renderTransform.zoom}`,
        sponsorSig,
      ].join("|"),
    [activeSize, layoutId, selectedThemeId, motion, durationMs, speed, effectivePhotoUrl, photoPlacement, renderTransform, sponsorSig],
  );

  const handleDownload = async (size: CardSize) => {
    if (!input) return;
    const blob = await renderShareCard(input, buildOpts(size, photoTransform));
    downloadBlob(blob, `${cardBaseFilename(input)}-${SIZES[size].code}.png`);
  };

  const handleDownloadAll = async () => {
    if (!input) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const base = cardBaseFilename(input);
      // Still posters render fast, so do them serially.
      for (const size of enabledSizes) {
        const blob = await renderShareCard(input, buildOpts(size, photoTransform));
        zip.file(`${base}-${SIZES[size].code}.png`, blob);
      }
      // Admins additionally get an animated video clip per size. Video export is
      // real-time (canvas.captureStream + MediaRecorder), so recording the sizes
      // one after another makes the wait the SUM of every clip's duration.
      // Each renderShareCardVideo uses its own offscreen canvas/stream/recorder,
      // so we record all sizes concurrently — the wait collapses to roughly a
      // single clip's duration instead of the serial sum. Admin-only: public
      // visitors only ever get the still PNG.
      if (animated && videoSupported && isAdmin) {
        const results = await Promise.all(
          enabledSizes.map((size) =>
            renderShareCardVideo(input, buildOpts(size, photoTransform))
              .then((r) => ({ size, ...r }))
              .catch((e) => {
                console.error("Card video export failed", e);
                return null;
              }),
          ),
        );
        for (const r of results) {
          if (r) zip.file(`${base}-${SIZES[r.size].code}.${r.ext}`, r.blob);
        }
      }
      // Admins additionally get a looping GIF per size (heavier, so admin-only).
      if (animated && gifSupported && isAdmin) {
        const gifs = await Promise.all(
          enabledSizes.map((size) =>
            renderShareCardGif(input, buildOpts(size, photoTransform))
              .then((r) => ({ size, ...r }))
              .catch((e) => {
                console.error("Card GIF export failed", e);
                return null;
              }),
          ),
        );
        for (const r of gifs) {
          if (r) zip.file(`${base}-${SIZES[r.size].code}.${r.ext}`, r.blob);
        }
      }
      if (bundle?.settings.captionsEnabled) {
        for (const p of PLATFORMS) {
          const caption = captionDrafts[p.value];
          if (caption) zip.file(`caption-${p.value}.txt`, caption);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `${cardBaseFilename(input)}-all.zip`);
    } finally {
      setZipping(false);
    }
  };

  const handleApproveAndDownload = async () => {
    if (!input || !onApprove) return;
    setApproving(true);
    try {
      await handleDownloadAll();
      await onApprove();
      onOpenChange(false);
    } finally {
      setApproving(false);
    }
  };

  if (!input) return null;

  const captionsEnabled = bundle?.settings.captionsEnabled !== false;
  const sponsorsAvailable = (bundle?.activeSponsors?.length ?? 0) > 0 && bundle?.settings.sponsorsEnabled;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share to socials</DialogTitle>
          <DialogDescription>
            Download a branded card for Instagram, Facebook, TikTok or X.
          </DialogDescription>
        </DialogHeader>

        {isAdmin && !selectedTemplate && input.kind !== "matchSummary" && (
          <div className="flex items-center justify-between rounded border border-dashed px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {savedLayout.length > 0
                ? "This card uses a custom layout."
                : "Move, resize and add elements to this card."}
            </span>
            {!editingLayout && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingLayout(true)}
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                Customise layout
              </Button>
            )}
          </div>
        )}

        {editingLayout && isAdmin ? (
          <CardLayoutEditor
            input={input}
            baseOpts={buildOpts(activeSize, photoTransform)}
            activeSize={activeSize}
            onClose={() => setEditingLayout(false)}
          />
        ) : (
        <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
          <div className="space-y-3">
            <Tabs value={activeSize} onValueChange={(v) => setActiveSize(v as CardSize)}>
              <TabsList className="w-full">
                {enabledSizes.map((s) => (
                  <TabsTrigger key={s} value={s} className="flex-1 text-xs">
                    {SIZES[s].label.split(" ")[0]}
                    <span className="ml-1 text-muted-foreground">{SIZES[s].code}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {enabledSizes.map((s) => (
                <TabsContent key={s} value={s} className="mt-3">
                  <div
                    className="bg-muted border rounded-md flex items-center justify-center overflow-hidden"
                    style={{ aspectRatio: `${SIZES[s].w} / ${SIZES[s].h}`, maxHeight: 500 }}
                  >
                    {animated ? (
                      <AnimatedCardPreview
                        input={input}
                        opts={buildOpts(s, renderTransform)}
                        sig={animSig}
                      />
                    ) : rendering && !previewUrls[s] ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : previewUrls[s] ? (
                      <img src={previewUrls[s]!} alt="Card preview" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Preparing preview…</span>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            {!isJunior && applicableTemplates.length > 0 && (
              <div className="space-y-1.5 rounded border px-3 py-2">
                <Label htmlFor="layout-select" className="text-sm">
                  Layout
                </Label>
                <select
                  id="layout-select"
                  value={layoutId ?? ""}
                  onChange={(e) => {
                    setLayoutTouched(true);
                    setLayoutId(e.target.value === "" ? null : Number(e.target.value));
                  }}
                  className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
                >
                  <option value="">Built-in design</option>
                  {applicableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isAdmin && (
              <div className="space-y-1.5 rounded border px-3 py-2">
                <Label htmlFor="motion-select" className="text-sm">
                  Motion
                </Label>
                <select
                  id="motion-select"
                  value={motion}
                  onChange={(e) => {
                    setMotionTouched(true);
                    setMotion(e.target.value as MotionPreset);
                  }}
                  className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
                >
                  {MOTION_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {motion !== "none" && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="length-select" className="text-xs">
                        Clip length
                      </Label>
                      <select
                        id="length-select"
                        value={durationMs}
                        onChange={(e) => setDurationMs(Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
                      >
                        {LENGTH_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="speed-select" className="text-xs">
                        Speed
                      </Label>
                      <select
                        id="speed-select"
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
                      >
                        {SPEED_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {motion === "countUp"
                    ? "Numbers tick up from zero on stat values; other elements fade in."
                    : "Adds an entrance animation; each element enters independently."}
                  {animated && videoSupported
                    ? ` Video exports as ${videoFormat}${gifSupported ? "; GIF also available" : ""}.`
                    : animated && !videoSupported
                      ? " Your browser can't record video; only the still image will download."
                      : ""}
                </p>
              </div>
            )}

            {!isJunior && selectedTemplate === null && themes.length > 1 && (
              <div className="space-y-1.5 rounded border px-3 py-2">
                <Label htmlFor="theme-select" className="text-sm">
                  Card theme
                </Label>
                <select
                  id="theme-select"
                  value={selectedThemeId ?? ""}
                  onChange={(e) => setSelectedThemeId(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sponsorsAvailable && (
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <Label htmlFor="sponsors-toggle" className="text-sm">
                  Include sponsor strip
                </Label>
                <Switch
                  id="sponsors-toggle"
                  checked={includeSponsors}
                  onCheckedChange={setIncludeSponsors}
                />
              </div>
            )}

            {showPhotoControls && (
              <PhotoControls photo={photo} activeSize={activeSize} />
            )}
          </div>

          <div className="space-y-3">
            {captionsEnabled && (
              <>
                <Tabs value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
                  <TabsList className="w-full">
                    {PLATFORMS.map((p) => (
                      <TabsTrigger key={p.value} value={p.value} className="flex-1 text-xs">
                        {p.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Textarea
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {captionDraft.length} / {PLATFORM_LIMITS[platform]}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCaption}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy caption
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleDownload(activeSize)}
          >
            <Download className="h-4 w-4 mr-2" />
            Download {SIZES[activeSize].label}
          </Button>
          {isAdmin && animated && videoSupported && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleDownloadVideo(activeSize)}
              disabled={videoExporting || gifExporting || zipping || approving}
            >
              {videoExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {videoExporting ? "Rendering…" : "Preview video"}
            </Button>
          )}
          {isAdmin && animated && gifSupported && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleDownloadGif(activeSize)}
              disabled={gifExporting || videoExporting || zipping || approving}
            >
              {gifExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {gifExporting ? "Rendering GIF…" : "Download GIF"}
            </Button>
          )}
          <Button
            type="button"
            variant={onApprove ? "secondary" : "default"}
            onClick={handleDownloadAll}
            disabled={zipping || approving || videoExporting}
          >
            {zipping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download all sizes (zip)
          </Button>
          {onApprove && (
            <Button
              type="button"
              onClick={handleApproveAndDownload}
              disabled={approving || zipping}
            >
              {approving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {approveLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={videoPreview !== null}
      onOpenChange={(o) => {
        if (!o) closeVideoPreview();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preview rendered video</DialogTitle>
          <DialogDescription>
            This is the exact {videoPreview?.ext.toUpperCase()} clip that will
            download. Play it through to check the first frame and loop seam, then
            save it or re-record.
          </DialogDescription>
        </DialogHeader>
        {videoPreview && (
          <div
            className="bg-muted border rounded-md flex items-center justify-center overflow-hidden"
            style={{
              aspectRatio: `${SIZES[videoPreview.size].w} / ${SIZES[videoPreview.size].h}`,
              maxHeight: 400,
            }}
          >
            <video
              src={videoPreview.url}
              className="w-full h-full object-contain"
              controls
              autoPlay
              loop
              playsInline
            />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => videoPreview && handleDownloadVideo(videoPreview.size)}
            disabled={videoExporting}
          >
            {videoExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {videoExporting ? "Re-recording…" : "Re-record"}
          </Button>
          <Button type="button" onClick={handleSaveVideo} disabled={videoExporting}>
            <Download className="h-4 w-4 mr-2" />
            Save video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export function ShareButton({
  input,
  engine = "ondemand",
  appPath,
  trackedSlug,
  playerId,
  size = "sm",
  variant = "outline",
  label = "Share",
  className,
  iconOnly = false,
}: {
  input: ShareCardInput;
  engine?: EngineKey;
  appPath?: string;
  trackedSlug?: string | null;
  playerId?: number | null;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  if (bundle) {
    const s = bundle.settings;
    const enabled =
      engine === "ondemand"
        ? s.engineOnDemand !== false
        : engine === "milestone"
          ? s.engineMilestone !== false
          : engine === "roundup"
            ? s.engineRoundUp !== false
            : s.engineRecap !== false;
    if (!enabled) return null;
  }
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        aria-label={iconOnly ? label : undefined}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Download className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5 mr-1"} />
        {iconOnly ? null : label}
      </Button>
      <ShareCardModal
        open={open}
        onOpenChange={setOpen}
        input={input}
        engine={engine}
        appPath={appPath}
        trackedSlug={trackedSlug ?? null}
        playerId={playerId ?? null}
      />
    </>
  );
}
