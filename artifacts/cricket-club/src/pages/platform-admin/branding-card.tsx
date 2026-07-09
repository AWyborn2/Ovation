import { useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateAdminTenantBrand,
  getGetAdminTenantQueryKey,
  getListAllTenantsQueryKey,
  type AdminTenant,
  type UpdateAdminTenantBrandBody,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import {
  ACCENT_HEX,
  DEFAULT_BRAND,
  hexToRgb,
  luminance,
  snapHexToAccentToken,
  type AccentToken,
  type ClubBrand,
} from "@workspace/scorecard";
import { deriveThemeTokens } from "@/lib/theme-tokens";
import { useThemeMode } from "@/lib/theme-context";
import { extractBrandPalette, type ExtractedPalette } from "@/lib/color-extraction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const ACCENT_LABELS: Record<AccentToken, string> = {
  amber: "Amber",
  purple: "Purple",
  green: "Green",
  blue: "Blue",
  red: "Red",
};

const ACCENT_ORDER: AccentToken[] = ["amber", "purple", "green", "blue", "red"];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Which colour UI is active. Mode at save time wins (KTD4) — there is never a merged payload. */
export type ColourMode = "token" | "hex";

/** The seven cosmetic fields the concierge PATCH carries, as last persisted. */
export interface PersistedBrandFields {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  tertiaryColour: string | null;
}

/** The colour inputs' current values (both modes' state lives together; only the active mode's is saved). */
export interface ColourEdits {
  accent: AccentToken;
  hexPrimary: string;
  hexSecondary: string;
  hexTertiary: string;
}

/**
 * Seed the card from the tenant-detail response's brand fields; each
 * successful save updates the local persisted record so mode switches re-seed
 * from what was actually written.
 */
export function seedPersistedFromTenant(
  tenant: Pick<
    AdminTenant,
    | "name"
    | "shortName"
    | "logoUrl"
    | "faviconUrl"
    | "primaryColour"
    | "secondaryColour"
    | "tertiaryColour"
  >,
): PersistedBrandFields {
  return {
    name: tenant.name,
    shortName: tenant.shortName ?? null,
    logoUrl: tenant.logoUrl ?? null,
    faviconUrl: tenant.faviconUrl ?? null,
    primaryColour: tenant.primaryColour ?? null,
    secondaryColour: tenant.secondaryColour ?? null,
    tertiaryColour: tenant.tertiaryColour ?? null,
  };
}

/**
 * Seed the colour inputs from the last persisted brand values. Called on mount
 * and on every mode switch, so unsaved edits from the other mode are discarded
 * (KTD4) rather than leaking across modes. Unset persisted colours fall back to
 * the neutral defaults so the `<input type="color">` swatches stay valid.
 */
export function seedColourState(persisted: PersistedBrandFields): ColourEdits {
  const accent = snapHexToAccentToken(
    persisted.secondaryColour ?? persisted.primaryColour,
  );
  return {
    accent,
    hexPrimary: persisted.primaryColour ?? (DEFAULT_BRAND.primaryColour as string),
    hexSecondary: persisted.secondaryColour ?? ACCENT_HEX[accent],
    hexTertiary: persisted.tertiaryColour ?? (DEFAULT_BRAND.tertiaryColour as string),
  };
}

/**
 * Build the PATCH body for the active mode (KTD4 — mode at save time wins).
 * Token mode writes the chosen token's canonical hex to the accent slot and
 * passes the persisted primary/tertiary through unchanged (exact parity with
 * the self-serve editor's save payload); hex mode writes all three chosen
 * values.
 */
export function buildBrandSavePayload(args: {
  persisted: PersistedBrandFields;
  name: string;
  shortName: string;
  logoUrl: string;
  faviconUrl: string;
  colourMode: ColourMode;
  colours: ColourEdits;
}): UpdateAdminTenantBrandBody {
  const { persisted, colours } = args;
  const base = {
    name: args.name.trim(),
    shortName: args.shortName.trim() || null,
    logoUrl: args.logoUrl || null,
    faviconUrl: args.faviconUrl || null,
  };
  if (args.colourMode === "token") {
    return {
      ...base,
      primaryColour: persisted.primaryColour,
      secondaryColour: ACCENT_HEX[colours.accent],
      tertiaryColour: persisted.tertiaryColour,
    };
  }
  return {
    ...base,
    primaryColour: colours.hexPrimary || null,
    secondaryColour: colours.hexSecondary || null,
    tertiaryColour: colours.hexTertiary || null,
  };
}

/** Light-mode card surface the theme renders content on (theme-tokens NAVY_LIGHT.card). */
export const LIGHT_SURFACE_HEX = "#ffffff";
/** Dark-mode card surface the theme renders content on (theme-tokens NAVY_DARK[900]). */
export const DARK_SURFACE_HEX = "#131826";

/** WCAG contrast ratio ((L1+0.05)/(L2+0.05)) between two hex colours, or null when unparseable. */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** True when a colour reads poorly (below 4.5:1) against the given surface. */
export function hasLowContrast(colour: string, surfaceHex: string): boolean {
  const ratio = contrastRatio(colour, surfaceHex);
  return ratio !== null && ratio < 4.5;
}

/**
 * Advisory-only contrast check (R7/AE3): the message shown under the pickers
 * when any chosen colour falls below 4.5:1 against the surface of the theme
 * mode currently being previewed, or null when everything passes. Evaluated
 * per-surface (no colour can clear 4.5:1 against both white and navy at once
 * — the accents are fills with dark text, not body text). Never blocks saving
 * — official club colours are sometimes simply low-contrast, and the
 * concierge decides.
 */
export function contrastWarningMessage(
  colours: Array<string | null | undefined>,
  surface: "light" | "dark",
): string | null {
  const surfaceHex = surface === "dark" ? DARK_SURFACE_HEX : LIGHT_SURFACE_HEX;
  for (const colour of colours) {
    if (colour && hasLowContrast(colour, surfaceHex)) {
      return `Low contrast against ${surface} surfaces.`;
    }
  }
  return null;
}

/**
 * Accent suggestion from an extracted logo palette (R5). An all-null
 * extraction degrades to a "couldn't detect" note with the pickers untouched
 * and fully usable — never an error state.
 */
export function suggestionFromPalette(palette: ExtractedPalette): {
  accent: AccentToken | null;
  note: string;
} {
  if (!palette.primaryColour) {
    return {
      accent: null,
      note: "Couldn't detect a colour from this logo — pick the colours below.",
    };
  }
  const accent = snapHexToAccentToken(
    palette.secondaryColour ?? palette.primaryColour,
  );
  return {
    accent,
    note: `Suggested the ${ACCENT_LABELS[accent].toLowerCase()} accent from the logo — change it below if it doesn't feel right.`,
  };
}

const HEX_FIELDS: Array<{
  key: "hexPrimary" | "hexSecondary" | "hexTertiary";
  label: string;
}> = [
  { key: "hexPrimary", label: "Primary" },
  { key: "hexSecondary", label: "Secondary (accent)" },
  { key: "hexTertiary", label: "Tertiary" },
];

/**
 * Concierge branding editor for one tenant (R4–R7). Mirrors the self-serve
 * editor in `pages/admin-branding.tsx` — same upload flow, palette suggestion,
 * accent picker, and card-scoped live preview — plus an advanced exact-hex
 * mode the platform PATCH schema allows.
 */
export function BrandingCard({
  tenantId,
  tenant,
}: {
  tenantId: number;
  tenant: AdminTenant;
}) {
  const qc = useQueryClient();
  const { mode } = useThemeMode();

  const [persisted, setPersisted] = useState<PersistedBrandFields>(() =>
    seedPersistedFromTenant(tenant),
  );
  const [name, setName] = useState(tenant.name);
  const [shortName, setShortName] = useState(tenant.shortName ?? "");
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(tenant.faviconUrl ?? "");
  const [colourMode, setColourMode] = useState<ColourMode>("token");
  const [colours, setColours] = useState<ColourEdits>(() =>
    seedColourState(seedPersistedFromTenant(tenant)),
  );
  const [colourNote, setColourNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = useUpdateAdminTenantBrand({
    mutation: {
      onSuccess: (_data, variables) => {
        setError(null);
        setSaved(true);
        const body = variables.data;
        // Remember what was written so mode switches re-seed from persisted
        // truth, and refresh the tenant queries this page already shows.
        setPersisted((prev) => ({
          name: body.name ?? prev.name,
          shortName: body.shortName ?? null,
          logoUrl: body.logoUrl ?? null,
          faviconUrl: body.faviconUrl ?? null,
          primaryColour: body.primaryColour ?? null,
          secondaryColour: body.secondaryColour ?? null,
          tertiaryColour: body.tertiaryColour ?? null,
        }));
        qc.invalidateQueries({ queryKey: getGetAdminTenantQueryKey(tenantId) });
        qc.invalidateQueries({ queryKey: getListAllTenantsQueryKey() });
      },
      onError: (e) => {
        setSaved(false);
        const status = (e as { status?: number })?.status;
        setError(
          status === 400
            ? "Colours must be 6-digit hex values (e.g. #1A3350)."
            : status === 404
              ? "That tenant no longer exists."
              : "Couldn't save branding.",
        );
      },
    },
  });

  const { uploadFile: uploadLogo, isUploading: isUploadingLogo } = useUpload({
    basePath: "/api/platform/admin/storage",
    onError: (e) => setError(e.message),
  });
  const { uploadFile: uploadFavicon, isUploading: isUploadingFavicon } = useUpload({
    basePath: "/api/platform/admin/storage",
    onError: (e) => setError(e.message),
  });

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(false);
    setColourNote(null);

    // Remember the pre-upload accent so it can be restored if the upload
    // itself fails -- the suggestion below is provisional until the logo it
    // was extracted from is actually saved.
    const priorAccent = colours.accent;

    // Suggest an accent from the local file immediately (a blob: URL is
    // same-origin, so this doesn't need to wait for the upload round-trip).
    const localUrl = URL.createObjectURL(file);
    try {
      const palette = await extractBrandPalette(localUrl);
      const suggestion = suggestionFromPalette(palette);
      const suggested = suggestion.accent;
      if (suggested) {
        setColours((c) => ({ ...c, accent: suggested }));
      }
      setColourNote(suggestion.note);
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
      setColours((c) => ({ ...c, accent: priorAccent }));
      setColourNote(null);
    }
  };

  const handleFaviconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(false);
    const result = await uploadFavicon(file);
    if (result) setFaviconUrl(`/api/storage${result.objectPath}`);
  };

  const switchMode = (next: ColourMode) => {
    if (next === colourMode) return;
    // KTD4: mode at save time wins — switching discards unsaved colour edits
    // from the other mode by re-seeding from the last persisted values.
    setColourMode(next);
    setColours(seedColourState(persisted));
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setError(null);
    update.mutate({
      id: tenantId,
      data: buildBrandSavePayload({
        persisted,
        name,
        shortName,
        logoUrl,
        faviconUrl,
        colourMode,
        colours,
      }),
    });
  };

  const previewColours =
    colourMode === "token"
      ? {
          primaryColour: persisted.primaryColour,
          secondaryColour: ACCENT_HEX[colours.accent],
          tertiaryColour: persisted.tertiaryColour,
        }
      : {
          primaryColour: colours.hexPrimary,
          secondaryColour: colours.hexSecondary,
          tertiaryColour: colours.hexTertiary,
        };
  const previewBrand: ClubBrand = {
    name: name || tenant.name,
    shortName: shortName || null,
    logoUrl: logoUrl || null,
    ...previewColours,
  };
  // Scoped to this container's own subtree via inline style, not
  // document.documentElement -- editing here must not reskin the rest of the
  // platform console while the concierge is mid-edit.
  const previewStyle = deriveThemeTokens(previewBrand, mode) as CSSProperties;

  const warning = contrastWarningMessage(
    colourMode === "token"
      ? [ACCENT_HEX[colours.accent]]
      : [colours.hexPrimary, colours.hexSecondary, colours.hexTertiary],
    mode,
  );

  const busy = isUploadingLogo || isUploadingFavicon || update.isPending;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Branding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Club name</Label>
              <Input
                id="brand-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-brand-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-short-name">Short name</Label>
              <Input
                id="brand-short-name"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g. HHCC"
                data-testid="input-brand-short-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Club logo"
                    className="h-12 w-12 rounded object-contain border"
                  />
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
                    data-testid="input-favicon-upload"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Colours</Label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={colourMode === "hex"}
                    onChange={(e) => switchMode(e.target.checked ? "hex" : "token")}
                    disabled={busy}
                    data-testid="toggle-advanced-colours"
                  />
                  Advanced: exact colours
                </label>
              </div>
              {colourNote && (
                <p className="text-sm text-muted-foreground">{colourNote}</p>
              )}
              {colourMode === "token" ? (
                <div
                  className="flex flex-wrap gap-3"
                  role="radiogroup"
                  aria-label="Accent colour"
                >
                  {ACCENT_ORDER.map((token) => (
                    <button
                      key={token}
                      type="button"
                      role="radio"
                      aria-checked={colours.accent === token}
                      onClick={() => setColours((c) => ({ ...c, accent: token }))}
                      disabled={busy}
                      data-testid={`swatch-accent-${token}`}
                      className={`flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors ${
                        colours.accent === token
                          ? "border-ring"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ backgroundColor: ACCENT_HEX[token] }}
                      >
                        {colours.accent === token && (
                          <Check className="h-4 w-4 text-[#0B0F1A]" />
                        )}
                      </span>
                      <span className="text-xs font-medium">{ACCENT_LABELS[token]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {HEX_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={HEX_RE.test(colours[key]) ? colours[key] : "#000000"}
                        onChange={(e) =>
                          setColours((c) => ({ ...c, [key]: e.target.value }))
                        }
                        disabled={busy}
                        aria-label={`${label} colour`}
                        className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
                        data-testid={`picker-${key}`}
                      />
                      <Input
                        value={colours[key]}
                        onChange={(e) =>
                          setColours((c) => ({ ...c, [key]: e.target.value }))
                        }
                        placeholder="#1A3350"
                        className="font-mono"
                        aria-label={`${label} hex`}
                        data-testid={`input-${key}`}
                      />
                      <span className="w-28 shrink-0 text-xs text-muted-foreground">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {warning && (
                <p className="text-sm text-amber-600 dark:text-amber-500" data-testid="text-contrast-warning">
                  {warning}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy} data-testid="button-save-branding">
                {update.isPending ? "Saving…" : "Save branding"}
              </Button>
              {saved ? <span className="text-sm text-green-600">Saved.</span> : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Live preview</Label>
            <div
              style={previewStyle}
              className="rounded-lg border bg-background text-foreground p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                {previewBrand.logoUrl && (
                  <img
                    src={previewBrand.logoUrl}
                    alt=""
                    className="h-10 w-10 rounded object-contain"
                  />
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
              This preview is scoped to this card only — it doesn't change the rest of
              the platform console while you're editing.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
