import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminTenant,
  useUpdateAdminTenant,
  useIssueTenantAdminReset,
  getGetAdminTenantQueryKey,
  getListAllTenantsQueryKey,
  type AdminResetIssued,
  type UpdateTenantBodyPlan,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const PLANS: UpdateTenantBodyPlan[] = ["free", "club", "pro"];

export default function TenantDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading, isError } = useGetAdminTenant(id);
  const qc = useQueryClient();

  const [plan, setPlan] = useState<UpdateTenantBodyPlan>("free");
  const [customDomain, setCustomDomain] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setPlan(data.tenant.plan);
      setCustomDomain(data.tenant.customDomain ?? "");
    }
  }, [data]);

  const update = useUpdateAdminTenant({
    mutation: {
      onSuccess: () => {
        setError(null);
        setSaved(true);
        qc.invalidateQueries({ queryKey: getGetAdminTenantQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListAllTenantsQueryKey() });
      },
      onError: (e) => {
        setSaved(false);
        const status = (e as { status?: number })?.status;
        setError(
          status === 409
            ? "That custom domain is already in use."
            : "Couldn't save changes.",
        );
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="py-16 text-center text-muted-foreground">No such tenant.</p>
    );
  }

  const { tenant, admins } = data;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    update.mutate({
      id,
      data: { plan, customDomain: customDomain.trim() || null },
    });
  }

  return (
    <div>
      <Link
        href="/platform-admin"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> All tenants
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
      <p className="text-sm text-muted-foreground">
        {tenant.slug} ·{" "}
        {tenant.readsFromCentral ? "Central PCA data" : "Native data"}
        {tenant.centralClubName ? ` · ${tenant.centralClubName}` : ""}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan &amp; domain</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plan">Plan</Label>
                <select
                  id="plan"
                  value={plan}
                  onChange={(e) =>
                    setPlan(e.target.value as UpdateTenantBodyPlan)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customDomain">Custom domain</Label>
                <Input
                  id="customDomain"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="e.g. stats.myclub.org.au"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the {tenant.slug} subdomain.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
                {saved ? (
                  <span className="text-sm text-green-600">Saved.</span>
                ) : null}
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Club admins ({admins.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {admins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admins yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {admins.map((a) => (
                  <li key={a.id} className="py-2">
                    <span className="font-medium">{a.displayName}</span>{" "}
                    <span className="text-muted-foreground">{a.username}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <AdminAccessCard tenantId={id} tenantName={tenant.name} />
      </div>
    </div>
  );
}

/**
 * Bootstrap or reset a club admin's credentials. Platform staff enter the admin's
 * login (email); the server creates the admin if missing and mints a single-use
 * reset link. The link is returned here to hand off out-of-band — no password is
 * ever set by platform staff, so there's no silent impersonation vector.
 */
function AdminAccessCard({
  tenantId,
  tenantName,
}: {
  tenantId: number;
  tenantName: string;
}) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<AdminResetIssued | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = useIssueTenantAdminReset({
    mutation: {
      onSuccess: (data) => {
        setError(null);
        setIssued(data);
        setCopied(false);
        // A bootstrapped admin should show up in the admins list immediately.
        qc.invalidateQueries({ queryKey: getGetAdminTenantQueryKey(tenantId) });
        qc.invalidateQueries({ queryKey: getListAllTenantsQueryKey() });
      },
      onError: (e) => {
        setIssued(null);
        const status = (e as { status?: number })?.status;
        setError(
          status === 404
            ? "That tenant no longer exists."
            : status === 400
              ? "Enter a valid login email."
              : "Couldn't generate a reset link.",
        );
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (!u) {
      setError("A login email is required.");
      return;
    }
    setError(null);
    issue.mutate({
      id: tenantId,
      data: { username: u, displayName: displayName.trim() || undefined },
    });
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.resetUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin access</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Generate a single-use link so a {tenantName} admin can set their own
          password. If no admin with that email exists yet, one is created.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-username">Admin login (email)</Label>
            <Input
              id="reset-username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. secretary@myclub.org.au"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-displayname">Display name (optional)</Label>
            <Input
              id="reset-displayname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Used only when creating a new admin"
            />
          </div>
          <Button type="submit" disabled={issue.isPending}>
            {issue.isPending ? "Generating…" : "Generate reset link"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>

        {issued ? (
          <div className="mt-4 space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-sm">
              {issued.created ? "Created " : "Reset link for "}
              <span className="font-medium">{issued.username}</span>. Share this
              link securely — it is single-use and expires{" "}
              {new Date(issued.expiresAt).toLocaleString()}.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={issued.resetUrl}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={copyLink}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
