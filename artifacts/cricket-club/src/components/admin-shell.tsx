import { useState, type ReactNode } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useCurrentAdmin, useInvalidateAdmin } from "@/lib/admin-auth";
import { AdminLayout } from "@/components/admin-layout";
import { SignInCard } from "@/components/sign-in-card";

/**
 * Signs the admin in, then renders the admin layout around `children`, or
 * `children` alone when `bare` (full-screen tools like the Studio editor).
 */
export function AdminShell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const me = useCurrentAdmin();
  if (me.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!me.data) {
    // No site chrome around the admin: centre the sign-in card on its own.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="w-full max-w-md">
          <LoginGate />
        </div>
      </div>
    );
  }
  if (bare) return <>{children}</>;
  return <AdminLayout admin={me.data}>{children}</AdminLayout>;
}

function LoginGate() {
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateAdmin();
  const login = useLogin({
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
      eyebrow="Back office"
      title="Admin sign-in"
      idPrefix=""
      pending={login.isPending}
      error={error}
      onSubmit={(data) => login.mutate({ data })}
    />
  );
}
