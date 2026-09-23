import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Building2, EyeOff, LogOut, Palette, PlusCircle } from "lucide-react";
import {
  usePlatformAdminLogin,
  usePlatformAdminLogout,
  type PlatformAdmin,
} from "@workspace/api-client-react";
import { usePlatformAdmin, useInvalidatePlatformAdmin } from "@/lib/platform-admin-auth";
import { Button } from "@/components/ui/button";
import { SignInCard } from "@/components/sign-in-card";
import { cn } from "@/lib/utils";

/**
 * The apex/concierge console gate. Mirrors the club AdminShell but for the global
 * platform session: loading → spinner; unauthenticated → login; otherwise the
 * platform layout. A club-admin session never satisfies `usePlatformAdmin`, so a
 * club admin can't reach the console even client-side.
 */
export function PlatformAdminShell({ children }: { children: ReactNode }) {
  const me = usePlatformAdmin();
  if (me.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!me.data) {
    return <PlatformLoginGate />;
  }
  return <PlatformAdminLayout admin={me.data}>{children}</PlatformAdminLayout>;
}

function PlatformLoginGate() {
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidatePlatformAdmin();
  const login = usePlatformAdminLogin({
    mutation: {
      onSuccess: () => {
        setError(null);
        invalidate();
      },
      onError: (e) => {
        const status = (e as { status?: number })?.status;
        setError(status === 401 ? "Incorrect email or password." : "Sign-in failed.");
      },
    },
  });

  return (
    <div className="min-h-screen bg-background px-[var(--pad)] text-foreground">
      <SignInCard
        eyebrow="Ovation / Platform"
        title="Platform sign-in"
        idPrefix="pa-"
        userField="email"
        pending={login.isPending}
        error={error}
        onSubmit={({ username, password }) =>
          login.mutate({ data: { email: username.trim().toLowerCase(), password } })
        }
      />
    </div>
  );
}

function PlatformAdminLayout({ admin, children }: { admin: PlatformAdmin; children: ReactNode }) {
  const [location] = useLocation();
  const invalidate = useInvalidatePlatformAdmin();
  const logout = usePlatformAdminLogout({
    mutation: { onSuccess: () => invalidate() },
  });

  const nav = [
    { href: "/platform-admin", label: "Tenants", icon: Building2 },
    { href: "/platform-admin/provision", label: "Provision a club", icon: PlusCircle },
    { href: "/platform-admin/provisioning-exclusions", label: "Exclusions", icon: EyeOff },
    { href: "/platform-admin/brand", label: "Platform brand", icon: Palette },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-[var(--glass)] backdrop-blur-[20px] backdrop-saturate-150">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-4 px-[var(--pad)]">
          <Link
            href="/platform-admin"
            className="font-serif text-xl font-bold uppercase tracking-wide"
            data-testid="platform-home"
          >
            Ovation <span className="text-muted-foreground">/ Platform</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="hidden truncate text-muted-foreground sm:inline">{admin.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
        <nav
          aria-label="Platform"
          className="mx-auto flex max-w-[1280px] gap-1 overflow-x-auto px-[var(--pad)] [scrollbar-width:none]"
        >
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/platform-admin" ? location === href : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1280px] px-[var(--pad)] py-[var(--gap-section)]">
        {children}
      </main>
    </div>
  );
}
