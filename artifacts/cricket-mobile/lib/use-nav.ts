import { useListNavItems } from "@workspace/api-client-react";
import { resolveNavItems, type NavSurface, type ResolvedNavItem } from "@workspace/scorecard";

export {
  NAV_SURFACES,
  isExternalNavTarget,
  resolveNavItems,
  toResolvedNavItem,
  type NavItemLike,
  type NavSurface,
  type ResolvedNavItem,
} from "@workspace/scorecard";

// Fetch the public (visible-only) items for a surface, falling back to the
// supplied hard-coded list if the config has not loaded or is empty — so the
// app always renders even if the API is unavailable or unseeded. Shares
// `resolveNavItems` with the web app (artifacts/cricket-club/src/lib/use-nav.ts)
// so admin edits to menus reach mobile users too.
export function useNavSurface(
  surface: NavSurface,
  fallback: ResolvedNavItem[],
): ResolvedNavItem[] {
  const { data } = useListNavItems({ surface });
  return resolveNavItems(surface, data, fallback);
}
