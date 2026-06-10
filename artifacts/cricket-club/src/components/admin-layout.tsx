import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import {
  useLogout,
  useGetPendingSocialDraftCount,
  getGetPendingSocialDraftCountQueryKey,
  type Admin,
} from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  Image,
  Settings,
  Users,
  Trophy,
  Upload,
  UserCog,
  type LucideIcon,
} from "lucide-react";

const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "social-queue";
}[] = [
  { href: "/admin", label: "Hub", icon: LayoutGrid },
  { href: "/admin/social", label: "Social Media", icon: Image, badge: "social-queue" },
  { href: "/admin/settings", label: "Display & Settings", icon: Settings },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/honours", label: "Honours & Records", icon: Trophy },
  { href: "/admin/import", label: "Import CSV", icon: Upload },
  { href: "/admin/users", label: "Admin users", icon: UserCog },
];

export function AdminLayout({ admin, children }: { admin: Admin; children: ReactNode }) {
  const [location] = useLocation();
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

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6 py-6">
      <aside className="bg-card border border-border rounded-md p-4 h-fit sticky top-28">
        <div className="mb-4 pb-3 border-b border-border">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</div>
          <div className="font-medium">{admin.displayName}</div>
          <div className="text-xs text-muted-foreground">@{admin.username}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              location === item.href ||
              (item.href !== "/admin" && location.startsWith(`${item.href}/`));
            const showBadge = item.badge === "social-queue" && pendingCount > 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
                {showBadge && (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      active
                        ? "bg-primary-foreground text-primary"
                        : "bg-primary text-primary-foreground"
                    }`}
                    aria-label={`${pendingCount} drafts awaiting review`}
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-4"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sign out
        </Button>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
