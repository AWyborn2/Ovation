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
import { Loader2, Check } from "lucide-react";

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
    const result = await uploadLogo(file);
    if (result) setLogoUrl(`/api/storage${result.objectPath}`);
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

  const busy =
    isUploadingLogo || isUploadingFavicon || update.isPending;

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
                onChange={(e) => { setName(e.target.value); setSaved(false); }}
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
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Platform logo"
                    className="h-10 w-10 rounded object-contain border bg-muted/30 p-0.5"
                  />
                )}
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
                    onClick={() => { setLogoUrl(""); setSaved(false); }}
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
                value={logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setSaved(false); }}
                placeholder="https://…"
                disabled={busy}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Favicon</Label>
              <div className="flex items-center gap-3">
                {faviconUrl && (
                  <img
                    src={faviconUrl}
                    alt="Favicon"
                    className="h-6 w-6 rounded object-contain border"
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
                    onClick={() => { setFaviconUrl(""); setSaved(false); }}
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
                onChange={(e) => { setFaviconUrl(e.target.value); setSaved(false); }}
                placeholder="https://…"
                disabled={busy}
                className="font-mono text-xs"
              />
            </div>

            <ColourSlotPicker
              label="Accent colour"
              description="Buttons, nav highlights, and interactive accents on the landing page."
              value={accentColour}
              onChange={(hex) => { setAccentColour(hex); setSaved(false); }}
              disabled={busy}
            />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

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
