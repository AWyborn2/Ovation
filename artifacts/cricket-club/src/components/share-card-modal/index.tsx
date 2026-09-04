import { useEffect, useMemo, useState } from "react";
import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Wand2 } from "lucide-react";
import {
  isAnimatedCard,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
} from "@/lib/share-card";
import { canExportVideo, videoFormatLabel } from "@/lib/share-card-animation";
import { packSupportsKind, type PackCardData } from "@/lib/pack-render";
import { buildPackData as buildSharedPackData, tenantHashtag } from "@/lib/pack-card-data";
import { CardLayoutEditor } from "@/components/card-layout-editor";
import type { Props } from "./constants";
import { usePhotoControls } from "./use-photo-controls";
import { PhotoControls } from "./photo-controls";
import { useCaptions } from "./use-captions";
import { useSponsors } from "./use-sponsors";
import { useCardPreview } from "./use-card-preview";
import { useVideoExport } from "./use-video-export";
import { useThemeStyle } from "./use-theme-style";
import { useLayoutTemplate } from "./use-layout-template";
import { useMotionAudio } from "./use-motion-audio";
import { useCardExport } from "./use-card-export";
import { PreviewTabs } from "./preview-tabs";
import { LayoutSelect, ThemeSelect } from "./design-selects";
import { MotionPanel } from "./motion-panel";
import { AudioPanel } from "./audio-panel";
import { StylePanel } from "./style-panel";
import { SlotImagesPanel } from "./slot-images-panel";
import { CaptionsPanel } from "./captions-panel";
import { ExportFooter, VideoPreviewDialog } from "./export-footer";

export type { EngineKey } from "./constants";

/**
 * "Share to socials" modal (plan.md §5.6 split).
 *
 * State is owned by focused hooks in this directory — photo, theme/style,
 * layout/template/pack, motion/audio, sponsors, captions, preview, video and
 * export — and each control group is a small presentational panel. This
 * component wires them together and renders the dialog shell.
 */
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

  // Junior cards are locked to the brown junior palette (no admin theme) and the
  // built-in layout, so we suppress theme + custom-template selection entirely.
  const isJunior =
    !!input && "junior" in input && (input as { junior?: boolean }).junior === true;

  const style = useThemeStyle({ open, isJunior });
  const { themes, selectedThemeId, selectedTheme, effectiveTheme } = style;

  const layout = useLayoutTemplate({ open, input, isJunior });
  const {
    applicableTemplates,
    layoutId,
    selectedTemplate,
    isPackTemplate,
    bgTemplate,
    packId,
    imageSlots,
    templateLayers,
    isAdmin,
    savedLayout,
    layoutSig,
    editingLayout,
    setEditingLayout,
    imageOverrides,
  } = layout;

  const motionAudio = useMotionAudio({ open, input, selectedTemplate });
  const { motion, durationMs, speed, audioSpec, previewSoundOn } = motionAudio;

  const enabledSizes: CardSize[] = useMemo(() => {
    const s = bundle?.settings;
    const out: CardSize[] = [];
    if (!s || s.sizeSquare) out.push("square");
    if (!s || s.sizePortrait) out.push("portrait");
    if (!s || s.sizeStory) out.push("story");
    return out.length ? out : ["square"];
  }, [bundle]);

  const [activeSize, setActiveSize] = useState<CardSize>("square");

  // A "pack" (standard / built-in) card is one with no BYO template selected
  // whose kind the Broadcast Dark pack renders. These export as PNG through the
  // server-side still harness (pixel-true web fonts + un-tainted logos), while
  // BYO templates keep the client-side canvas path. Junior cards are pack cards
  // too (the pack renderer forces the brown palette).
  // A card renders through the pack when no BYO template is selected (default
  // pack) or the selection IS a pack row (that pack) — and the resolved pack
  // has a design for the kind.
  const isPackCard = useMemo(
    () =>
      !!input &&
      (selectedTemplate === null || isPackTemplate) &&
      packSupportsKind(input.kind, packId),
    [input, selectedTemplate, isPackTemplate, packId],
  );

  // A video/GIF template always animates; otherwise the motion preset decides.
  // Pack cards are always static (KTD10) — never offer video/GIF for them.
  const animated = useMemo(
    () =>
      !isPackCard &&
      isAnimatedCard({ size: activeSize, template: bgTemplate, motionPreset: motion }),
    [isPackCard, activeSize, bgTemplate, motion],
  );
  const videoSupported = useMemo(() => canExportVideo(), []);
  const videoFormat = useMemo(() => videoFormatLabel(), []);
  const [includeSponsors, setIncludeSponsors] = useState(true);

  useEffect(() => {
    if (open && enabledSizes.length > 0 && !enabledSizes.includes(activeSize)) {
      setActiveSize(enabledSizes[0]);
    }
  }, [open, enabledSizes, activeSize]);

  const { sponsors, presentingSponsorName, sponsorSig } = useSponsors({
    bundle,
    includeSponsors,
    input,
  });

  // A brand-less tenant gets no clubUrl/hashtag rather than another club's.
  const clubUrl = bundle?.settings.clubUrl ?? "";
  const hashtag = tenantHashtag(bundle);

  const captions = useCaptions({ open, input, bundle, engine, appPath, trackedSlug, clubUrl, hashtag });

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
    template: bgTemplate,
    layout: templateLayers ?? savedLayout,
    photoUrl: effectivePhotoUrl,
    photoPlacement,
    photoTransform: transform,
    motionPreset: motion,
    durationMs,
    speed,
    audio: audioSpec,
  });

  // Tenant data threaded into the pack (Broadcast Dark) path — the pack
  // equivalent of the brand/sponsors/photo that `buildOpts` gives the canvas
  // renderer. Same resolved sources (brand, hashtag, kind-filtered sponsors,
  // uploaded photo) so pack cards render with real tenant branding instead of
  // the template sample literals. `transform` varies (live for downloads,
  // debounced for the preview), mirroring `buildOpts`.
  const buildPackData = (transform: PhotoTransform): PackCardData =>
    buildSharedPackData({
      brand: bundle?.brand,
      hashtag,
      sponsors,
      presentingSponsorName,
      photoUrl: effectivePhotoUrl,
      photoTransform: transform,
      // Reuse the existing placement toggle — the shared builder maps the
      // canvas vocabulary ("feature"/"headshot") onto the pack's own.
      photoPlacement,
      // B1 — admin per-slot image overrides (any slot the template exposes).
      imageOverrides,
    });

  const { previewUrls, rendering } = useCardPreview({
    open,
    input,
    animated,
    activeSize,
    renderTransform,
    buildOpts,
    renderDeps: [open, input, activeSize, sponsors, presentingSponsorName, clubUrl, hashtag, selectedTheme, selectedTemplate, layoutSig, effectivePhotoUrl, photoPlacement, renderTransform],
    invalidateDeps: [includeSponsors, input, selectedThemeId, layoutId, layoutSig, sponsorSig, effectivePhotoUrl, photoPlacement, renderTransform],
  });

  const video = useVideoExport({ open, input, buildOpts, photoTransform, brand: bundle?.brand });
  const { gifSupported, serverError } = video;

  // Stable key for the animated preview so it only re-prepares when something
  // that affects the animation actually changes.
  const animSig = useMemo(
    () =>
      [
        activeSize,
        layoutId ?? "builtin",
        layoutSig,
        selectedThemeId ?? "none",
        motion,
        durationMs,
        speed,
        effectivePhotoUrl ?? "nophoto",
        photoPlacement,
        `${renderTransform.focalX},${renderTransform.focalY},${renderTransform.zoom}`,
        sponsorSig,
      ].join("|"),
    [activeSize, layoutId, layoutSig, selectedThemeId, motion, durationMs, speed, effectivePhotoUrl, photoPlacement, renderTransform, sponsorSig],
  );

  const exp = useCardExport({
    input,
    bundle,
    isPackCard,
    isJunior,
    effectiveTheme,
    packId,
    includeSponsors,
    buildPackData,
    buildOpts,
    photoTransform,
    enabledSizes,
    animated,
    videoSupported,
    gifSupported,
    isAdmin,
    captionDrafts: captions.captionDrafts,
    onApprove,
    onOpenChange,
  });
  const { exportError } = exp;

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

        {isAdmin && !selectedTemplate && (
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
            <PreviewTabs
              input={input}
              activeSize={activeSize}
              setActiveSize={setActiveSize}
              enabledSizes={enabledSizes}
              animated={animated}
              buildOpts={buildOpts}
              renderTransform={renderTransform}
              animSig={animSig}
              soundOn={isAdmin && previewSoundOn && !!audioSpec}
              isPackCard={isPackCard}
              includeSponsors={includeSponsors}
              effectiveTheme={effectiveTheme}
              isJunior={isJunior}
              buildPackData={buildPackData}
              packId={packId}
              rendering={rendering}
              previewUrls={previewUrls}
            />

            {!isJunior && applicableTemplates.length > 0 && (
              <LayoutSelect
                layoutId={layoutId}
                setLayoutId={layout.setLayoutId}
                setLayoutTouched={layout.setLayoutTouched}
                applicableTemplates={applicableTemplates}
              />
            )}

            {isAdmin && !isPackCard && (
              <MotionPanel
                motion={motionAudio}
                animated={animated}
                videoSupported={videoSupported}
                videoFormat={videoFormat}
                gifSupported={gifSupported}
              />
            )}

            {isAdmin && animated && <AudioPanel audio={motionAudio} />}

            {!isJunior && selectedTemplate === null && themes.length > 1 && (
              <ThemeSelect
                themes={themes}
                selectedThemeId={selectedThemeId}
                setSelectedThemeId={style.setSelectedThemeId}
              />
            )}

            {!isJunior && isPackCard && <StylePanel style={style} hashtag={hashtag} />}

            {isPackCard && imageSlots.length > 0 && <SlotImagesPanel layout={layout} />}

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
            {captionsEnabled && <CaptionsPanel captions={captions} />}
          </div>
        </div>
        )}

        {isAdmin && animated && serverError && (
          <p className="text-xs text-destructive">
            Server render failed ({serverError}). Use “Preview (browser)” to
            record the clip locally instead.
          </p>
        )}

        {exportError && (
          <p className="text-xs text-destructive">{exportError}</p>
        )}

        <ExportFooter
          activeSize={activeSize}
          isAdmin={isAdmin}
          animated={animated}
          videoSupported={videoSupported}
          gifSupported={gifSupported}
          exp={exp}
          video={video}
          onApprove={onApprove}
          approveLabel={approveLabel}
        />
      </DialogContent>
    </Dialog>

    <VideoPreviewDialog video={video} />
    </>
  );
}
