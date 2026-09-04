import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, ChevronUp, Loader2, Minus, PlusCircle, Search } from "lucide-react";
import { useListAllTenants } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusPillTone } from "@/components/ui/stat-badge";
import {
  DEFAULT_SORT,
  formatLastActive,
  matchesSearch,
  nextSort,
  passesHealthFilter,
  sortTenants,
  type HealthFilter,
  type SortColumn,
  type SortState,
} from "@/lib/tenant-health";

const PLAN_TONES: Record<string, StatusPillTone> = {
  free: "neutral",
  club: "info",
  pro: "pilot",
};

function PlanBadge({ plan }: { plan: string }) {
  return <StatusPill tone={PLAN_TONES[plan] ?? "neutral"}>{plan}</StatusPill>;
}

const HEALTH_FILTERS: { value: HealthFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "never-active", label: "Never active" },
  { value: "branding-incomplete", label: "Branding incomplete" },
  { value: "suspended", label: "Suspended" },
];

const EMPTY_FILTER_COPY: Record<HealthFilter, string> = {
  all: "No tenants yet.",
  "never-active": "No never-active tenants — every club has been active.",
  "branding-incomplete": "No tenants with incomplete branding.",
  suspended: "No tenants are suspended.",
};

/** A clickable column header that sorts the list and announces its sort state. */
function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (c: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sort.column === column;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className="px-4 py-2 font-medium" aria-sort={ariaSort} style={{ textAlign: align }}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          active ? "text-foreground" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {active ? (
          sort.direction === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

export default function TenantsList() {
  const { data, isLoading, isError } = useListAllTenants();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const tenants = useMemo(() => {
    const all = data ?? [];
    const matched = all.filter((t) => matchesSearch(t, q) && passesHealthFilter(t, filter));
    return sortTenants(matched, sort);
  }, [data, q, filter, sort]);

  const onSort = (c: SortColumn) => setSort((s) => nextSort(s, c));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Every club running Ovation, with its plan, data source, and health.
          </p>
        </div>
        <Link href="/platform-admin/provision">
          <Button>
            <PlusCircle className="mr-1 h-4 w-4" /> Provision a club
          </Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenants…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter tenants by health">
          {HEALTH_FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading tenants…
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-muted-foreground">Couldn't load tenants.</p>
      ) : tenants.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {q.trim() ? `No tenants match “${q}”.` : EMPTY_FILTER_COPY[filter]}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <SortHeader label="Club" column="name" sort={sort} onSort={onSort} />
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Data source</th>
                <th className="px-4 py-2 font-medium">Branding</th>
                <SortHeader label="Last active" column="lastActive" sort={sort} onSort={onSort} />
                <SortHeader
                  label="Admins"
                  column="admins"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/platform-admin/tenants/${t.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {t.name}
                      </Link>
                      {t.suspendedAt ? <StatusPill tone="danger">Suspended</StatusPill> : null}
                    </div>
                    {t.centralClubName ? (
                      <div className="text-xs text-muted-foreground">{t.centralClubName}</div>
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
                  <td className="px-4 py-2">
                    {t.brandingComplete ? (
                      <Check className="h-4 w-4 text-emerald-500" aria-label="Branding complete" />
                    ) : (
                      <Minus
                        className="h-4 w-4 text-muted-foreground"
                        aria-label="Branding incomplete"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatLastActive(t.lastActiveAt)}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{t.adminCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
