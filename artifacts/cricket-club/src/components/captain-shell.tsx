import { useState, type ReactNode } from "react";
import { useCaptainLogin, useCaptainLogout, type Captain } from "@workspace/api-client-react";
import { useCurrentCaptain, useInvalidateCaptain } from "@/lib/captain-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
  return (
    <div className="py-6 space-y-4">
      <div className="bg-card border border-border rounded-md p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Captain · 3-2-1 voting
          </div>
          <div className="font-medium">{captain.displayName}</div>
          <div className="text-xs text-muted-foreground">
            @{captain.username}
            {captain.grades.length > 0 && <> · {captain.grades.join(", ")}</>}
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
      <div>{children}</div>
    </div>
  );
}

function LoginGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    login.mutate({ data: { username, password } });
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <Card>
        <CardHeader>
          <CardTitle>Captain sign-in</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Grade captains sign in here to submit their 3-2-1 votes each round.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cap-username">Username</Label>
              <Input
                id="cap-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-password">Password</Label>
              <Input
                id="cap-password"
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
