import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_PASSWORD_STORAGE_KEY,
  getAdminPassword,
  setAdminPassword,
} from "@/lib/admin-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AdminShell({ children }: { children: (onAuthFailed: () => void) => ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => getAdminPassword() != null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_PASSWORD_STORAGE_KEY) {
        setAuthed(getAdminPassword() != null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!authed) return <AdminPasswordGate onUnlock={() => setAuthed(true)} />;
  return <>{children(() => setAuthed(false))}</>;
}

function AdminPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Enter the admin password.");
      return;
    }
    setAdminPassword(password);
    setError(null);
    onUnlock();
  };

  return (
    <div className="max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Admin password required</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit">Unlock</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              The password is stored in this browser tab only and cleared when you close it.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function handleAdminMutationError(
  e: unknown,
  onAuthFailed: () => void,
): string | null {
  const status = (e as { status?: number } | null)?.status;
  if (status === 401) {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
    }
    onAuthFailed();
    return null;
  }
  return (e as Error)?.message ?? "Request failed";
}
