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
  type PlatformBrand,
} from "@workspace/api-client-react";
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import { deriveThemeTokens, type ThemeMode } from "@/lib/theme-tokens";
import { useThemeMode } from "@/lib/theme-context";

/**
 * Per-tenant brand for the web app. Fetched once from `GET /tenant-brand` and
 * used for: the layout header/footer/copyright, document.title, and the runtime
 * CSS theme tokens (so a tenant reskins without a code change). Falls back to the
 * built-in default brand until the request resolves.
 *
 * On the apex/marketing host the same endpoint returns `{ platform: true }`
 * instead of a brand; {@link usePlatform} exposes that so the app can mount the
 * landing page tree rather than a club app.
 */

const BrandContext = createContext<ClubBrand>(DEFAULT_BRAND);

/** True when the response is the platform marker rather than a tenant brand. */
function isPlatformResponse(
  data: TenantBrand | PlatformBrand | undefined,
): data is PlatformBrand {
  return !!data && "platform" in data && data.platform === true;
}

export interface PlatformState {
  /** The request resolved to the apex/marketing host (no tenant). */
  isPlatform: boolean;
  /** The brand request is still in flight (mode not yet known). */
  isLoading: boolean;
}

const PlatformContext = createContext<PlatformState>({
  isPlatform: false,
  isLoading: true,
});

/**
 * Badge style context — the tenant's chosen SVG badge shape key (e.g.
 * "diamond", "shield", "hexagon"). Defaults to "diamond". Read by `GradeBadge`
 * so every badge on the page reflects the tenant setting without prop-drilling.
 */
export const BadgeStyleContext = createContext<string>("diamond");

/** Read the active badge style from context. */
export function useBadgeStyle(): string {
  return useContext(BadgeStyleContext);
}

/** The current tenant's brand (default brand until the request resolves). */
export function useTenantBrand(): ClubBrand {
  const q = useGetTenantBrand({ query: { queryKey: getGetTenantBrandQueryKey() } });
  if (isPlatformResponse(q.data)) return DEFAULT_BRAND;
  return (q.data as TenantBrand | undefined) ?? DEFAULT_BRAND;
}

/** Whether this host is the platform/marketing surface, and if still loading. */
export function usePlatform(): PlatformState {
  return useContext(PlatformContext);
}

/** Read the brand from context (set once by {@link BrandProvider}). */
export function useBrand(): ClubBrand {
  return useContext(BrandContext);
}

/**
 * Apply the tenant brand to the runtime theme for the given light/dark mode:
 * every structural + accent CSS custom property comes from
 * {@link deriveThemeTokens} (Phase 5), plus the juniors banner accent (the
 * brand's tertiary colour), document title, per-tenant background image and
 * favicon. For tenant #1 (Halls Head) the derived dark-mode tokens match the
 * app's original hardcoded look (see `theme-tokens.test.ts`); light mode and
 * mode-switching are new.
 */
function applyBrandTheme(brand: ClubBrand, mode: ThemeMode): void {
  const root = document.documentElement;
  const tokens = deriveThemeTokens(brand, mode);
  for (const [prop, value] of Object.entries(tokens)) {
    root.style.setProperty(prop, value);
  }

  // The juniors section banner accent (the brand's own tertiary colour; falls
  // back to the neutral default, never a hardcoded Halls Head literal).
  root.style.setProperty(
    "--juniors-accent",
    brand.tertiaryColour ?? DEFAULT_BRAND.tertiaryColour ?? "#475569",
  );

  // Per-tenant site background (index.css reads --app-bg-image, default none).
  root.style.setProperty(
    "--app-bg-image",
    brand.backgroundUrl ? `url(${brand.backgroundUrl})` : "none",
  );

  if (brand.name) document.title = brand.name;

  // Per-tenant favicon (falls back to index.html's neutral default when unset).
  if (brand.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = brand.faviconUrl;
  }
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const q = useGetTenantBrand({ query: { queryKey: getGetTenantBrandQueryKey() } });
  const isPlatform = isPlatformResponse(q.data);
  const brand = isPlatform ? DEFAULT_BRAND : (q.data as TenantBrand | undefined) ?? DEFAULT_BRAND;
  const { mode } = useThemeMode();
  useEffect(() => {
    // Don't paint a tenant theme onto the platform/marketing surface.
    if (!isPlatform) applyBrandTheme(brand, mode);
  }, [brand, isPlatform, mode]);

  // Badge style — read from the API response (null / undefined → "diamond").
  const badgeStyle =
    (!isPlatform && (q.data as TenantBrand | undefined)?.badgeStyle) || "diamond";

  return (
    <PlatformContext.Provider value={{ isPlatform, isLoading: q.isLoading }}>
      <BrandContext.Provider value={brand}>
        <BadgeStyleContext.Provider value={badgeStyle}>
          {children}
        </BadgeStyleContext.Provider>
      </BrandContext.Provider>
    </PlatformContext.Provider>
  );
}
