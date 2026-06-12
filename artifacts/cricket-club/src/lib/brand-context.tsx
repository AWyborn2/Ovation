import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import {
  useGetTenantBrand,
  getGetTenantBrandQueryKey,
  type TenantBrand,
} from "@workspace/api-client-react";
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";

/**
 * Per-tenant brand for the web app. Fetched once from `GET /tenant-brand` and
 * used for: the layout header/footer/copyright, document.title, and the runtime
 * CSS theme tokens (so a tenant reskins without a code change). Falls back to the
 * built-in default brand until the request resolves.
 */

const BrandContext = createContext<ClubBrand>(DEFAULT_BRAND);

/** The current tenant's brand (default brand until the request resolves). */
export function useTenantBrand(): ClubBrand {
  const q = useGetTenantBrand({ query: { queryKey: getGetTenantBrandQueryKey() } });
  return (q.data as TenantBrand | undefined) ?? DEFAULT_BRAND;
}

/** Read the brand from context (set once by {@link BrandProvider}). */
export function useBrand(): ClubBrand {
  return useContext(BrandContext);
}

/** "#rrggbb" → "H S% L%" triplet for an HSL CSS custom property. */
function hexToHslTriplet(hex?: string | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let hue = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        hue = ((g - b) / d) % 6;
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Apply the tenant brand to the runtime theme: the gold-family accent tokens
 * come from the brand's secondary colour, the dark-on-accent foreground from the
 * primary, and the juniors banner accent from the tertiary (default brown). Also
 * sets the document title. For tenant #1 (Halls Head) these equal the built-in
 * defaults, so the look is unchanged.
 */
function applyBrandTheme(brand: ClubBrand): void {
  const root = document.documentElement;
  const accent = hexToHslTriplet(brand.secondaryColour);
  const chrome = hexToHslTriplet(brand.primaryColour);

  if (accent) {
    for (const v of [
      "--primary",
      "--ring",
      "--accent",
      "--card-border",
      "--secondary-foreground",
    ]) {
      root.style.setProperty(v, accent);
    }
    // Slightly darker variant for button borders.
    const parts = accent.split(" ");
    const lum = parseInt(parts[2], 10);
    const darker = `${parts[0]} ${parts[1]} ${Math.max(0, lum - 7)}%`;
    for (const v of ["--primary-border", "--accent-border"]) {
      root.style.setProperty(v, darker);
    }
  }
  if (chrome) {
    for (const v of ["--primary-foreground", "--accent-foreground"]) {
      root.style.setProperty(v, chrome);
    }
  }
  // The juniors section banner accent (default club brown).
  root.style.setProperty("--juniors-accent", brand.tertiaryColour ?? "#42342B");

  if (brand.name) document.title = brand.name;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const brand = useTenantBrand();
  useEffect(() => {
    applyBrandTheme(brand);
  }, [brand]);
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
