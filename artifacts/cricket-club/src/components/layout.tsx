import { useCallback, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { groupNavItems, sectionOf } from "@/lib/nav-groups";
import { WelcomeGuide } from "@/components/welcome-guide";
import { SiteHeader } from "@/components/broadcast/site-header";
import { SiteFooter } from "@/components/broadcast/site-footer";
import { SearchPalette, useSearchShortcut } from "@/components/broadcast/search-palette";

// Hard-coded fallbacks used until the nav config loads (or if it fails). These
// mirror the seeded senior/junior menus so the site is never blank.
const SENIOR_NAV_FALLBACK: ResolvedNavItem[] = [
  {
    label: "Honour Boards",
    target: "/honour-boards",
    isExternal: false,
    iconKey: "scrollText",
    description: "",
  },
  { label: "Players", target: "/players", isExternal: false, iconKey: "users", description: "" },
  {
    label: "Matches",
    target: "/matches",
    isExternal: false,
    iconKey: "clipboardList",
    description: "",
  },
  {
    label: "Fixtures",
    target: "/fixtures",
    isExternal: false,
    iconKey: "calendarDays",
    description: "",
  },
  { label: "Grades", target: "/grades", isExternal: false, iconKey: "trophy", description: "" },
  { label: "Records", target: "/records", isExternal: false, iconKey: "award", description: "" },
  {
    label: "Premierships",
    target: "/premierships",
    isExternal: false,
    iconKey: "crown",
    description: "",
  },
  {
    label: "Compare",
    target: "/compare",
    isExternal: false,
    iconKey: "gitCompare",
    description: "",
  },
];

const JUNIOR_NAV_FALLBACK: ResolvedNavItem[] = [
  {
    label: "Overview",
    target: "/juniors",
    isExternal: false,
    iconKey: "scrollText",
    description: "",
  },
  {
    label: "Matches",
    target: "/juniors/matches",
    isExternal: false,
    iconKey: "clipboardList",
    description: "",
  },
  {
    label: "Premierships",
    target: "/juniors/premierships",
    isExternal: false,
    iconKey: "crown",
    description: "",
  },
  {
    label: "Players",
    target: "/juniors/players",
    isExternal: false,
    iconKey: "users",
    description: "",
  },
  {
    label: "Office Bearers",
    target: "/juniors/office-bearers",
    isExternal: false,
    iconKey: "award",
    description: "",
  },
];

const HOME_ITEM: ResolvedNavItem = {
  label: "Home",
  target: "/",
  isExternal: false,
  iconKey: "home",
  description: "",
};

/**
 * Routes whose pages have been rebuilt on the Broadcast system render
 * full-bleed (heroes span the viewport; pages own their Container). Every
 * other route keeps the centred content column until it is redesigned.
 */
const FULL_BLEED_ROUTES: RegExp[] = [];

export function isFullBleedRoute(location: string): boolean {
  return FULL_BLEED_ROUTES.some((re) => re.test(location));
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const section = sectionOf(location);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);

  const seniorNav = useNavSurface("senior_menu", SENIOR_NAV_FALLBACK);
  const juniorNav = useNavSurface("junior_menu", JUNIOR_NAV_FALLBACK);

  const items = useMemo(
    () =>
      section === "juniors"
        ? juniorNav
        : seniorNav.some((i) => i.target === "/")
          ? seniorNav
          : [HOME_ITEM, ...seniorNav],
    [section, seniorNav, juniorNav],
  );
  const nav = useMemo(() => groupNavItems(items, section), [items, section]);
  const fullBleed = isFullBleedRoute(location);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <WelcomeGuide />
      <SiteHeader section={section} nav={nav} onOpenSearch={openSearch} />
      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        section={section}
        jumpTo={items.filter((i) => i.target !== "/" && i.target !== "/juniors")}
      />
      <main className="relative z-0 w-full flex-1 overflow-x-clip">
        {fullBleed ? (
          children
        ) : (
          <div className="mx-auto max-w-[1280px] space-y-8 px-[var(--pad)] py-[var(--gap-section)]">
            {children}
          </div>
        )}
      </main>
      <SiteFooter nav={nav} />
    </div>
  );
}
