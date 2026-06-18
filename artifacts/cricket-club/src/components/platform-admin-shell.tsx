import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Building2, LogOut, PlusCircle } from "lucide-react";
import {
  usePlatformAdminLogin,
  usePlatformAdminLogout,
  type PlatformAdmin,
} from "@workspace/api-client-react";
import {
  usePlatformAdmin,
  useInvalidatePlatformAdmin,
} from "@/lib/platform-admin-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    login.mutate({ data: { email: email.trim().toLowerCase(), password } });
  };

  return (
    <div className="mx-auto max-w-md py-16 px-6">
      <p className="mb-6 text-center text-lg font-semibold tracking-tight">
        Ovation — Platform admin
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pa-email">Email</Label>
              <Input
                id="pa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pa-password">Password</Label>
              <Input
                id="pa-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformAdminLayout({
  admin,
  children,
}: {
  admin: PlatformAdmin;
  children: ReactNode;
}) {
  const [location] = useLocation();
  const invalidate = useInvalidatePlatformAdmin();
  const logout = usePlatformAdminLogout({
    mutation: { onSuccess: () => invalidate() },
  });

  const nav = [
    { href: "/platform-admin", label: "Tenants", icon: Building2 },
    { href: "/platform-admin/provision", label: "Provision a club", icon: PlusCircle },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/platform-admin" className="font-semibold tracking-tight">
            Ovation <span className="text-muted-foreground">/ Platform</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{admin.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/platform-admin" ? location === href : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
