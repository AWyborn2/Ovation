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
import { deriveThemeTokens, hslTripletToHex } from "@/lib/theme-tokens";
import { useThemeMode } from "@/lib/theme-context";
import {
  APP_LOOKS,
  CURATED_COLOUR_CONTROLS,
  RADIUS_OPTIONS,
  FONT_OPTIONS,
  DEFAULT_RADIUS,
  DEFAULT_FONT_SANS,
} from "@/lib/branding-controls";
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
  const [tagline, setTagline] = useState(brand.tagline ?? "");
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
  const [backgroundUrl, setBackgroundUrl] = useState(brand.backgroundUrl ?? "");
  // Per-token overrides (curated subset). Only customised keys are present; an
  // empty map = a fully-derived theme, saved as null.
  const [overrides, setOverrides] = useState<Record<string, string>>(
    { ...(brand.themeOverrides ?? {}) },
  );
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    Object.keys(brand.themeOverrides ?? {}).length > 0,
  );
  const [colourNote, setColourNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(brand.name);
    setTagline(brand.tagline ?? "");
    setLogoUrl(brand.logoUrl ?? "");
    setFaviconUrl(brand.faviconUrl ?? "");
    const snapped = snapHexToAccentToken(brand.primaryColour ?? brand.backgroundColour);
    setAccent(snapped);
    setCustomPrimary(brand.backgroundColour ?? "#1A3350");
    setCustomSecondary(brand.primaryColour ?? ACCENT_HEX[snapped]);
    setCustomTertiary(brand.juniorsColour ?? "#2A4060");
    setBadgeStyle((brand.badgeStyle as BadgeStyle | null | undefined) ?? "diamond");
    setUseNavyBase(brand.useNavyBase ?? false);
    setBackgroundUrl(brand.backgroundUrl ?? "");
    setOverrides({ ...(brand.themeOverrides ?? {}) });
  }, [brand]);

  /** Set (value) or clear (null) a group of override keys together. */
  const setOverrideKeys = (keys: string[], value: string | null): void => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        if (value == null) delete next[k];
        else next[k] = value;
      }
      return next;
    });
  };

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
  const { uploadFile: uploadBackground, isUploading: isUploadingBackground } = useUpload({
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

  const handleBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const result = await uploadBackground(file);
    if (result) setBackgroundUrl(`/api/storage${result.objectPath}`);
  };

  // An empty override map clears the column back to a fully-derived theme.
  const themeOverridesPayload =
    Object.keys(overrides).length > 0 ? overrides : null;

  const save = () => {
    setError(null);
    const shared = {
      name: name.trim(),
      shortName: brand.shortName,
      tagline: tagline.trim() || null,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      backgroundUrl: backgroundUrl || null,
      badgeStyle: badgeStyle,
      useNavyBase: useNavyBase,
      themeOverrides: themeOverridesPayload,
    };
    if (colourTab === "preset") {
      update.mutate({
        data: {
          ...shared,
          backgroundColour: brand.backgroundColour,
          primaryColour: ACCENT_HEX[accent],
          juniorsColour: brand.juniorsColour,
        },
      });
    } else {
      update.mutate({
        data: {
          ...shared,
          backgroundColour: customPrimary || null,
          primaryColour: customSecondary || null,
          juniorsColour: customTertiary || null,
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
    backgroundUrl: backgroundUrl || null,
    useNavyBase,
    themeOverrides: themeOverridesPayload,
  };
  const previewStyle = deriveThemeTokens(previewBrand, mode) as CSSProperties;

  // The derived scale WITHOUT overrides — used to seed each override control's
  // picker with the value it is replacing, so "custom" starts from the auto colour.
  const autoTokens = deriveThemeTokens(
    { ...previewBrand, themeOverrides: undefined },
    mode,
  );
  const autoHex = (key: string): string =>
    hslTripletToHex(autoTokens[key]) ?? "#334155";

  const contrastWarning =
    colourTab === "custom"
      ? contrastWarningMessage([customPrimary, customSecondary, customTertiary], mode)
      : null;

  const busy =
    isUploadingLogo ||
    isUploadingFavicon ||
    isUploadingBackground ||
    update.isPending;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        {/* Setting cards flow across two columns (masonry) to fill the width;
            break-inside-avoid keeps each card intact. */}
        <div className="gap-6 sm:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
        <Card>
          <CardHeader>
            <CardTitle>App look</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose the overall look of your site. You can still set your accent
              colour and fine-tune below either way.
            </p>
            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="App look"
            >
              {APP_LOOKS.map((look) => {
                const selected = useNavyBase === look.useNavyBase;
                return (
                  <button
                    key={look.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setUseNavyBase(look.useNavyBase)}
                    disabled={busy}
                    data-testid={`app-look-${look.id}`}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-ring ring-1 ring-ring"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="flex h-12 w-full items-center gap-1 overflow-hidden rounded-md border"
                      style={{
                        backgroundColor:
                          look.id === "broadcast"
                            ? "#0B0F1A"
                            : (colourTab === "preset"
                                ? brand.backgroundColour
                                : customPrimary) ?? "#334155",
                      }}
                    >
                      <span
                        className="ml-2 h-5 w-10 rounded"
                        style={{
                          backgroundColor:
                            colourTab === "preset"
                              ? ACCENT_HEX[accent]
                              : customSecondary,
                        }}
                      />
                    </span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {selected && <Check className="h-4 w-4 text-primary" />}
                      {look.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {look.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {!useNavyBase && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label>Background image (optional)</Label>
                <div className="flex items-center gap-3">
                  {backgroundUrl && (
                    <img
                      src={backgroundUrl}
                      alt="Background"
                      className="h-12 w-20 rounded object-cover border"
                    />
                  )}
                  <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                    {isUploadingBackground
                      ? "Uploading…"
                      : backgroundUrl
                        ? "Change image"
                        : "Upload image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleBackgroundFile}
                      disabled={busy}
                      data-testid="input-background-upload"
                    />
                  </label>
                  {backgroundUrl && (
                    <button
                      type="button"
                      onClick={() => setBackgroundUrl("")}
                      disabled={busy}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sits subtly behind your pages. Leave empty for a flat colour.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Club name</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Name</Label>
              <Input
                id="brand-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-brand-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-tagline">Tagline</Label>
              <Input
                id="brand-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. CRICKET CLUB · EST 1991"
                data-testid="input-brand-tagline"
              />
              <p className="text-xs text-muted-foreground">
                Shown under your club name on share cards. Leave blank for none.
              </p>
            </div>
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

        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
              data-testid="toggle-advanced-panel"
              aria-expanded={advancedOpen}
            >
              <CardTitle>Advanced colours &amp; style</CardTitle>
              <span className="text-sm text-muted-foreground">
                {advancedOpen ? "Hide" : "Show"}
              </span>
            </button>
          </CardHeader>
          {advancedOpen && (
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Fine-tune individual surfaces and text colours. Each is derived
                automatically from your colours until you set it — leave on{" "}
                <em>Auto</em> for the guardrailed default. Text colours invert
                automatically between light and dark mode so they stay readable.
              </p>

              <div className="space-y-3">
                {CURATED_COLOUR_CONTROLS.map((c) => {
                  const isCustom = c.keys.every((k) => k in overrides);
                  const value = overrides[c.keys[0]] ?? autoHex(c.keys[0]);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{c.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.description}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => setOverrideKeys(c.keys, e.target.value)}
                          disabled={busy}
                          data-testid={`override-${c.id}`}
                          aria-label={`${c.label} colour`}
                          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                        />
                        {isCustom ? (
                          <button
                            type="button"
                            onClick={() => setOverrideKeys(c.keys, null)}
                            disabled={busy}
                            data-testid={`override-${c.id}-reset`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Reset
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Auto</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <div>
                  <div className="text-sm font-medium">Corner radius</div>
                  <div className="text-xs text-muted-foreground">
                    Roundness of cards, buttons and inputs.
                  </div>
                </div>
                <select
                  value={overrides["--radius"] ?? DEFAULT_RADIUS}
                  onChange={(e) =>
                    setOverrideKeys(
                      ["--radius"],
                      e.target.value === DEFAULT_RADIUS ? null : e.target.value,
                    )
                  }
                  disabled={busy}
                  data-testid="override-radius"
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  {RADIUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Body font</div>
                  <div className="text-xs text-muted-foreground">
                    Typeface for body text across your site.
                  </div>
                </div>
                <select
                  value={overrides["--app-font-sans"] ?? DEFAULT_FONT_SANS}
                  onChange={(e) =>
                    setOverrideKeys(
                      ["--app-font-sans"],
                      e.target.value === DEFAULT_FONT_SANS ? null : e.target.value,
                    )
                  }
                  disabled={busy}
                  data-testid="override-font"
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  {FONT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {Object.keys(overrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setOverrides({})}
                  disabled={busy}
                  data-testid="override-reset-all"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Reset all to auto
                </button>
              )}
            </CardContent>
          )}
        </Card>
        </div>

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

      <div className="space-y-2 xl:sticky xl:top-6 xl:self-start">
        <Label>Live preview</Label>
        <div
          style={previewStyle}
          className="rounded-lg border bg-background font-sans text-foreground p-6 space-y-4"
          data-testid="branding-live-preview"
        >
          <div className="flex items-center gap-3">
            {previewBrand.logoUrl && (
              <img src={previewBrand.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />
            )}
            <span className="font-serif text-xl font-bold">{previewBrand.name}</span>
          </div>
          <div className="rounded-md border bg-card text-card-foreground p-4 space-y-3">
            <p className="text-sm">
              Body text on a card surface — this is how a paragraph reads.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
                Primary button
              </span>
              <span className="rounded-md bg-secondary text-secondary-foreground px-3 py-2 text-sm font-medium">
                Secondary
              </span>
              <span className="rounded-md bg-destructive text-destructive-foreground px-3 py-2 text-sm font-medium">
                Delete
              </span>
            </div>
            <div className="rounded-md bg-muted text-muted-foreground px-3 py-2 text-sm">
              Muted panel
            </div>
            <div className="rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
              Input field
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
          Updates live as you edit — background, surfaces, buttons, borders, radius
          and fonts all reflect your changes here before you save.
        </p>
      </div>
    </div>
  );
}
