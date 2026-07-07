import { useEffect, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTenantBrand,
  useUpdateTenantBrand,
  getGetTenantBrandQueryKey,
  type TenantBrand,
  type PlatformBrand,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import {
  ACCENT_HEX,
  snapHexToAccentToken,
  type AccentToken,
} from "@workspace/scorecard";
import { deriveThemeTokens } from "@/lib/theme-tokens";
import { useThemeMode } from "@/lib/theme-context";
import { extractBrandPalette } from "@/lib/color-extraction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Check } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";

/** True when the response is the platform marker rather than a tenant brand. */
function isPlatformResponse(
  data: TenantBrand | PlatformBrand | undefined,
): data is PlatformBrand {
  return !!data && "platform" in data && data.platform === true;
}

const ACCENT_LABELS: Record<AccentToken, string> = {
  amber: "Amber",
  purple: "Purple",
  green: "Green",
  blue: "Blue",
  red: "Red",
};

const ACCENT_ORDER: AccentToken[] = ["amber", "purple", "green", "blue", "red"];

export default function AdminBranding() {
  const brandQ = useGetTenantBrand({
    query: { queryKey: getGetTenantBrandQueryKey() },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Branding</h1>
        <p className="text-muted-foreground mt-1">
          Your club's logo, favicon, and accent colour — these drive the look of your
          public site.
        </p>
      </div>

      {brandQ.isError ? (
        <QueryError onRetry={() => brandQ.refetch()} />
      ) : brandQ.isLoading ? (
        <LoadingState label="Loading branding…" />
      ) : brandQ.data && !isPlatformResponse(brandQ.data) ? (
        <Editor brand={brandQ.data} />
      ) : (
        <QueryError onRetry={() => brandQ.refetch()} />
      )}
    </div>
  );
}

function Editor({ brand }: { brand: TenantBrand }) {
  const qc = useQueryClient();
  const { mode } = useThemeMode();

  const [name, setName] = useState(brand.name);
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(brand.faviconUrl ?? "");
  // The design system constrains the tenant colour to one of five named accent
  // hues; a legacy stored hex snaps to its nearest token (Halls Head's gold →
  // amber), and saving writes the token's canonical hex back to the accent slot.
  const [accent, setAccent] = useState<AccentToken>(
    snapHexToAccentToken(brand.secondaryColour ?? brand.primaryColour),
  );
  const [colourNote, setColourNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(brand.name);
    setLogoUrl(brand.logoUrl ?? "");
    setFaviconUrl(brand.faviconUrl ?? "");
    setAccent(snapHexToAccentToken(brand.secondaryColour ?? brand.primaryColour));
  }, [brand]);

  const update = useUpdateTenantBrand({
    mutation: {
      onSuccess: () => {
        setError(null);
        qc.invalidateQueries({ queryKey: getGetTenantBrandQueryKey() });
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  const { uploadFile: uploadLogo, isUploading: isUploadingLogo } = useUpload({
    onError: (e) => setError(e.message),
  });
  const { uploadFile: uploadFavicon, isUploading: isUploadingFavicon } = useUpload({
    onError: (e) => setError(e.message),
  });

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setColourNote(null);

    // Remember the pre-upload accent so it can be restored if the upload
    // itself fails -- the suggestion below is provisional until the logo it
    // was extracted from is actually saved.
    const priorAccent = accent;

    // Suggest an accent from the local file immediately (a blob: URL is
    // same-origin, so this doesn't need to wait for the upload round-trip):
    // the extracted palette snaps to the nearest of the five accent tokens.
    const localUrl = URL.createObjectURL(file);
    try {
      const palette = await extractBrandPalette(localUrl);
      if (palette.primaryColour) {
        const suggested = snapHexToAccentToken(
          palette.secondaryColour ?? palette.primaryColour,
        );
        setAccent(suggested);
        setColourNote(
          `Suggested the ${ACCENT_LABELS[suggested].toLowerCase()} accent from your logo — change it below if it doesn't feel right.`,
        );
      } else {
        setColourNote("Couldn't detect a colour from this logo — pick your accent below.");
      }
    } finally {
      URL.revokeObjectURL(localUrl);
    }

    const result = await uploadLogo(file);
    if (result) {
      setLogoUrl(`/api/storage${result.objectPath}`);
    } else {
      // Upload failed -- the suggested accent belongs to a logo that was
      // never actually saved server-side; revert rather than leave it
      // paired with the old (unchanged) logoUrl.
      setAccent(priorAccent);
      setColourNote(null);
    }
  };

  const handleFaviconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const result = await uploadFavicon(file);
    if (result) setFaviconUrl(`/api/storage${result.objectPath}`);
  };

  const save = () => {
    setError(null);
    update.mutate({
      data: {
        name: name.trim(),
        shortName: brand.shortName,
        logoUrl: logoUrl || null,
        faviconUrl: faviconUrl || null,
        // The accent slot carries the chosen token's canonical hex; the other
        // colour slots pass through unchanged (they still feed scorecard
        // rendering and the juniors banner, not the site theme).
        primaryColour: brand.primaryColour,
        secondaryColour: ACCENT_HEX[accent],
        tertiaryColour: brand.tertiaryColour,
      },
    });
  };

  const previewBrand = {
    ...brand,
    name,
    logoUrl: logoUrl || null,
    secondaryColour: ACCENT_HEX[accent],
  };
  // Scoped to this container's own subtree via inline style, not
  // document.documentElement -- editing here must not reskin the rest of the
  // admin shell (every other open tab and control) while the admin is mid-edit.
  const previewStyle = deriveThemeTokens(previewBrand, mode) as CSSProperties;

  const busy = isUploadingLogo || isUploadingFavicon || update.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Club name</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="brand-name">Name</Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-brand-name"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo &amp; favicon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <img src={logoUrl} alt="Club logo" className="h-12 w-12 rounded object-contain border" />
                )}
                <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  {isUploadingLogo ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    className="hidden"
                    onChange={handleLogoFile}
                    disabled={busy}
                    data-testid="input-logo-upload"
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Uploading a logo suggests an accent colour below automatically.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Favicon</Label>
              <div className="flex items-center gap-3">
                {faviconUrl && (
                  <img src={faviconUrl} alt="Favicon" className="h-6 w-6 rounded object-contain border" />
                )}
                <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  {isUploadingFavicon ? "Uploading…" : faviconUrl ? "Change favicon" : "Upload favicon"}
                  <input
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml"
                    className="hidden"
                    onChange={handleFaviconFile}
                    disabled={busy}
                    data-testid="input-favicon-upload"
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accent colour</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your club's accent — used for buttons, highlights, and every number
              that matters. The rest of the theme is the same considered palette
              for every club, in light and dark.
            </p>
            {colourNote && <p className="text-sm text-muted-foreground">{colourNote}</p>}
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
              {ACCENT_ORDER.map((token) => (
                <button
                  key={token}
                  type="button"
                  role="radio"
                  aria-checked={accent === token}
                  onClick={() => setAccent(token)}
                  disabled={busy}
                  data-testid={`swatch-accent-${token}`}
                  className={`flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors ${
                    accent === token ? "border-ring" : "border-border hover:border-muted-foreground"
                  }`}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: ACCENT_HEX[token] }}
                  >
                    {accent === token && <Check className="h-4 w-4 text-[#0B0F1A]" />}
                  </span>
                  <span className="text-xs font-medium">{ACCENT_LABELS[token]}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button onClick={save} disabled={busy} data-testid="button-save-branding">
          {update.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save branding
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Live preview</Label>
        <div
          style={previewStyle}
          className="rounded-lg border bg-background text-foreground p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            {previewBrand.logoUrl && (
              <img src={previewBrand.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />
            )}
            <span className="font-serif text-xl font-bold">{previewBrand.name}</span>
          </div>
          <div className="rounded-md border bg-card text-card-foreground p-4">
            <div className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium inline-block">
              Primary button
            </div>
            <div className="mt-2 rounded-md bg-secondary text-secondary-foreground px-3 py-2 text-sm font-medium inline-block ml-2">
              Secondary
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          This preview is scoped to this card only — it doesn't change the rest of the
          admin dashboard while you're editing.
        </p>
      </div>
    </div>
  );
}
