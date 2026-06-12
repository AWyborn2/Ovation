import { Link, useLocation } from "wouter";
import { Menu, X, Trophy, Baby, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { useBrandLogo } from "@/lib/use-brand";
import { useBrand } from "@/lib/brand-context";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { useGetTourContent } from "@workspace/api-client-react";
import { launchFanTour, launchAdminTour } from "@/lib/tour";
import { WelcomeGuide } from "@/components/welcome-guide";

// Hard-coded fallbacks used until the nav config loads (or if it fails). These
// mirror the seeded senior/junior menus so the site is never blank.
const SENIOR_NAV_FALLBACK: ResolvedNavItem[] = [
  { label: "Honour Boards", target: "/honour-boards", isExternal: false, iconKey: "scrollText", description: "" },
  { label: "Players", target: "/players", isExternal: false, iconKey: "users", description: "" },
  { label: "Matches", target: "/matches", isExternal: false, iconKey: "clipboardList", description: "" },
  { label: "Grades", target: "/grades", isExternal: false, iconKey: "trophy", description: "" },
  { label: "Records", target: "/records", isExternal: false, iconKey: "award", description: "" },
  { label: "Premierships", target: "/premierships", isExternal: false, iconKey: "crown", description: "" },
  { label: "Compare", target: "/compare", isExternal: false, iconKey: "gitCompare", description: "" },
];

const JUNIOR_NAV_FALLBACK: ResolvedNavItem[] = [
  { label: "Overview", target: "/juniors", isExternal: false, iconKey: "scrollText", description: "" },
  { label: "Matches", target: "/juniors/matches", isExternal: false, iconKey: "clipboardList", description: "" },
  { label: "Premierships", target: "/juniors/premierships", isExternal: false, iconKey: "crown", description: "" },
  { label: "Players", target: "/juniors/players", isExternal: false, iconKey: "users", description: "" },
  { label: "Office Bearers", target: "/juniors/office-bearers", isExternal: false, iconKey: "award", description: "" },
];

// Index pages match only on an exact location; everything else also matches its
// nested routes.
const INDEX_HREFS = new Set(["/", "/juniors"]);

function isItemActive(location: string, href: string): boolean {
  if (INDEX_HREFS.has(href)) return location === href;
  return location === href || location.startsWith(href + "/") || location.startsWith(href);
}

// Section toggle: the prominent top-level Seniors / Juniors switch.
function SectionToggle({ isJuniors }: { isJuniors: boolean }) {
  return (
    <div
      className="inline-flex rounded-full border-2 border-primary overflow-hidden font-serif text-sm uppercase tracking-wider shadow-sm"
      role="group"
      aria-label="Switch between senior and junior cricket"
      data-tour="section-toggle"
    >
      <Link
        href="/"
        className={`px-4 py-1.5 transition-colors ${
          isJuniors ? "text-primary hover:bg-primary/10" : "bg-primary text-primary-foreground"
        }`}
        data-testid="link-section-seniors"
      >
        Seniors
      </Link>
      <Link
        href="/juniors"
        className={`px-4 py-1.5 transition-colors border-l-2 border-primary ${
          isJuniors ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"
        }`}
        data-testid="link-section-juniors"
      >
        Juniors
      </Link>
    </div>
  );
}

// Persistent "Help / Take a tour" control. Launches the admin walkthrough when
// a signed-in admin is on an admin page, otherwise the public fan tour.
function HelpButton({ className }: { className?: string }) {
  const [location, navigate] = useLocation();
  const me = useCurrentAdmin();
  const tourContentQ = useGetTourContent();
  const onAdmin = location === "/admin" || location.startsWith("/admin/");
  const launch = () => {
    if (onAdmin && me.data) {
      launchAdminTour(tourContentQ.data);
    } else {
      launchFanTour(navigate, location, tourContentQ.data);
    }
  };
  return (
    <button
      type="button"
      onClick={launch}
      data-tour="help-button"
      aria-label="Help and guided tour"
      title="Help / Take a tour"
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/60 px-3 py-1.5 text-primary text-sm font-serif uppercase tracking-wider transition-colors hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className ?? ""}`}
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden lg:inline">Help</span>
    </button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const me = useCurrentAdmin();
  const logoUrl = useBrandLogo();
  const brand = useBrand();

  const isJuniors = location === "/juniors" || location.startsWith("/juniors/");

  const seniorNav = useNavSurface("senior_menu", SENIOR_NAV_FALLBACK);
  const juniorNav = useNavSurface("junior_menu", JUNIOR_NAV_FALLBACK);

  const navigation: ResolvedNavItem[] = isJuniors
    ? juniorNav
    : [
        ...seniorNav,
        // The Admin entry is auto-appended for signed-in admins and is never
        // part of the configurable senior menu.
        ...(me.data
          ? [
              {
                label: "Admin",
                target: "/admin",
                isExternal: false,
                iconKey: "settings",
                description: "",
              },
            ]
          : []),
      ];

  // Juniors uses the same gold accents as seniors; only the section banner below
  // stays brown (with gold writing) to distinguish the two sides.
  const activeText = "text-primary";
  const activeBorder = "border-primary";
  const hoverText = "hover:text-primary";
  const hoverBorder = "hover:border-primary/50";
  const activeMobileBg = "bg-primary text-primary-foreground";

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <WelcomeGuide />
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-24 gap-4">

            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link href={isJuniors ? "/juniors" : "/"}>
                <img src={logoUrl} alt={brand.name} className="h-20 w-auto" />
              </Link>
            </div>

            {/* Desktop Navigation + section toggle */}
            <div className="hidden md:flex items-center gap-6">
              <nav className="flex items-center space-x-6" data-tour="main-nav">
                {navigation.map((item, idx) => {
                  const isActive = !item.isExternal && isItemActive(location, item.target);
                  const cls = `font-serif text-base lg:text-lg uppercase tracking-wider transition-colors py-2 border-b-2 ${
                    isActive
                      ? `${activeText} ${activeBorder}`
                      : `text-muted-foreground border-transparent ${hoverText} ${hoverBorder}`
                  }`;
                  return item.isExternal ? (
                    <a key={`${item.target}-${idx}`} href={item.target} target="_blank" rel="noopener noreferrer" className={cls}>
                      {item.label}
                    </a>
                  ) : (
                    <Link key={`${item.target}-${idx}`} href={item.target} className={cls}>
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <SectionToggle isJuniors={isJuniors} />
              <HelpButton />
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-3">
              <SectionToggle isJuniors={isJuniors} />
              <HelpButton />
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-primary hover:text-primary/80 focus:outline-none"
                data-tour="main-nav"
                aria-label="Open navigation menu"
              >
                {isMobileMenuOpen ? <X className="h-8 w-8" /> : <Menu className="h-8 w-8" />}
              </button>
            </div>
          </div>
        </div>

        {/* Section banner — makes the active side obvious. */}
        <div
          className={`w-full border-t ${
            isJuniors
              ? "text-primary"
              : "bg-primary text-primary-foreground border-primary"
          }`}
          style={
            isJuniors
              ? {
                  backgroundColor: "var(--juniors-accent)",
                  borderColor: "var(--juniors-accent)",
                }
              : undefined
          }
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-1.5 flex items-center gap-2">
            {isJuniors ? <Baby className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
            <span className="font-serif text-xs md:text-sm uppercase tracking-[0.2em]">
              {isJuniors ? "Junior Cricket" : "Senior Cricket"}
            </span>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-card border-t border-border">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navigation.map((item, idx) => {
                const isActive = !item.isExternal && isItemActive(location, item.target);
                const cls = `block px-3 py-3 rounded-md font-serif text-lg uppercase tracking-wider ${
                  isActive ? activeMobileBg : "text-foreground hover:bg-muted"
                }`;
                return item.isExternal ? (
                  <a
                    key={`${item.target}-${idx}`}
                    href={item.target}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cls}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={`${item.target}-${idx}`}
                    href={item.target}
                    className={cls}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full relative z-0 overflow-x-clip">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center md:items-start">
              <img src={logoUrl} alt={brand.name} className="h-24 w-auto mb-4 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all" />
              {/* TODO(tenant): a per-tenant address/location field would replace the
                  static club address that used to live here. */}
              <p className="text-muted-foreground text-sm text-center md:text-left">
                {brand.name}
                {brand.shortName ? (
                  <>
                    <br />
                    {brand.shortName}
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <h3 className="font-serif text-primary uppercase text-lg mb-4 tracking-wider">Quick Links</h3>
              <ul className="space-y-2 text-center md:text-left">
                {(isJuniors ? juniorNav : seniorNav).map((item, idx) => (
                  <li key={`${item.target}-${idx}`}>
                    {item.isExternal ? (
                      <a href={item.target} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.target} className="text-muted-foreground hover:text-primary transition-colors">
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <h3 className="font-serif text-primary uppercase text-lg mb-4 tracking-wider">Contact</h3>
              <p className="text-muted-foreground mb-4 text-center md:text-left">
                For club inquiries, please contact us via our official website.
              </p>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {brand.name}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
