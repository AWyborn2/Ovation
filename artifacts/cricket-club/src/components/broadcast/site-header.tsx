import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { useBrandLogo } from "@/lib/use-brand";
import { useBrand } from "@/lib/brand-context";
import { platformUrl } from "@/lib/platform-url";
import { useThemeMode } from "@/lib/theme-context";
import { navIcon } from "@/lib/nav-icons";
import type { ResolvedNavItem } from "@/lib/use-nav";
import {
  describe,
  isGroupActive,
  isNavItemActive,
  type GroupedNav,
  type NavGroup,
  type Section,
} from "@/lib/nav-groups";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SECTIONS: {
  key: Section;
  label: string;
  href: string;
  desc: string;
  initial: string;
  tile: string;
}[] = [
  {
    key: "seniors",
    label: "Seniors",
    href: "/",
    desc: "Senior grades, results and records",
    initial: "S",
    tile: "#333F48",
  },
  {
    key: "juniors",
    label: "Juniors",
    href: "/juniors",
    desc: "Junior teams and results",
    initial: "J",
    tile: "var(--juniors-accent)",
  },
];

/** Internal or external nav link (external opens a new tab). */
function NavLink({
  item,
  className,
  onClick,
  children,
}: {
  item: ResolvedNavItem;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return item.isExternal ? (
    <a
      href={item.target}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  ) : (
    <Link href={item.target} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

/** Round 40/44px icon button (search, theme). */
function RoundButton({
  label,
  onClick,
  className,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border text-foreground transition-colors hover:border-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ThemeToggle({ size = 40 }: { size?: 40 | 44 }) {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === "dark";
  return (
    <RoundButton
      label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={cn("group", size === 44 ? "h-11 w-11" : "h-10 w-10")}
      testId="theme-toggle"
    >
      <span className="inline-flex transition-transform duration-300 group-hover:rotate-[20deg]">
        {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </span>
    </RoundButton>
  );
}

/** Crest + club name + section label, opening the Seniors/Juniors switcher. */
function ClubSwitcher({ section }: { section: Section }) {
  const brand = useBrand();
  const logo = useBrandLogo();
  const directoryHref = platformUrl("/clubs");
  const [open, setOpen] = useState(false);
  const current = SECTIONS.find((s) => s.key === section)!;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 rounded-sm py-1.5 pl-1 pr-2.5 text-left transition-colors hover:bg-muted"
          data-tour="section-toggle"
          aria-label={`${brand.shortName || brand.name}: ${current.label}. Switch section`}
          data-testid="club-switcher"
        >
          <img src={logo} alt="" className="h-[42px] w-auto shrink-0" />
          <span className="min-w-0">
            <span className="block truncate font-serif text-base font-bold uppercase leading-tight">
              {brand.shortName || brand.name}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              {current.label}
              <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[300px] p-2">
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {brand.name}
        </div>
        {SECTIONS.map((s) => {
          const active = s.key === section;
          return (
            <Link
              key={s.key}
              href={s.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-sm px-2 py-2 transition-colors hover:bg-muted"
              data-testid={`link-section-${s.key}`}
              aria-current={active ? "page" : undefined}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm font-serif text-base font-bold text-[hsl(var(--primary))]"
                style={{ background: s.tile }}
              >
                {s.initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>
              </span>
              {active && <Check className="h-4 w-4 text-primary-text" aria-hidden />}
            </Link>
          );
        })}
        {directoryHref && (
          <>
            <div className="my-1.5 h-px bg-border" />
            <a
              href={directoryHref}
              className="flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
              Switch club
            </a>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Desktop grouped-nav dropdown (mega-menu). */
function NavGroupMenu({ group, location }: { group: NavGroup; location: string }) {
  const active = isGroupActive(location, group);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          "group inline-flex h-[38px] items-center gap-1 rounded-sm px-3.5 text-sm font-medium outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground",
          active ? "bg-muted text-foreground" : "text-muted-foreground",
        )}
        data-testid={`nav-group-${group.key}`}
        data-active={active || undefined}
      >
        {group.label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-[340px] p-2">
        {group.items.map((item) => {
          const Icon = navIcon(item.iconKey);
          const desc = describe(item);
          return (
            <DropdownMenuItem
              key={`${item.target}-${item.label}`}
              asChild
              className="cursor-pointer p-0"
            >
              <NavLink item={item} className="flex items-center gap-3 rounded-sm px-2 py-2">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-sm border bg-muted text-primary-text">
                  {Icon && <Icon className="h-[17px] w-[17px]" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  {desc && (
                    <span className="block text-[12.5px] text-muted-foreground">{desc}</span>
                  )}
                </span>
              </NavLink>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdminPill({ className }: { className?: string }) {
  const me = useCurrentAdmin();
  return (
    <Link
      href="/admin"
      className={cn(
        "inline-flex h-10 shrink-0 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-85",
        className,
      )}
      data-testid="admin-pill"
    >
      {me.data ? "Dashboard" : "Admin"}
    </Link>
  );
}

/**
 * The Broadcast site header: 68px glass bar (desktop, ≥ the `nav` breakpoint)
 * or a 60px bar with a drop-down menu sheet (mobile).
 */
export function SiteHeader({
  section,
  nav,
  onOpenSearch,
}: {
  section: Section;
  nav: GroupedNav;
  onOpenSearch: () => void;
}) {
  const [location] = useLocation();
  const brand = useBrand();
  const logo = useBrandLogo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);

  // Close the mobile sheet on navigation and on Esc.
  useEffect(() => {
    setMenuOpen(false);
    setSectionsOpen(false);
  }, [location]);
  useEffect(() => {
    if (!menuOpen && !sectionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setSectionsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, sectionsOpen]);

  const current = SECTIONS.find((s) => s.key === section)!;
  const mobileGroups: { key: string; label: string; items: ResolvedNavItem[] }[] = [
    ...(nav.top.length ? [{ key: "browse", label: "Browse", items: nav.top }] : []),
    ...nav.groups,
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-[var(--glass)] backdrop-blur-[20px] backdrop-saturate-150">
      {/* Desktop */}
      <div className="mx-auto hidden h-[68px] max-w-[1280px] items-center gap-5 px-[var(--pad)] nav:flex">
        <ClubSwitcher section={section} />
        <nav className="flex items-center gap-0.5" data-tour="main-nav" aria-label="Main">
          {nav.top.map((item) => {
            const active = isNavItemActive(location, item);
            return (
              <NavLink
                key={`${item.target}-${item.label}`}
                item={item}
                className={cn(
                  "inline-flex h-[38px] items-center rounded-sm px-3.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                  active ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </NavLink>
            );
          })}
          {nav.groups.map((g) => (
            <NavGroupMenu key={g.key} group={g} location={location} />
          ))}
        </nav>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex h-10 w-[clamp(200px,22vw,300px)] items-center gap-2 rounded-full border bg-muted px-3.5 text-sm text-muted-foreground transition-colors hover:border-primary"
          data-testid="search-trigger"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="flex-1 text-left">Search players</span>
          <kbd className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
        </button>
        <ThemeToggle />
        <AdminPill />
      </div>

      {/* Mobile */}
      <div className="nav:hidden">
        <div className="flex h-[60px] items-center gap-2 px-4">
          <button
            type="button"
            onClick={() => setSectionsOpen((o) => !o)}
            aria-expanded={sectionsOpen}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            data-testid="mobile-club-button"
          >
            <img src={logo} alt="" className="h-9 w-auto shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-serif text-[15px] font-bold uppercase leading-tight">
                {brand.shortName || brand.name}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {current.label}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </span>
            </span>
          </button>
          <RoundButton label="Search" onClick={onOpenSearch} className="h-11 w-11">
            <Search className="h-[18px] w-[18px]" />
          </RoundButton>
          <ThemeToggle size={44} />
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-muted"
            data-testid="mobile-menu-button"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {sectionsOpen && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-3" data-testid="mobile-section-row">
            {SECTIONS.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className={cn(
                  "flex h-12 items-center justify-center rounded-sm border font-serif text-base font-bold uppercase",
                  s.key === section ? "border-primary" : "border-border text-muted-foreground",
                )}
                aria-current={s.key === section ? "page" : undefined}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}

        {menuOpen && (
          <nav
            className="max-h-[70vh] overflow-y-auto border-t px-4 pb-4 pt-2"
            aria-label="Main"
            data-testid="mobile-menu-sheet"
          >
            {mobileGroups.map((g) => (
              <div key={g.key} className="pt-3">
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {g.label}
                </div>
                {g.items.map((item) => {
                  const Icon = navIcon(item.iconKey);
                  const active = isNavItemActive(location, item);
                  return (
                    <NavLink
                      key={`${item.target}-${item.label}`}
                      item={item}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex h-12 items-center gap-3 rounded-sm px-2 text-base font-medium",
                        active ? "bg-muted" : "hover:bg-muted",
                      )}
                    >
                      <span className="text-primary-text">
                        {Icon && <Icon className="h-[18px] w-[18px]" aria-hidden />}
                      </span>
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            ))}
            <AdminPill className="mt-4 h-12 w-full justify-center" />
          </nav>
        )}
      </div>
    </header>
  );
}
