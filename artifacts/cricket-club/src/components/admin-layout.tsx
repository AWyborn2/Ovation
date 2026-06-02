import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { useLogout, type Admin } from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Hub" },
  { href: "/admin/users", label: "Admins" },
  { href: "/admin/stats", label: "Stats" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/premierships", label: "Premierships" },
  { href: "/admin/honour-boards", label: "Honour boards" },
  { href: "/admin/milestone-board", label: "Milestone board" },
  { href: "/admin/import", label: "Import CSV" },
  { href: "/admin/caps", label: "Cap register" },
  { href: "/admin/life-members", label: "Life members" },
  { href: "/admin/awards", label: "Awards" },
];

export function AdminLayout({ admin, children }: { admin: Admin; children: ReactNode }) {
  const [location] = useLocation();
  const invalidate = useInvalidateAdmin();
  const logout = useLogout({ mutation: { onSettled: invalidate } });

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
              location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {item.label}
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
