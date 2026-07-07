import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, PlusCircle, Search } from "lucide-react";
import { useListAllTenants } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusPillTone } from "@/components/ui/stat-badge";

const PLAN_TONES: Record<string, StatusPillTone> = {
  free: "neutral",
  club: "info",
  pro: "pilot",
};

function PlanBadge({ plan }: { plan: string }) {
  return <StatusPill tone={PLAN_TONES[plan] ?? "neutral"}>{plan}</StatusPill>;
}

export default function TenantsList() {
  const { data, isLoading, isError } = useListAllTenants();
  const [q, setQ] = useState("");

  const tenants = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.slug.toLowerCase().includes(needle) ||
        (t.centralClubName ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Every club running Ovation, with its plan and data source.
          </p>
        </div>
        <Link href="/platform-admin/provision">
          <Button>
            <PlusCircle className="mr-1 h-4 w-4" /> Provision a club
          </Button>
        </Link>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tenants…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading tenants…
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-muted-foreground">
          Couldn't load tenants.
        </p>
      ) : tenants.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No tenants match “{q}”.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Club</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Data source</th>
                <th className="px-4 py-2 font-medium">Admins</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <Link
                      href={`/platform-admin/tenants/${t.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.centralClubName ? (
                      <div className="text-xs text-muted-foreground">
                        {t.centralClubName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.customDomain ?? `${t.slug}`}
                  </td>
                  <td className="px-4 py-2">
                    <PlanBadge plan={t.plan} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.readsFromCentral ? "Central PCA" : "Native"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{t.adminCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
