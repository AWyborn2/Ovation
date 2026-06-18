import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminTenant,
  useUpdateAdminTenant,
  getGetAdminTenantQueryKey,
  getListAllTenantsQueryKey,
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
    return <p className="py-16 text-center text-muted-foreground">No such tenant.</p>;
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
        {tenant.slug} · {tenant.readsFromCentral ? "Central PCA data" : "Native data"}
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
                  onChange={(e) => setPlan(e.target.value as UpdateTenantBodyPlan)}
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
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
      </div>
    </div>
  );
}
