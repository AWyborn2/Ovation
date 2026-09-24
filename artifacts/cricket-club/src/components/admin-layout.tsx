import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  useLogout,
  useGetPendingSocialDraftCount,
  getGetPendingSocialDraftCountQueryKey,
  useListImports,
  getListImportsQueryKey,
  type Admin,
} from "@workspace/api-client-react";
import { ExternalLink, Menu, Moon, Plus, Search, Sun } from "lucide-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { useEntitlements } from "@/lib/entitlements";
import { useBrand } from "@/lib/brand-context";
import { useThemeMode } from "@/lib/theme-context";
import {
  adminBreadcrumb,
  activeTab,
  groupIsActive,
  visibleNav,
  type AdminNavGroup,
} from "@/lib/admin-nav";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/admin-ui";
import { AdminJumpTo } from "@/components/admin-ui/admin-jump-to";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { InitialsAvatar } from "@/components/broadcast";

function ago(iso: string | undefined): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The admin app shell (Social Studio U20): a 256px sidebar whose active group
 * expands into its tabs, a glass top bar with the breadcrumb, site status,
 * notifications and "Create a card", and the page. Below the `nav`
 * breakpoint the sidebar opens from a sheet; the top bar keeps the primary
 * action.
 */
export function AdminLayout({ admin, children }: { admin: Admin; children: ReactNode }) {
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const entitlements = useEntitlements();
  const nav = visibleNav(entitlements);
  const pendingQ = useGetPendingSocialDraftCount({
    query: {
      queryKey: getGetPendingSocialDraftCountQueryKey(),
      // Surface drafts queued by an import without needing a manual refresh.
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });
  const pendingCount = pendingQ.data?.count ?? 0;
  const importsQ = useListImports({ query: { queryKey: getListImportsQueryKey() } });
  const lastImport = (importsQ.data ?? [])
    .map((i) => i.importedAt)
    .sort()
    .at(-1);
  const crumbs = adminBreadcrumb(location);
  const canCreate = entitlements.socialStudio;

  const sidebar = (tour: boolean, onNavigate?: () => void) => (
    <AdminSidebar
      admin={admin}
      nav={nav}
      location={location}
      pendingCount={pendingCount}
      tour={tour}
      onNavigate={onNavigate}
      onJump={() => {
        onNavigate?.();
        setJumpOpen(true);
      }}
    />
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-card nav:flex">
        {sidebar(true)}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-[var(--glass)] px-4 backdrop-blur-xl sm:px-8">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="nav:hidden"
                aria-label="Open admin menu"
                data-testid="admin-menu-trigger"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col p-0">
              <SheetTitle className="sr-only">Admin menu</SheetTitle>
              {sidebar(false, () => setSheetOpen(false))}
            </SheetContent>
          </Sheet>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
              {crumbs.map((c, i) => (
                <li key={`${c}-${i}`} className="flex min-w-0 items-center gap-2">
                  {i > 0 && <span aria-hidden>/</span>}
                  <span
                    className={cn(
                      "truncate",
                      i === crumbs.length - 1 && "font-semibold text-foreground",
                    )}
                    aria-current={i === crumbs.length - 1 ? "page" : undefined}
                  >
                    {c}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          {lastImport && (
            <p className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--win-fg)]" aria-hidden />
              Site live · last import {ago(lastImport)}
            </p>
          )}
          <NotificationBell />
          {canCreate && (
            <Button
              asChild
              className="h-10 rounded-full px-4 font-semibold transition-transform hover:-translate-y-px"
            >
              <Link href="/admin/social/create">
                <Plus className="h-4 w-4 sm:mr-1.5" aria-hidden />
                <span className="hidden sm:inline">Create a card</span>
                <span className="sr-only sm:hidden">Create a card</span>
              </Link>
            </Button>
          )}
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 p-4 sm:p-8">{children}</main>
      </div>

      <AdminJumpTo nav={nav} open={jumpOpen} onOpenChange={setJumpOpen} />
    </div>
  );
}

function AdminSidebar({
  admin,
  nav,
  location,
  pendingCount,
  tour,
  onNavigate,
  onJump,
}: {
  admin: Admin;
  nav: AdminNavGroup[];
  location: string;
  pendingCount: number;
  /** Carry the admin-tour anchors (only one copy of the nav may). */
  tour: boolean;
  onNavigate?: () => void;
  onJump: () => void;
}) {
  const brand = useBrand();
  const invalidate = useInvalidateAdmin();
  const logout = useLogout({ mutation: { onSettled: invalidate } });
  const { mode, toggle } = useThemeMode();

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="" className="h-10 w-auto shrink-0" />
        ) : (
          <InitialsAvatar name={brand.name} size={40} />
        )}
        <div className="min-w-0">
          <div className="truncate font-serif text-[17px] font-bold uppercase leading-tight">
            {brand.shortName?.trim() || brand.name}
          </div>
          <div className="text-xs text-muted-foreground">Club admin</div>
        </div>
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={onJump}
          className="flex h-[38px] w-full items-center gap-2 rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="flex-1 text-left">Jump to…</span>
          <kbd className="rounded-[5px] border border-border px-1.5 font-mono text-[11px]">⌘K</kbd>
        </button>
      </div>

      <nav
        aria-label="Admin"
        data-tour={tour ? "admin-nav" : undefined}
        className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4"
      >
        {nav.map((group) => {
          const active = groupIsActive(location, group);
          const tab = active ? activeTab(location, group) : undefined;
          const showBadge = group.badge === "social-queue" && pendingCount > 0;
          return (
            <div key={group.key}>
              <Link
                href={group.href}
                onClick={onNavigate}
                aria-current={active && group.tabs.length === 0 ? "page" : undefined}
                data-tour={tour ? `admin-nav-${group.href}` : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <group.icon
                  className={cn("h-[17px] w-[17px] shrink-0", active && "text-primary-text")}
                />
                <span className="flex-1 truncate">{group.label}</span>
                {showBadge && (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
                    aria-label={`${pendingCount} drafts awaiting review`}
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
              {active && group.tabs.length > 0 && (
                <ul className="my-1 ml-[18px] space-y-0.5 border-l border-border pl-2">
                  {group.tabs.map((t) => {
                    const current = t.path === tab?.path;
                    return (
                      <li key={t.path}>
                        <Link
                          href={t.path}
                          onClick={onNavigate}
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            "flex h-8 items-center justify-between rounded-md px-2.5 text-[13px] transition-colors",
                            current
                              ? "bg-primary/15 font-semibold text-primary-text"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{t.label}</span>
                          {t.value === "queue" && pendingCount > 0 && (
                            <span className="text-xs font-semibold text-primary-text">
                              {pendingCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-border p-4">
        <a
          href="/"
          className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" aria-hidden /> View public site
        </a>
        <div className="flex items-center gap-3">
          <InitialsAvatar name={admin.displayName} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{admin.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">@{admin.username}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border border-border"
            onClick={toggle}
            aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
