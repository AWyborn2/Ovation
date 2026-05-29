import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  type SocialSettingsBundle,
  type CardTheme as ApiCardTheme,
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
  downloadBlob,
  cardBaseFilename,
  type CardSize,
  type CardSponsor,
  type ShareCardInput,
} from "@/lib/share-card";
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

export function ShareCardModal({
  open,
  onOpenChange,
  input,
  engine = "ondemand",
  appPath,
  trackedSlug,
  onApprove,
  approveLabel = "Approve & download",
}: Props) {
  const settingsQ = useGetSocialSettings({
    query: { enabled: open, queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;

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
  const selectedTheme = useMemo(
    () => themes.find((t) => t.id === selectedThemeId),
    [themes, selectedThemeId],
  );

  const enabledSizes: CardSize[] = useMemo(() => {
    const s = bundle?.settings;
    const out: CardSize[] = [];
    if (!s || s.sizeSquare) out.push("square");
    if (!s || s.sizePortrait) out.push("portrait");
    if (!s || s.sizeStory) out.push("story");
    return out.length ? out : ["square"];
  }, [bundle]);

  const [activeSize, setActiveSize] = useState<CardSize>("square");
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
    if (!bundle?.settings.sponsorsEnabled || !includeSponsors) return [];
    return (bundle?.activeSponsors ?? []).map((s) => ({
      name: s.name,
      logoUrl: s.logoUrl,
    }));
  }, [bundle, includeSponsors]);

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
      if (previewUrls[activeSize]) return; // cache hit
      setRendering(true);
      try {
        const blob = await renderShareCard(input, {
          size: activeSize,
          sponsors,
          clubUrl,
          hashtag,
          theme: selectedTheme,
        });
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
  }, [open, input, activeSize, sponsors, clubUrl, hashtag, selectedTheme]);

  // Invalidate cached previews when sponsors flip or the theme changes.
  useEffect(() => {
    setPreviewUrls((prev) => {
      Object.values(prev).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return { square: null, portrait: null, story: null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSponsors, input, selectedThemeId]);

  // Cleanup URLs on close.
  useEffect(() => {
    if (!open) {
      Object.values(previewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      setPreviewUrls({ square: null, portrait: null, story: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDownload = async (size: CardSize) => {
    if (!input) return;
    const blob = await renderShareCard(input, { size, sponsors, clubUrl, hashtag, theme: selectedTheme });
    downloadBlob(blob, `${cardBaseFilename(input)}-${SIZES[size].code}.png`);
  };

  const handleDownloadAll = async () => {
    if (!input) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const size of enabledSizes) {
        const blob = await renderShareCard(input, { size, sponsors, clubUrl, hashtag, theme: selectedTheme });
        zip.file(`${cardBaseFilename(input)}-${SIZES[size].code}.png`, blob);
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
                    {rendering && !previewUrls[s] ? (
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

            {themes.length > 1 && (
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
          <Button
            type="button"
            variant={onApprove ? "secondary" : "default"}
            onClick={handleDownloadAll}
            disabled={zipping || approving}
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
  );
}

export function ShareButton({
  input,
  engine = "ondemand",
  appPath,
  trackedSlug,
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
      />
    </>
  );
}
