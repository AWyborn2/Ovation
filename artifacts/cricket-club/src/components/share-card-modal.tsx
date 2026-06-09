import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  useListCardTemplates,
  getListCardTemplatesQueryKey,
  useGetPlayer,
  getGetPlayerQueryKey,
  useListPlayerImages,
  useAddPlayerImage,
  getListPlayerImagesQueryKey,
  type SocialSettingsBundle,
  type CardTheme as ApiCardTheme,
  type CardTemplate,
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
import { Loader2, Download, Copy, Check, Upload, ImageOff, User, ImageIcon } from "lucide-react";
import {
  SIZES,
  renderShareCard,
  renderShareCardVideo,
  prepareAnimation,
  isAnimatedCard,
  canExportVideo,
  videoFormatLabel,
  downloadBlob,
  cardBaseFilename,
  sponsorAppliesToKind,
  DEFAULT_PHOTO_TRANSFORM,
  type CardSize,
  type CardSponsor,
  type ShareCardInput,
  type PhotoPlacement,
  type PhotoTransform,
  type MotionPreset,
  type RenderOptions,
  type AnimationHandle,
} from "@/lib/share-card";
import { PhotoReposition } from "@/components/photo-reposition";
import { templateAppliesToKind } from "@/lib/card-template";
import {
  renderCaption,
  truncateForPlatform,
  PLATFORM_LIMITS,
  type Platform,
} from "@/lib/captions";

type EngineKey = "ondemand" | "milestone" | "roundup" | "recap";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ShareCardInput | null;
  engine?: EngineKey;
  appPath?: string; // e.g. "/players/123"
  trackedSlug?: string | null;
  /**
   * The player this tile is about, when there is one. Drives the photo control:
   * it lets the modal load the player's saved profile photo as the default and
   * save a freshly uploaded photo back to that profile. Omit for player-less
   * cards (e.g. premiership) to hide the photo control entirely.
   */
  playerId?: number | null;
  /**
   * When provided, the modal becomes an approval surface: it shows an
   * "Approve & download" button that renders the full card + caption bundle,
   * downloads the zip, then runs this callback (used by the social queue to
   * mark a draft + its milestone event as posted).
   */
  onApprove?: () => Promise<void> | void;
  approveLabel?: string;
};

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "X / Twitter" },
];

const MOTION_OPTIONS: { value: MotionPreset; label: string }[] = [
  { value: "none", label: "None (still)" },
  { value: "fadeIn", label: "Fade in" },
  { value: "slideUp", label: "Slide up" },
  { value: "countUp", label: "Count up numbers" },
];

// Live, looping canvas preview for animated cards. Prepares the animation once
// per `sig` change and drives it with requestAnimationFrame; cleans up any
// playing <video> elements on unmount / re-prepare.
function AnimatedCardPreview({
  input,
  opts,
  sig,
}: {
  input: ShareCardInput;
  opts: RenderOptions;
  sig: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let handle: AnimationHandle | null = null;
    let cancelled = false;
    let start = 0;
    void (async () => {
      const a = await prepareAnimation(input, opts);
      if (cancelled) {
        a.cleanup();
        return;
      }
      handle = a;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        a.cleanup();
        return;
      }
      canvas.width = a.width;
      canvas.height = a.height;
      const loop = (now: number) => {
        if (!start) start = now;
        const elapsed = now - start;
        const t = a.loop ? (elapsed % a.durationMs) / a.durationMs : Math.min(1, elapsed / a.durationMs);
        a.draw(ctx, t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      handle?.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
}

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

  // Photo control state. We only surface it when the tile is about a player.
  const showPhotoControls = playerId != null;
  const queryClient = useQueryClient();
  const addPlayerImage = useAddPlayerImage();
  const playerQ = useGetPlayer(playerId ?? 0, {
    query: { enabled: open && showPhotoControls, queryKey: getGetPlayerQueryKey(playerId ?? 0) },
  });
  // The player's saved profile photo (when present) is the default, falling back
  // to whatever photo the input was built with.
  const profilePhotoUrl: string | null =
    (showPhotoControls ? playerQ.data?.imageUrl ?? null : null) ??
    (input && "photoUrl" in input ? input.photoUrl ?? null : null);

  // The player's photo gallery. Each image is selectable; the default image is
  // pre-selected. Falls back to the single profile photo when the gallery is
  // empty (e.g. older players whose image_url predates the gallery).
  const galleryQ = useListPlayerImages(playerId ?? 0, {
    query: {
      enabled: open && showPhotoControls,
      queryKey: getListPlayerImagesQueryKey(playerId ?? 0),
    },
  });
  const galleryPhotos: { url: string; isDefault: boolean }[] = useMemo(() => {
    const rows = galleryQ.data ?? [];
    if (rows.length > 0) {
      return rows.map((r) => ({ url: r.imageUrl, isDefault: r.isDefault }));
    }
    return profilePhotoUrl ? [{ url: profilePhotoUrl, isDefault: true }] : [];
  }, [galleryQ.data, profilePhotoUrl]);
  const defaultGalleryUrl: string | null =
    galleryPhotos.find((p) => p.isDefault)?.url ?? galleryPhotos[0]?.url ?? null;

  type PhotoSource = "gallery" | "uploaded" | "none";
  const [photoSource, setPhotoSource] = useState<PhotoSource>("none");
  const [galleryUrl, setGalleryUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [photoPlacement, setPhotoPlacement] = useState<PhotoPlacement>("headshot");
  // Focal point + zoom for a feature photo. `photoTransform` updates live as the
  // user drags; `renderTransform` is debounced and drives the (heavier) full
  // card preview so dragging stays smooth.
  const [photoTransform, setPhotoTransform] = useState<PhotoTransform>(DEFAULT_PHOTO_TRANSFORM);
  const [renderTransform, setRenderTransform] = useState<PhotoTransform>(DEFAULT_PHOTO_TRANSFORM);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [photoTouched, setPhotoTouched] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (e) => setPhotoError(e.message),
  });

  // Reset photo controls each time the modal opens.
  useEffect(() => {
    if (open) {
      setPhotoSource("none");
      setGalleryUrl(null);
      setUploadedUrl(null);
      setPhotoPlacement("headshot");
      setPhotoTransform(DEFAULT_PHOTO_TRANSFORM);
      setRenderTransform(DEFAULT_PHOTO_TRANSFORM);
      setSaveToProfile(true);
      setPhotoTouched(false);
      setPhotoError(null);
      setVideoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
  }, [open]);

  // Once the gallery is known (it loads async), default to the player's default
  // image — unless the club has already interacted with the photo control.
  useEffect(() => {
    if (open && !photoTouched && photoSource === "none" && uploadedUrl === null && defaultGalleryUrl) {
      setPhotoSource("gallery");
      setGalleryUrl(defaultGalleryUrl);
    }
  }, [open, photoTouched, photoSource, uploadedUrl, defaultGalleryUrl]);

  const effectivePhotoUrl: string | null =
    photoSource === "gallery"
      ? galleryUrl
      : photoSource === "uploaded"
        ? uploadedUrl
        : null;

  // A different photo means a fresh crop — re-centre the focal point + zoom.
  useEffect(() => {
    setPhotoTransform(DEFAULT_PHOTO_TRANSFORM);
    setRenderTransform(DEFAULT_PHOTO_TRANSFORM);
  }, [effectivePhotoUrl]);

  // Debounce the transform that drives the full card preview so dragging the
  // focal point stays smooth (the reposition control gives instant feedback).
  useEffect(() => {
    const id = setTimeout(() => setRenderTransform(photoTransform), 160);
    return () => clearTimeout(id);
  }, [photoTransform]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    const result = await uploadFile(file);
    if (!result) return;
    const url = `/api/storage${result.objectPath}`;
    setUploadedUrl(url);
    setPhotoSource("uploaded");
    setPhotoTouched(true);
    // Save to the player's gallery (as the new default) so it persists and is
    // selectable next time (opt-out via the toggle).
    if (saveToProfile && playerId != null) {
      addPlayerImage.mutate(
        { id: playerId, data: { imageUrl: url, makeDefault: true } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetPlayerQueryKey(playerId) });
            queryClient.invalidateQueries({
              queryKey: getListPlayerImagesQueryKey(playerId),
            });
          },
          onError: (err) =>
            setPhotoError((err as Error)?.message ?? "Could not save photo to profile"),
        },
      );
    }
  };

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

  // Motion preset. Defaults to the selected template's own preset (so an
  // animated template animates out of the box) until the club picks one.
  const [motion, setMotion] = useState<MotionPreset>("none");
  const [motionTouched, setMotionTouched] = useState(false);
  useEffect(() => {
    if (!open || motionTouched) return;
    setMotion((selectedTemplate?.motionPreset as MotionPreset | undefined) ?? "none");
  }, [open, motionTouched, selectedTemplate]);

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
  const [videoExporting, setVideoExporting] = useState(false);
  // The most recently rendered video clip, held back for review before saving.
  // Playing this exact blob in a <video> lets admins confirm the real output
  // (MediaRecorder timing/codec quirks can diverge from the live canvas).
  const [videoPreview, setVideoPreview] = useState<{
    url: string;
    blob: Blob;
    ext: string;
    size: CardSize;
  } | null>(null);
  const [includeSponsors, setIncludeSponsors] = useState(true);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [previewUrls, setPreviewUrls] = useState<Record<CardSize, string | null>>({
    square: null,
    portrait: null,
    story: null,
  });
  const [rendering, setRendering] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [approving, setApproving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [captionDrafts, setCaptionDrafts] = useState<Record<Platform, string>>({
    instagram: "",
    facebook: "",
    twitter: "",
  });
  const captionDraft = captionDrafts[platform];

  useEffect(() => {
    if (open && enabledSizes.length > 0 && !enabledSizes.includes(activeSize)) {
      setActiveSize(enabledSizes[0]);
    }
  }, [open, enabledSizes, activeSize]);

  const sponsors: CardSponsor[] = useMemo(() => {
    if (!bundle?.settings.sponsorsEnabled || !includeSponsors || !input) return [];
    return (bundle?.activeSponsors ?? [])
      .filter((s) => sponsorAppliesToKind(s.cardKinds, input.kind))
      .map((s) => ({
        name: s.name,
        logoUrl: s.logoUrl,
      }));
  }, [bundle, includeSponsors, input]);

  const clubUrl = bundle?.settings.clubUrl ?? "hallsheadcricket.com.au";
  const hashtag = bundle?.settings.clubHashtag ?? "#HHCC";

  // On-demand shares get a tracked slug auto-minted server-side so the caption
  // and downloaded card always carry a /go/<slug> link we can measure.
  const [autoSlug, setAutoSlug] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!open || trackedSlug || autoSlug || !appPath || engine !== "ondemand") return;
    fetch("/api/tracked-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: appPath, engine: "ondemand", label: "On-demand share" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((row: { slug?: string } | null) => {
        if (!cancelled && row?.slug) setAutoSlug(row.slug);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, trackedSlug, autoSlug, appPath, engine]);

  const effectiveSlug = trackedSlug ?? autoSlug;
  const appLink = useMemo(() => {
    const base = clubUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (effectiveSlug) return `${base}/go/${effectiveSlug}`;
    if (!appPath) return base;
    return `${base}${appPath}`;
  }, [clubUrl, appPath, effectiveSlug]);

  const templateFor = (p: Platform): string => {
    const tpl = bundle?.captionTemplates.find(
      (t) => t.engine === engine && t.platform === p,
    );
    return tpl?.template ?? `{player.name} • {stat.value} {stat.label} ${appLink} ${hashtag}`;
  };

  // Rebuild every platform's caption from its template when the card data or
  // settings change. Keeping a draft per platform means edits survive switching
  // tabs and the zip can carry a caption file for each platform.
  useEffect(() => {
    if (!input || !bundle) return;
    const next = {} as Record<Platform, string>;
    for (const p of PLATFORMS) {
      const raw = renderCaption(templateFor(p.value), input, {
        clubUrl,
        hashtag,
        appLink,
      });
      next[p.value] = truncateForPlatform(raw, p.value);
    }
    setCaptionDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, bundle, appLink, clubUrl, hashtag]);

  const setCaptionDraft = (value: string) =>
    setCaptionDrafts((prev) => ({ ...prev, [platform]: value }));

  // Render preview when size/sponsors/input changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open || !input) return;
      if (animated) return; // animated cards preview live on a canvas instead
      if (previewUrls[activeSize]) return; // cache hit
      setRendering(true);
      try {
        const blob = await renderShareCard(input, buildOpts(activeSize, renderTransform));
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrls((prev) => ({ ...prev, [activeSize]: url }));
      } catch (e) {
        console.error("Card render failed", e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, input, activeSize, sponsors, clubUrl, hashtag, selectedTheme, selectedTemplate, effectivePhotoUrl, photoPlacement, renderTransform]);

  // Stable signature of the resolved sponsor set so previews re-render when the
  // sponsor list loads async or its card-kind filtering changes the result.
  const sponsorSig = useMemo(
    () => sponsors.map((s) => `${s.name}|${s.logoUrl}`).join("~"),
    [sponsors],
  );

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
    photoUrl: effectivePhotoUrl,
    photoPlacement,
    photoTransform: transform,
    motionPreset: motion,
  });

  // Stable key for the animated preview so it only re-prepares when something
  // that affects the animation actually changes.
  const animSig = useMemo(
    () =>
      [
        activeSize,
        layoutId ?? "builtin",
        selectedThemeId ?? "none",
        motion,
        effectivePhotoUrl ?? "nophoto",
        photoPlacement,
        `${renderTransform.focalX},${renderTransform.focalY},${renderTransform.zoom}`,
        sponsorSig,
      ].join("|"),
    [activeSize, layoutId, selectedThemeId, motion, effectivePhotoUrl, photoPlacement, renderTransform, sponsorSig],
  );

  // Invalidate cached previews when sponsors flip or the theme changes.
  useEffect(() => {
    setPreviewUrls((prev) => {
      Object.values(prev).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return { square: null, portrait: null, story: null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSponsors, input, selectedThemeId, layoutId, sponsorSig, effectivePhotoUrl, photoPlacement, renderTransform]);

  // Cleanup URLs on close.
  useEffect(() => {
    if (!open) {
      Object.values(previewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      setPreviewUrls({ square: null, portrait: null, story: null });
      setVideoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDownload = async (size: CardSize) => {
    if (!input) return;
    const blob = await renderShareCard(input, buildOpts(size, photoTransform));
    downloadBlob(blob, `${cardBaseFilename(input)}-${SIZES[size].code}.png`);
  };

  // Record the animated card to a video clip (MP4 where supported, else WebM)
  // and hold it back for review — the admin plays the exact rendered blob before
  // deciding to save it or re-record. This catches MediaRecorder timing/codec
  // quirks (first-frame flash, loop seam) that the live canvas preview can hide.
  const handleDownloadVideo = async (size: CardSize) => {
    if (!input) return;
    setVideoExporting(true);
    try {
      const { blob, ext } = await renderShareCardVideo(input, buildOpts(size, photoTransform));
      const url = URL.createObjectURL(blob);
      setVideoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, blob, ext, size };
      });
    } catch (e) {
      console.error("Card video export failed", e);
    } finally {
      setVideoExporting(false);
    }
  };

  // Save the reviewed clip to disk.
  const handleSaveVideo = () => {
    if (!input || !videoPreview) return;
    downloadBlob(
      videoPreview.blob,
      `${cardBaseFilename(input)}-${SIZES[videoPreview.size].code}.${videoPreview.ext}`,
    );
    setVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const closeVideoPreview = () => {
    setVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
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
      // Animated cards also carry a video clip per size. Video export is
      // real-time (canvas.captureStream + MediaRecorder), so recording the sizes
      // one after another makes the wait the SUM of every clip's duration.
      // Each renderShareCardVideo uses its own offscreen canvas/stream/recorder,
      // so we record all sizes concurrently — the wait collapses to roughly a
      // single clip's duration instead of the serial sum.
      if (animated && videoSupported) {
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

  const handleCopyCaption = async () => {
    await navigator.clipboard.writeText(captionDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
              <p className="text-xs text-muted-foreground">
                {motion === "countUp"
                  ? "Numbers tick up from zero on bound stat slots; other cards fade in."
                  : "Adds an entrance animation to the card content."}
                {animated && videoSupported
                  ? ` Export plays as ${videoFormat}.`
                  : animated && !videoSupported
                    ? " Your browser can't record video; only the still image will download."
                    : ""}
              </p>
            </div>

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
              <div className="space-y-2.5 rounded border px-3 py-2.5">
                <Label className="text-sm">Photo</Label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                {galleryPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {galleryPhotos.map((p) => {
                      const selected =
                        photoSource === "gallery" && galleryUrl === p.url;
                      return (
                        <button
                          key={p.url}
                          type="button"
                          title={p.isDefault ? "Default photo" : undefined}
                          className={`relative h-12 w-12 overflow-hidden rounded border-2 ${
                            selected ? "border-primary" : "border-muted"
                          }`}
                          onClick={() => {
                            setPhotoSource("gallery");
                            setGalleryUrl(p.url);
                            setPhotoTouched(true);
                          }}
                        >
                          <img
                            src={p.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          {p.isDefault && (
                            <span className="absolute bottom-0 left-0 right-0 bg-primary/80 text-center text-[8px] font-semibold leading-tight text-primary-foreground">
                              Default
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={photoSource === "uploaded" ? "default" : "outline"}
                    className="h-8 text-xs"
                    disabled={isUploading}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1" />
                    )}
                    {uploadedUrl ? "Replace photo" : "Upload photo"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={photoSource === "none" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => {
                      setPhotoSource("none");
                      setPhotoTouched(true);
                    }}
                  >
                    <ImageOff className="h-3.5 w-3.5 mr-1" />
                    No photo
                  </Button>
                </div>

                {effectivePhotoUrl && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Placement</Label>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={photoPlacement === "feature" ? "default" : "outline"}
                        className="h-8 flex-1 text-xs"
                        onClick={() => setPhotoPlacement("feature")}
                      >
                        <ImageIcon className="h-3.5 w-3.5 mr-1" />
                        Feature
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={photoPlacement === "headshot" ? "default" : "outline"}
                        className="h-8 flex-1 text-xs"
                        onClick={() => setPhotoPlacement("headshot")}
                      >
                        <User className="h-3.5 w-3.5 mr-1" />
                        Headshot
                      </Button>
                    </div>
                    {photoPlacement === "feature" && (
                      <PhotoReposition
                        src={effectivePhotoUrl}
                        aspect={{ w: SIZES[activeSize].w, h: SIZES[activeSize].h }}
                        value={photoTransform}
                        onChange={setPhotoTransform}
                      />
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-0.5">
                  <Label htmlFor="save-profile-toggle" className="text-xs text-muted-foreground">
                    Save uploads to player profile
                  </Label>
                  <Switch
                    id="save-profile-toggle"
                    checked={saveToProfile}
                    onCheckedChange={setSaveToProfile}
                  />
                </div>

                {photoError && <p className="text-xs text-destructive">{photoError}</p>}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {captionsEnabled && (
              <>
                <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleDownload(activeSize)}
          >
            <Download className="h-4 w-4 mr-2" />
            Download {SIZES[activeSize].label}
          </Button>
          {animated && videoSupported && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleDownloadVideo(activeSize)}
              disabled={videoExporting || zipping || approving}
            >
              {videoExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {videoExporting ? "Rendering…" : "Preview video"}
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
