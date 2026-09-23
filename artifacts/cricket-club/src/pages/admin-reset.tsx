import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import {
  useGetPasswordReset,
  useSubmitPasswordReset,
  getGetPasswordResetQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Eyebrow } from "@/components/broadcast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MIN_PASSWORD = 8;

/**
 * Public landing for a platform-issued admin reset/bootstrap link
 * (`/admin/reset?token=…`). Unauthenticated: the token in the URL is the only
 * credential. The club admin sets their OWN password here — platform staff never
 * see it. Redeeming is single-use, so a refresh after success shows the link spent.
 */
export default function AdminReset() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [, navigate] = useLocation();

  const info = useGetPasswordReset(token, {
    query: {
      queryKey: getGetPasswordResetQueryKey(token),
      enabled: token.length > 0,
      retry: false,
    },
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = useSubmitPasswordReset({
    mutation: {
      onSuccess: () => {
        setError(null);
        setDone(true);
      },
      onError: (e) => {
        const status = (e as { status?: number })?.status;
        setError(
          status === 410
            ? "This link is no longer valid. Ask your platform admin for a new one."
            : status === 400
              ? `Choose a password of at least ${MIN_PASSWORD} characters.`
              : "Couldn't set the password. Please try again.",
        );
      },
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    submit.mutate({ token, data: { password } });
  }

  const invalid = !token || info.isError;

  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center py-12">
        <section className="w-full max-w-md rounded-xl border bg-card p-[clamp(20px,3vw,32px)] text-card-foreground shadow-[var(--shadow-pop)]">
          <Eyebrow accent>Back office</Eyebrow>
          <h1 className="mt-2 mb-6 text-[clamp(30px,3.4vw,40px)] leading-none">
            Set your admin password
          </h1>
          <div>
            {info.isLoading && token ? (
              <div className="flex items-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking your link…
              </div>
            ) : done ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--win-fg)]">
                  Your password is set. You can now sign in.
                </p>
                <Button onClick={() => navigate("/admin")}>Go to sign-in</Button>
              </div>
            ) : invalid ? (
              <p className="text-sm text-destructive">
                This link is invalid, expired, or already used. Ask your platform admin to send a
                fresh reset link.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Setting the password for{" "}
                  <span className="font-medium text-foreground">{info.data?.username}</span> at{" "}
                  {info.data?.tenantName}.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" disabled={submit.isPending}>
                  {submit.isPending ? "Saving…" : "Set password"}
                </Button>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </form>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
