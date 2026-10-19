import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetShirtNumberSettings,
  useUpdateShirtNumberSettings,
  getGetShirtNumberSettingsQueryKey,
} from "@workspace/api-client-react";
import type { ShirtNumberSettingsUpdate } from "@workspace/api-client-react";
import { LoadingState, QueryError } from "@/components/data-states";
import { invalidateTeamListCarouselSources } from "@/lib/team-list-carousel-cache";
import { useSearchParamState } from "@/lib/use-search-param";
import { cn } from "@/lib/utils";
import {
  ShirtNumberRegister,
  ShirtNumberSettingsPanel,
  SeniorPersonPicker,
  errorMessage,
  seniorShirtNumberApiFor,
} from "@/components/shirt-numbers";
import { JuniorShirtNumbersSection } from "@/components/shirt-numbers/junior-section";

/** The page's sections, in order; `?section=` picks one (default Men). */
export const SHIRT_NUMBER_SECTIONS = [
  { id: "men", label: "Men" },
  { id: "female", label: "Female" },
  { id: "juniors", label: "Juniors" },
] as const;
type SectionId = (typeof SHIRT_NUMBER_SECTIONS)[number]["id"];

const isSection = (v: string): v is SectionId => SHIRT_NUMBER_SECTIONS.some((s) => s.id === v);

/**
 * People → Shirt numbers: every playing-number register on one page
 * (admin-menu-consolidation). The feature switch and policies at the top, then a
 * Men / Female / Juniors switch (`?section=`). Men and Female are the two categories of
 * the senior register, so a men's #7 and a female #7 never clash; Juniors is the
 * separate juniors register (its own table and /api/juniors routes, never blended).
 * One person may be on several registers in a season: rows say "Also in: …".
 */
export default function AdminShirtNumbers() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading, isError, refetch } = useGetShirtNumberSettings();
  const update = useUpdateShirtNumberSettings();
  const [error, setError] = useState<string | null>(null);
  const [sectionParam, setSection] = useSearchParamState("section", "men");
  const section: SectionId = isSection(sectionParam) ? sectionParam : "men";
  const seniorApi = useMemo(
    () => seniorShirtNumberApiFor(section === "female" ? "female" : "men"),
    [section],
  );

  const onChange = (patch: ShirtNumberSettingsUpdate) => {
    setError(null);
    update.mutate(
      { data: patch },
      {
        onSuccess: (next) => {
          queryClient.setQueryData(getGetShirtNumberSettingsQueryKey(), next);
          void invalidateTeamListCarouselSources(queryClient);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isLoading || !settings) return <LoadingState />;

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Playing shirt numbers for each season, for the men's sides, the female sides and juniors.
        They are separate from A Grade cap numbers, which never change. Someone who plays in more
        than one (a junior in the seniors, a woman in a men's side) can be on each register.
      </p>
      <ShirtNumberSettingsPanel
        settings={settings}
        onChange={onChange}
        pending={update.isPending}
        error={error}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Shirt number register"
          className="inline-flex rounded-lg border border-border bg-card p-1"
        >
          {SHIRT_NUMBER_SECTIONS.map((s) => {
            const active = s.id === section;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(s.id)}
                className={cn(
                  "h-9 rounded-md px-4 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <Link
          href={`/admin/import/shirt-numbers?register=${section}`}
          className="text-sm font-semibold text-primary-text underline"
        >
          Upload a numbers file →
        </Link>
      </div>

      {section === "juniors" ? (
        <JuniorShirtNumbersSection />
      ) : (
        settings.enabled && (
          <ShirtNumberRegister
            key={section}
            api={seniorApi}
            settings={settings}
            PersonPicker={SeniorPersonPicker}
            moveTo={section === "men" ? "female" : "men"}
          />
        )
      )}
    </div>
  );
}
