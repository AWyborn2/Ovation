import { useListNavItems, type NavItem } from "@workspace/api-client-react";

export type NavSurface =
  | "senior_menu"
  | "junior_menu"
  | "junior_quick_links"
  | "admin_tiles";

export type ResolvedNavItem = {
  label: string;
  target: string;
  isExternal: boolean;
  iconKey: string;
  description: string;
};

// Fetch the public (visible-only) items for a surface, falling back to the
// supplied hard-coded list if the config has not loaded or is empty — so the
// app always renders even if the API is unavailable or unseeded. Mirrors the
// web app's useNavSurface (artifacts/cricket-club/src/lib/use-nav.ts) so admin
// edits to menus reach mobile users too.
export function useNavSurface(
  surface: NavSurface,
  fallback: ResolvedNavItem[],
): ResolvedNavItem[] {
  const { data } = useListNavItems({ surface });
  if (data && data.length > 0) {
    return data.map(toResolved);
  }
  return fallback;
}

function toResolved(item: NavItem): ResolvedNavItem {
  return {
    label: item.label,
    target: item.target,
    isExternal: item.isExternal,
    iconKey: item.iconKey,
    description: item.description,
  };
}
