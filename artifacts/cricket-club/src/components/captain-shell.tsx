import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useCaptainLogin, useCaptainLogout, type Captain } from "@workspace/api-client-react";
import { useCurrentCaptain, useInvalidateCaptain } from "@/lib/captain-auth";
import { Button } from "@/components/ui/button";
import { Eyebrow, InitialsAvatar } from "@/components/broadcast";
import { SignInCard } from "@/components/sign-in-card";
import { cn } from "@/lib/utils";

const CAPTAIN_NAV = [
  { href: "/captain", label: "3-2-1 voting" },
  { href: "/captain/selection", label: "Selection Hub" },
];

export function CaptainShell({ children }: { children: ReactNode }) {
  const me = useCurrentCaptain();
  if (me.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!me.data) {
    return <LoginGate />;
  }
  return <CaptainLayout captain={me.data}>{children}</CaptainLayout>;
}

function CaptainLayout({ captain, children }: { captain: Captain; children: ReactNode }) {
  const invalidate = useInvalidateCaptain();
  const logout = useCaptainLogout({ mutation: { onSettled: invalidate } });
  const [location] = useLocation();
  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <InitialsAvatar name={captain.displayName} size={44} />
          <div className="min-w-0">
            <Eyebrow accent>Captain</Eyebrow>
            <div className="truncate font-semibold">{captain.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              @{captain.username}
              {captain.grades.length > 0 && <> · {captain.grades.join(", ")}</>}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sign out
        </Button>
      </div>
      <nav aria-label="Captain" className="flex flex-wrap gap-2">
        {CAPTAIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={location === item.href ? "page" : undefined}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm font-semibold transition-colors",
              location === item.href
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}

function LoginGate() {
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateCaptain();
  const login = useCaptainLogin({
    mutation: {
      onSuccess: () => {
        setError(null);
        invalidate();
      },
      onError: (e) => {
        const status = (e as { status?: number })?.status;
        setError(status === 401 ? "Incorrect username or password." : "Sign-in failed.");
      },
    },
  });

  return (
    <SignInCard
      eyebrow="Captains"
      title="Captain sign-in"
      intro="Grade captains sign in here to pick their sides and submit their 3-2-1 votes each round."
      idPrefix="cap-"
      pending={login.isPending}
      error={error}
      onSubmit={(data) => login.mutate({ data })}
    />
  );
}
