import { useEffect, useMemo, useState } from "react";
import type { SocialSettingsBundle } from "@workspace/api-client-react";
import type { ShareCardInput } from "@/lib/share-card";
import {
  renderCaption,
  truncateForPlatform,
  type Platform,
} from "@/lib/captions";
import { PLATFORMS, type EngineKey } from "./constants";

// Owns the tracked-link slug, the per-platform caption drafts (rebuilt from the
// club's templates) and the copy-to-clipboard affordance.
export function useCaptions({
  open,
  input,
  bundle,
  engine,
  appPath,
  trackedSlug,
  clubUrl,
  hashtag,
}: {
  open: boolean;
  input: ShareCardInput | null;
  bundle: SocialSettingsBundle | undefined;
  engine: EngineKey;
  appPath?: string;
  trackedSlug?: string | null;
  clubUrl: string;
  hashtag: string;
}) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copied, setCopied] = useState(false);
  const [captionDrafts, setCaptionDrafts] = useState<Record<Platform, string>>({
    instagram: "",
    facebook: "",
    twitter: "",
  });
  const captionDraft = captionDrafts[platform];

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

  const handleCopyCaption = async () => {
    await navigator.clipboard.writeText(captionDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return {
    platform,
    setPlatform,
    captionDraft,
    setCaptionDraft,
    captionDrafts,
    copied,
    handleCopyCaption,
  };
}
