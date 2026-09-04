import React, { createContext, useContext, useMemo } from "react";
import {
  getGetTenantBrandQueryKey,
  useGetTenantBrand,
  type PlatformBrand,
  type TenantBrand,
} from "@workspace/api-client-react";

import { DEFAULT_BRAND } from "@/constants/brand";

/**
 * Per-tenant brand for the mobile app, fetched once from `GET /tenant-brand`
 * (the same endpoint the web app's `brand-context.tsx` uses). Which tenant
 * answers is decided by the API from the request: the host `EXPO_PUBLIC_DOMAIN`
 * points at (a tenant subdomain / custom domain in production) or, on dev
 * hosts only, the `x-tenant-id` header set from `EXPO_PUBLIC_TENANT_ID` in
 * `app/_layout.tsx`.
 *
 * Until the request resolves — or if it fails — screens show the neutral
 * {@link DEFAULT_BRAND} placeholders, never a specific club's values.
 */

export type MobileBrand = {
  /** Full club name, as set on the tenant record. */
  name: string;
  /** Short label for tight UI (scorecards, headings); falls back to `name`. */
  shortName: string;
  /** Possessive form for body copy ("…for <shortName>'s players"). */
  possessive: string;
  /** Sub-line for the home hero; null = show nothing (never invent one). */
  tagline: string | null;
  logoUrl: string | null;
  primaryColour: string | null;
  backgroundColour: string | null;
  juniorsColour: string | null;
  /** True once the brand request has resolved to a tenant brand. */
  isLoaded: boolean;
};

/** Trim a nullable API string; empty → null. */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function possessiveOf(shortName: string): string {
  return `${shortName}'s`;
}

function fromDefaults(isLoaded: boolean): MobileBrand {
  return {
    ...DEFAULT_BRAND,
    possessive: possessiveOf(DEFAULT_BRAND.shortName),
    isLoaded,
  };
}

/** True when the response is the apex/platform marker rather than a tenant brand. */
function isPlatformResponse(
  data: TenantBrand | PlatformBrand | undefined,
): data is PlatformBrand {
  return !!data && "platform" in data && data.platform === true;
}

/** Build the mobile brand from a tenant response, defaulting every gap. */
function fromTenantResponse(data: TenantBrand): MobileBrand {
  const name = text(data.name) ?? DEFAULT_BRAND.name;
  const shortName = text(data.shortName) ?? name;
  return {
    name,
    shortName,
    possessive: possessiveOf(shortName),
    tagline: text(data.tagline),
    logoUrl: text(data.logoUrl128) ?? text(data.logoUrl),
    primaryColour: text(data.primaryColour),
    backgroundColour: text(data.backgroundColour),
    juniorsColour: text(data.juniorsColour),
    isLoaded: true,
  };
}

const BrandContext = createContext<MobileBrand>(fromDefaults(false));

/**
 * Fetches the tenant brand and exposes it via {@link useBrand}. Must sit inside
 * the `QueryClientProvider` (it uses the generated react-query hook).
 */
export function TenantBrandProvider({ children }: { children: React.ReactNode }) {
  const { data } = useGetTenantBrand({
    query: { queryKey: getGetTenantBrandQueryKey(), staleTime: Infinity },
  });

  const brand = useMemo<MobileBrand>(() => {
    if (!data) return fromDefaults(false);
    // The apex/marketing host has no tenant: keep the neutral placeholders
    // (a mobile build should never be pointed there, but don't show a club).
    if (isPlatformResponse(data)) return fromDefaults(false);
    return fromTenantResponse(data);
  }, [data]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

/** The current tenant's brand (neutral defaults until the request resolves). */
export function useBrand(): MobileBrand {
  return useContext(BrandContext);
}
