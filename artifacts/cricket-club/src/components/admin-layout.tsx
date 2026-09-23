import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  useLogout,
  useGetPendingSocialDraftCount,
  getGetPendingSocialDraftCountQueryKey,
  type Admin,
} from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { useEntitlements, type Feature } from "@/lib/entitlements";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Eyebrow, InitialsAvatar } from "@/components/broadcast";
import {
  LayoutGrid,
  Image,
  Menu,
  Settings,
  Users,
  Trophy,
  Upload,
  UserCog,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "social-queue";
  // Hide a wholly-paid group when the tenant's plan lacks the feature. Mixed
  // groups stay visible — their paid tabs gate individually inside the group.
  feature?: Feature;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Hub", icon: LayoutGrid },
  {
    href: "/admin/social",
    label: "Social Media Studio",
    icon: Image,
    badge: "social-queue",
    feature: "socialStudio",
  },
  { href: "/admin/settings", label: "Display & Settings", icon: Settings },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/honours", label: "Honours & Records", icon: Trophy },
  { href: "/admin/import", label: "Import CSV", icon: Upload },
  { href: "/admin/users", label: "Admin users", icon: UserCog },
];

const isActive = (location: string, href: string) =>
  location === href || (href !== "/admin" && location.startsWith(`${href}/`));

/**
 * Back-office chrome: a sticky sidebar at ≥ `nav` (900px); below it the same
 * menu opens from a sheet so the admin pages keep the full width on phones.
 */
export function AdminLayout({ admin, children }: { admin: Admin; children: ReactNode }) {
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const invalidate = useInvalidateAdmin();
  const logout = useLogout({ mutation: { onSettled: invalidate } });
  const pendingQ = useGetPendingSocialDraftCount({
    query: {
      queryKey: getGetPendingSocialDraftCountQueryKey(),
      // Surface drafts queued by an import without needing a manual refresh.
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });
  const pendingCount = pendingQ.data?.count ?? 0;
  const entitlements = useEntitlements();
  const navItems = NAV.filter((item) => !item.feature || entitlements[item.feature]);
  const current = navItems.find((item) => isActive(location, item.href));

  const signOut = (
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
    >
      Sign out
    </Button>
  );

  return (
    <div className="grid gap-6 py-6 nav:grid-cols-[240px_minmax(0,1fr)]">
      {/* Phones / tablets: menu in a sheet. */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 nav:hidden">
        <div className="min-w-0">
          <Eyebrow>Admin</Eyebrow>
          <div className="truncate text-sm font-semibold">{current?.label ?? "Admin"}</div>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="admin-menu-trigger"
              data-tour="admin-nav"
            >
              <Menu className="h-4 w-4" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[280px] flex-col gap-4 overflow-y-auto">
            <SheetTitle className="sr-only">Admin menu</SheetTitle>
            <SignedInAs admin={admin} />
            <AdminNavList
              items={navItems}
              location={location}
              pendingCount={pendingCount}
              onNavigate={() => setSheetOpen(false)}
            />
            {signOut}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: sticky sidebar under the site header. */}
      <aside className="hidden h-fit space-y-4 rounded-lg border bg-card p-4 nav:sticky nav:top-[calc(var(--header-h)+16px)] nav:block">
        <SignedInAs admin={admin} />
        <AdminNavList items={navItems} location={location} pendingCount={pendingCount} tour />
        {signOut}
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}

function SignedInAs({ admin }: { admin: Admin }) {
  return (
    <div className="flex items-center gap-3 border-b pb-4">
      <InitialsAvatar name={admin.displayName} size={36} />
      <div className="min-w-0">
        <Eyebrow>Signed in as</Eyebrow>
        <div className="truncate text-sm font-semibold">{admin.displayName}</div>
        <div className="truncate text-xs text-muted-foreground">@{admin.username}</div>
      </div>
    </div>
  );
}

function AdminNavList({
  items,
  location,
  pendingCount,
  tour,
  onNavigate,
}: {
  items: NavItem[];
  location: string;
  pendingCount: number;
  /** Carry the admin-tour anchors (only one copy of the nav may). */
  tour?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex flex-col gap-1"
      aria-label="Admin"
      data-tour={tour ? "admin-nav" : undefined}
    >
      {items.map((item) => {
        const active = isActive(location, item.href);
        const showBadge = item.badge === "social-queue" && pendingCount > 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            data-tour={tour ? `admin-nav-${item.href}` : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              active
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                  active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary-text",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate">{item.label}</span>
            </span>
            {showBadge && (
              <span
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
                aria-label={`${pendingCount} drafts awaiting review`}
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
