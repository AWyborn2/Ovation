import { useTenantBrand } from "./brand-context";

/**
 * The current tenant's official logo URL, resolved from the tenant brand
 * (`GET /tenant-brand`), falling back to the built-in default. Use this
 * everywhere the club logo appears (navbar, page headers) so a logo change in
 * the tenant record propagates across the whole site.
 */
export function useBrandLogo(): string {
  return useTenantBrand().logoUrl ?? "";
}
