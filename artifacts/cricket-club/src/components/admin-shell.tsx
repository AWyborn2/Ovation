import { useState, type ReactNode } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useCurrentAdmin, useInvalidateAdmin } from "@/lib/admin-auth";
import { AdminLayout } from "@/components/admin-layout";
import { SignInCard } from "@/components/sign-in-card";

export function AdminShell({ children }: { children: ReactNode }) {
  const me = useCurrentAdmin();
  if (me.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!me.data) {
    return <LoginGate />;
  }
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
