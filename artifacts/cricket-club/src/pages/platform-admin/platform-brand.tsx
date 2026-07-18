import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlatformBrand,
  useUpdatePlatformBrand,
  getGetTenantBrandQueryKey,
  getGetPlatformBrandQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { ColourSlotPicker } from "@/components/colour-slot-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2, Check } from "lucide-react";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Pick white or black foreground text for a given hex background colour using
 * the WCAG relative-luminance formula.
 */
function getContrastFg(hex: string): string {
  if (!HEX_RE.test(hex)) return "#ffffff";
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.179 ? "#000000" : "#ffffff";
}

/**
 * If the image is larger than maxW×maxH, draw it scaled-down onto a canvas and
 * return a new PNG File. SVGs are passed through unchanged (they're scalable).
 * Falls back to the original file on any canvas error.
 */
async function resizeImageFile(
  file: File,
  maxW = 512,
  maxH = 512,
): Promise<File> {
  if (file.type === "image/svg+xml") return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= maxW && h <= maxH) {
        resolve(file);
        return;
      }
      const scale = Math.min(maxW / w, maxH / h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const name = file.name.replace(/\.[^.]+$/, "") + ".png";
          resolve(new File([blob], name, { type: "image/png" }));
        },
        "image/png",
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Platform brand editor for the Ovation platform itself (not a club tenant).
 * Lets a super-admin update the platform name, logo, accent colour, and favicon
 * without a code change or redeploy. The landing page and platform admin shell
 * reflect changes immediately via the GET /tenant-brand response.
 */
export default function PlatformBrand() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetPlatformBrand();

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoImgBroken, setLogoImgBroken] = useState(false);
  const [accentColour, setAccentColour] = useState<string>(
    DEFAULT_BRAND.primaryColour as string,
  );
  const [faviconUrl, setFaviconUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name ?? "");
    setLogoUrl(data.logoUrl ?? "");
    setLogoImgBroken(false);
    setAccentColour(
      data.primaryColour ?? (DEFAULT_BRAND.primaryColour as string),
    );
    setFaviconUrl(data.faviconUrl ?? "");
  }, [data]);

  const update = useUpdatePlatformBrand({
    mutation: {
      onSuccess: () => {
        setSaved(true);
        setError(null);
        qc.invalidateQueries({ queryKey: getGetPlatformBrandQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTenantBrandQueryKey() });
      },
      onError: (e) => {
        setSaved(false);
        const status = (e as { status?: number })?.status;
        setError(
          status === 400
            ? "Accent colour must be a 6-digit hex value (e.g. #FFB238)."
            : "Couldn't save platform brand.",
        );
      },
    },
  });

  const { uploadFile: uploadLogo, isUploading: isUploadingLogo } = useUpload({
    basePath: "/api/platform/admin/storage",
    onError: (e) => setError(e.message),
  });
  const { uploadFile: uploadFavicon, isUploading: isUploadingFavicon } =
    useUpload({
      basePath: "/api/platform/admin/storage",
      onError: (e) => setError(e.message),
    });

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(false);
    const resized = await resizeImageFile(file);
    const result = await uploadLogo(resized);
    if (result) {
      setLogoUrl(`/api/storage${result.objectPath}`);
      setLogoImgBroken(false);
    }
  };

  const handleFaviconFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(false);
    const result = await uploadFavicon(file);
    if (result) setFaviconUrl(`/api/storage${result.objectPath}`);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setError(null);
    update.mutate({
      data: {
        name: name.trim() || null,
        logoUrl: logoUrl || null,
        accentColour: accentColour || null,
        faviconUrl: faviconUrl || null,
      },
    });
  };

  const busy = isUploadingLogo || isUploadingFavicon || update.isPending;

  const validAccent = HEX_RE.test(accentColour) ? accentColour : null;
  const accentFg = validAccent ? getContrastFg(validAccent) : "#ffffff";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform Brand
        </h1>
        <p className="text-sm text-muted-foreground">
          The Ovation platform's own name, logo, accent colour, and favicon.
          Changes appear on the landing page immediately — no redeploy needed.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Brand settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="platform-name">Platform name</Label>
              <Input
                id="platform-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                placeholder="Ovation"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the landing page header and as the document title.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl && !logoImgBroken ? (
                  <img
                    src={logoUrl}
                    alt="Platform logo"
                    className="h-10 w-10 rounded object-contain border bg-muted/30 p-0.5"
                    onError={() => setLogoImgBroken(true)}
                  />
                ) : logoUrl && logoImgBroken ? (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted/40"
                    title="Logo unavailable — it may be stored privately and visible after sign-in"
                  >
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                ) : null}
                <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  {isUploadingLogo
                    ? "Uploading…"
                    : logoUrl
                      ? "Change logo"
                      : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    className="hidden"
                    onChange={handleLogoFile}
                    disabled={busy}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl("");
                      setLogoImgBroken(false);
                      setSaved(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    disabled={busy}
                  >
                    Remove
                  </button>
                )}
              </div>
              {logoImgBroken && (
                <p className="text-xs text-muted-foreground">
                  Logo is stored privately — it will display correctly on the
                  live site but can't be previewed here without a public URL.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Or paste a URL directly:
              </p>
              <Input
                value={logoUrl}
                onChange={(e) => {
                  setLogoUrl(e.target.value);
                  setLogoImgBroken(false);
                  setSaved(false);
                }}
                placeholder="https://…"
                disabled={busy}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Images wider or taller than 512 px are automatically resized
                before upload.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Favicon</Label>
              <div className="flex items-center gap-3">
                {faviconUrl && (
                  <img
                    src={faviconUrl}
                    alt="Favicon"
                    className="h-6 w-6 rounded object-contain border"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
                <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  {isUploadingFavicon
                    ? "Uploading…"
                    : faviconUrl
                      ? "Change favicon"
                      : "Upload favicon"}
                  <input
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml"
                    className="hidden"
                    onChange={handleFaviconFile}
                    disabled={busy}
                  />
                </label>
                {faviconUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setFaviconUrl("");
                      setSaved(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    disabled={busy}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Or paste a URL directly:
              </p>
              <Input
                value={faviconUrl}
                onChange={(e) => {
                  setFaviconUrl(e.target.value);
                  setSaved(false);
                }}
                placeholder="https://…"
                disabled={busy}
                className="font-mono text-xs"
              />
            </div>

            <ColourSlotPicker
              label="Accent colour"
              description="Buttons, nav highlights, and interactive accents on the landing page."
              value={accentColour}
              onChange={(hex) => {
                setAccentColour(hex);
                setSaved(false);
              }}
              disabled={busy}
            />

            {validAccent && (
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Live preview
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm"
                    style={{
                      backgroundColor: validAccent,
                      color: accentFg,
                    }}
                  >
                    Save settings
                  </span>

                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: validAccent + "28",
                      color: validAccent,
                    }}
                  >
                    Active
                  </span>

                  <span
                    className="inline-flex items-center border-b-2 px-3 py-1.5 text-sm font-medium"
                    style={{
                      borderColor: validAccent,
                      color: validAccent,
                    }}
                  >
                    Dashboard
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Button · badge · nav highlight — rendered in the chosen accent
                  colour.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={busy}>
                {update.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save platform brand"
                )}
              </Button>
              {saved && !busy && (
                <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
