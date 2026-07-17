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
import { ColourSlotPicker } from "@/components/colour-slot-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Check } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { contrastWarningMessage } from "@/pages/platform-admin/branding-card";
import { GradeBadge, BADGE_STYLE_ORDER, BADGE_STYLE_LABELS, type BadgeStyle } from "@/components/grade-badge";
import { BadgeStyleContext } from "@/lib/brand-context";

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

type ColourTab = "preset" | "custom";

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

  const [colourTab, setColourTab] = useState<ColourTab>("preset");

  // Preset mode state
  const [accent, setAccent] = useState<AccentToken>(
    snapHexToAccentToken(brand.primaryColour ?? brand.backgroundColour),
  );

  // Custom mode state — all three colour slots
  const [customPrimary, setCustomPrimary] = useState(brand.backgroundColour ?? "#1A3350");
  const [customSecondary, setCustomSecondary] = useState(
    brand.primaryColour ?? ACCENT_HEX[snapHexToAccentToken(brand.primaryColour ?? brand.backgroundColour)],
  );
  const [customTertiary, setCustomTertiary] = useState(brand.juniorsColour ?? "#2A4060");

  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>(
    (brand.badgeStyle as BadgeStyle | null | undefined) ?? "diamond",
  );
  const [useNavyBase, setUseNavyBase] = useState<boolean>(brand.useNavyBase ?? false);
  const [colourNote, setColourNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(brand.name);
    setLogoUrl(brand.logoUrl ?? "");
    setFaviconUrl(brand.faviconUrl ?? "");
    const snapped = snapHexToAccentToken(brand.primaryColour ?? brand.backgroundColour);
    setAccent(snapped);
    setCustomPrimary(brand.backgroundColour ?? "#1A3350");
    setCustomSecondary(brand.primaryColour ?? ACCENT_HEX[snapped]);
    setCustomTertiary(brand.juniorsColour ?? "#2A4060");
    setBadgeStyle((brand.badgeStyle as BadgeStyle | null | undefined) ?? "diamond");
    setUseNavyBase(brand.useNavyBase ?? false);
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

    const priorAccent = accent;
    const localUrl = URL.createObjectURL(file);
    try {
      const palette = await extractBrandPalette(localUrl);
      if (palette.backgroundColour) {
        const suggested = snapHexToAccentToken(
          palette.primaryColour ?? palette.backgroundColour,
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
    if (colourTab === "preset") {
      update.mutate({
        data: {
          name: name.trim(),
          shortName: brand.shortName,
          logoUrl: logoUrl || null,
          faviconUrl: faviconUrl || null,
          backgroundColour: brand.backgroundColour,
          primaryColour: ACCENT_HEX[accent],
          juniorsColour: brand.juniorsColour,
          badgeStyle: badgeStyle,
          useNavyBase: useNavyBase,
        },
      });
    } else {
      update.mutate({
        data: {
          name: name.trim(),
          shortName: brand.shortName,
          logoUrl: logoUrl || null,
          faviconUrl: faviconUrl || null,
          backgroundColour: customPrimary || null,
          primaryColour: customSecondary || null,
          juniorsColour: customTertiary || null,
          badgeStyle: badgeStyle,
          useNavyBase: useNavyBase,
        },
      });
    }
  };

  // Compute the preview brand based on active tab
  const previewSecondary =
    colourTab === "preset" ? ACCENT_HEX[accent] : customSecondary;
  const previewBrand = {
    ...brand,
    name,
    logoUrl: logoUrl || null,
    backgroundColour: colourTab === "preset" ? brand.backgroundColour : customPrimary,
    primaryColour: previewSecondary,
    juniorsColour: colourTab === "preset" ? brand.juniorsColour : customTertiary,
    useNavyBase,
  };
  const previewStyle = deriveThemeTokens(previewBrand, mode) as CSSProperties;

  const contrastWarning =
    colourTab === "custom"
      ? contrastWarningMessage([customPrimary, customSecondary, customTertiary], mode)
      : null;

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
            <CardTitle>Colours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your club's colours — used for buttons, highlights, and every number
              that matters.
            </p>

            {/* useNavyBase toggle */}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useNavyBase}
                onChange={(e) => setUseNavyBase(e.target.checked)}
                disabled={busy}
                data-testid="toggle-navy-base"
                className="rounded"
              />
              <span className="font-medium">Use standard navy background</span>
              <span className="text-muted-foreground">
                — keeps Ovation's built-in page colour
              </span>
            </label>

            {/* Preset / Custom tab bar */}
            <div className="flex gap-1 rounded-md border border-border bg-muted p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setColourTab("preset")}
                disabled={busy}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  colourTab === "preset"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Preset
              </button>
              <button
                type="button"
                onClick={() => setColourTab("custom")}
                disabled={busy}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  colourTab === "custom"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom
              </button>
            </div>

            {colourTab === "preset" ? (
              <div className="space-y-3">
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
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enter exact hex, RGB, or Pantone codes for your official club colours.
                </p>
                <ColourSlotPicker
                  label="Background colour"
                  description="Scorecards, share card backgrounds"
                  value={customPrimary}
                  onChange={setCustomPrimary}
                  disabled={busy}
                />
                <ColourSlotPicker
                  label="Primary colour"
                  description="Buttons, nav highlights, badges, all interactive colours"
                  value={customSecondary}
                  onChange={setCustomSecondary}
                  disabled={busy}
                />
                <ColourSlotPicker
                  label="Juniors colour"
                  description="Juniors section banner only"
                  value={customTertiary}
                  onChange={setCustomTertiary}
                  disabled={busy}
                />
                {contrastWarning && (
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    {contrastWarning}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badge style</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The shape used for grade badges across your site.
            </p>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Badge style">
              {BADGE_STYLE_ORDER.map((style) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={badgeStyle === style}
                  onClick={() => setBadgeStyle(style)}
                  disabled={busy}
                  data-testid={`swatch-badge-${style}`}
                  className={`flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors ${
                    badgeStyle === style ? "border-ring" : "border-border hover:border-muted-foreground"
                  }`}
                >
                  <BadgeStyleContext.Provider value={style}>
                    <GradeBadge grade="A Grade" size="md" badgeStyle={style} />
                  </BadgeStyleContext.Provider>
                  <span className="text-xs font-medium">{BADGE_STYLE_LABELS[style]}</span>
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
          <div className="flex items-center gap-3">
            <BadgeStyleContext.Provider value={badgeStyle}>
              <GradeBadge grade="A Grade" size="md" badgeStyle={badgeStyle} />
              <GradeBadge grade="B Grade" size="md" badgeStyle={badgeStyle} />
            </BadgeStyleContext.Provider>
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
