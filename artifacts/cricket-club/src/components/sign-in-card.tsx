import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/broadcast";

/**
 * Centred Broadcast sign-in card shared by the admin and captain login gates.
 * Owns the field state and the "both fields required" check; the caller owns
 * the mutation and maps its failures to `error`.
 */
export function SignInCard({
  eyebrow,
  title,
  intro,
  idPrefix,
  pending,
  error,
  onSubmit,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  idPrefix: string;
  pending: boolean;
  error: string | null;
  onSubmit: (credentials: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setMissing(true);
      return;
    }
    setMissing(false);
    onSubmit({ username, password });
  };

  const message = missing ? "Username and password are required." : error;

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-12">
      <section
        className="w-full max-w-md rounded-xl border bg-card p-[clamp(20px,3vw,32px)] text-card-foreground shadow-[var(--shadow-pop)]"
        data-testid="sign-in-card"
      >
        <Eyebrow accent>{eyebrow}</Eyebrow>
        <h1 className="mt-2 text-[clamp(30px,3.4vw,40px)] leading-none">{title}</h1>
        {intro && <p className="mt-3 text-sm text-muted-foreground">{intro}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}username`}>Username</Label>
            <Input
              id={`${idPrefix}username`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}password`}>Password</Label>
            <Input
              id={`${idPrefix}password`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          {message && (
            <p className="text-sm text-destructive" role="alert">
              {message}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
