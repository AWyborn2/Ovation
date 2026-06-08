import { Link, useLocation } from "wouter";
import { Users, ScrollText, Trophy, Award, GitCompare, Menu, X, Crown, Settings, ClipboardList, Baby } from "lucide-react";
import { useState } from "react";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { useBrandLogo } from "@/lib/use-brand";

type NavItem = { name: string; href: string; icon: typeof Users };

const SENIOR_NAV: NavItem[] = [
  { name: "Honour Boards", href: "/", icon: ScrollText },
  { name: "Players", href: "/players", icon: Users },
  { name: "Matches", href: "/matches", icon: ClipboardList },
  { name: "Grades", href: "/grades", icon: Trophy },
  { name: "Records", href: "/records", icon: Award },
  { name: "Premierships", href: "/premierships", icon: Crown },
  { name: "Compare", href: "/compare", icon: GitCompare },
];

const JUNIOR_NAV: NavItem[] = [
  { name: "Overview", href: "/juniors", icon: ScrollText },
  { name: "Matches", href: "/juniors/matches", icon: ClipboardList },
  { name: "Premierships", href: "/juniors/premierships", icon: Crown },
  { name: "Players", href: "/juniors/players", icon: Users },
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
          isJuniors ? "bg-emerald-600 text-white" : "text-primary hover:bg-primary/10"
        }`}
        data-testid="link-section-juniors"
      >
        Juniors
      </Link>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const me = useCurrentAdmin();
  const logoUrl = useBrandLogo();

  const isJuniors = location === "/juniors" || location.startsWith("/juniors/");

  const navigation: NavItem[] = isJuniors
    ? JUNIOR_NAV
    : [
        ...SENIOR_NAV,
        ...(me.data ? [{ name: "Admin", href: "/admin", icon: Settings }] : []),
      ];

  // Junior nav/active states use an emerald accent so the section reads as
  // clearly distinct from the navy/gold senior side.
  const activeText = isJuniors ? "text-emerald-700" : "text-primary";
  const activeBorder = isJuniors ? "border-emerald-600" : "border-primary";
  const hoverText = isJuniors ? "hover:text-emerald-700" : "hover:text-primary";
  const hoverBorder = isJuniors ? "hover:border-emerald-600/50" : "hover:border-primary/50";
  const activeMobileBg = isJuniors ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground";

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-24 gap-4">

            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link href={isJuniors ? "/juniors" : "/"}>
                <img src={logoUrl} alt="Halls Head Cricket Club" className="h-20 w-auto" />
              </Link>
            </div>

            {/* Desktop Navigation + section toggle */}
            <div className="hidden md:flex items-center gap-6">
              <nav className="flex items-center space-x-6">
                {navigation.map((item) => {
                  const isActive = isItemActive(location, item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`font-serif text-base lg:text-lg uppercase tracking-wider transition-colors py-2 border-b-2 ${
                        isActive
                          ? `${activeText} ${activeBorder}`
                          : `text-muted-foreground border-transparent ${hoverText} ${hoverBorder}`
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              <SectionToggle isJuniors={isJuniors} />
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-3">
              <SectionToggle isJuniors={isJuniors} />
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-primary hover:text-primary/80 focus:outline-none"
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
              ? "bg-emerald-600 text-white border-emerald-700"
              : "bg-primary text-primary-foreground border-primary"
          }`}
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
              {navigation.map((item) => {
                const isActive = isItemActive(location, item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`block px-3 py-3 rounded-md font-serif text-lg uppercase tracking-wider ${
                      isActive ? activeMobileBg : "text-foreground hover:bg-muted"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full relative z-0">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center md:items-start">
              <img src={logoUrl} alt="Halls Head Cricket Club" className="h-24 w-auto mb-4 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all" />
              <p className="text-muted-foreground text-sm text-center md:text-left">
                Halls Head Cricket Club<br />
                Peelwood Reserve<br />
                Halls Head WA
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <h3 className="font-serif text-primary uppercase text-lg mb-4 tracking-wider">Quick Links</h3>
              <ul className="space-y-2 text-center md:text-left">
                {(isJuniors ? JUNIOR_NAV : SENIOR_NAV).map((item) => (
                  <li key={item.name}>
                    <Link href={item.href} className="text-muted-foreground hover:text-primary transition-colors">
                      {item.name}
                    </Link>
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
            &copy; {new Date().getFullYear()} Halls Head Cricket Club. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
