import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSocialSettings,
  useListCardTemplates,
  getGetSocialSettingsQueryKey,
  type CardTemplate,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { CardNamesSection } from "@/components/social-studio/card-names-section";
import { CardContentSection } from "@/components/social-studio/card-content-section";
import { MatchSummarySettings } from "@/components/social-studio/match-summary-settings";
import { LegacyBackgroundsSection } from "@/components/social-studio/legacy-backgrounds-section";
import { LoadingState, QueryError } from "@/components/data-states";

/**
 * Anchors other pages link into, e.g. `/admin/social/settings#card-names`.
 * Kept in one list so the jump links and the section ids can't drift.
 */
const SOCIAL_SETTINGS_ANCHORS = {
  cardNames: "card-names",
  cardContent: "card-content",
  matchSummary: "match-summary",
  legacyBackgrounds: "legacy-backgrounds",
} as const;

/**
 * Social Media Studio → Settings: the post settings that used to sit on the
 * Studio page, each in its own section with an anchor.
 */
export default function AdminSocialSettings() {
  const qc = useQueryClient();
  const settingsQ = useGetSocialSettings();
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const templatesQ = useListCardTemplates();
  const templates = (templatesQ.data as CardTemplate[] | undefined) ?? [];
  const hasBackgrounds = templates.some((t) => t.source === "background");
  const ready = !settingsQ.isLoading && !templatesQ.isLoading;

  // The tab panel mounts after the route, so the browser's own jump to the
  // hash has nothing to land on yet. Scroll once the sections exist.
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  }, [ready]);

  if (settingsQ.isError || templatesQ.isError) {
    return (
      <QueryError
        onRetry={() => {
          settingsQ.refetch();
          templatesQ.refetch();
        }}
      />
    );
  }
  if (!ready) return <LoadingState label="Loading settings…" />;

  const jumps = [
    { id: SOCIAL_SETTINGS_ANCHORS.cardNames, label: "Card names" },
    { id: SOCIAL_SETTINGS_ANCHORS.cardContent, label: "Card content" },
    { id: SOCIAL_SETTINGS_ANCHORS.matchSummary, label: "Match summary carousels" },
    ...(hasBackgrounds
      ? [{ id: SOCIAL_SETTINGS_ANCHORS.legacyBackgrounds, label: "Legacy backgrounds" }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <nav aria-label="Settings sections" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {jumps.map((j) => (
          <a key={j.id} href={`#${j.id}`} className="text-primary-text hover:underline">
            {j.label}
          </a>
        ))}
      </nav>

      {/* The names every card prints for each club and grade (ADR-010 P1). */}
      <div id={SOCIAL_SETTINGS_ANCHORS.cardNames} className="scroll-mt-24">
        <CardNamesSection />
      </div>

      {/* How much each match day card says: presets and per-field switches (ADR-010 P2). */}
      <div id={SOCIAL_SETTINGS_ANCHORS.cardContent} className="scroll-mt-24">
        <CardContentSection />
      </div>

      {/* Match summary auto-draft settings */}
      {bundle && (
        <div id={SOCIAL_SETTINGS_ANCHORS.matchSummary} className="scroll-mt-24">
          <MatchSummarySettings
            settings={bundle.settings}
            onSaved={() => qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() })}
          />
        </div>
      )}

      <LegacyBackgroundsSection
        id={SOCIAL_SETTINGS_ANCHORS.legacyBackgrounds}
        templates={templates}
      />
    </div>
  );
}
