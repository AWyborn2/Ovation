import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Captions,
  ChevronRight,
  HandCoins,
  LayoutList,
  Mail,
  Palette,
  PenTool,
  Send,
  Share2,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  getGetSocialSettingsQueryKey,
  getListCardAudioTracksQueryKey,
  getListCardThemesQueryKey,
  getListSponsorsQueryKey,
  useGetSocialSettings,
  useListCardAudioTracks,
  useListCardThemes,
  useListSponsors,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import {
  AudioTracksCard,
  CaptionTemplatesCard,
  SettingsCard,
  SponsorsCard,
  ThemesCard,
} from "@/components/admin-social";
import { TemplatesCard } from "@/components/card-template-builder";
import { LoadingState, QueryError } from "@/components/data-states";
import { AutoPostCard } from "@/components/social-queue/auto-post-card";
import { MetaConnectionCard } from "@/components/social-queue/meta-connection-card";
import { RoundSchedulesCard } from "@/components/social-queue/round-schedules-card";
import { FigmaConnectionCard } from "@/components/template-library/figma-connection-card";
import { useEntitlements } from "@/lib/entitlements";
import { useSearchParamState } from "@/lib/use-search-param";

const AdminSocialSettings = lazy(() => import("@/pages/admin-social-settings"));
const AdminSocialPlan = lazy(() => import("@/pages/admin-social-plan"));
const AdminEmailLists = lazy(() => import("@/pages/admin-email-lists"));
const AdminFixtures = lazy(() => import("@/pages/admin-fixtures"));

type SettingsCardDef = {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  juniors?: boolean;
  /** The existing page or cards this one opens, unchanged. */
  body: () => ReactNode;
};

/**
 * New Studio → Settings as cards (studio-create-consolidation S10). Each card
 * opens (`?card=<id>`) the existing settings page or cards for one concern,
 * unchanged; nothing is rewritten, and every page keeps its own URL.
 */
export default function AdminSocialSettingsHub() {
  const entitlements = useEntitlements();
  const [open, setOpen] = useSearchParamState("card", "");
  const cards = SETTINGS_CARDS.filter((c) => !c.juniors || entitlements.juniors);
  const card = cards.find((c) => c.id === open);

  if (card)
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setOpen("")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All settings
        </button>
        <section aria-labelledby="settings-card-title" className="space-y-4">
          <h2 id="settings-card-title" className="text-xl font-semibold">
            {card.title}
          </h2>
          <Suspense fallback={<LoadingState label="Loading…" />}>{card.body()}</Suspense>
        </section>
      </div>
    );

  return (
    <ul aria-label="Settings" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpen(c.id)}
              className="bc-lift flex h-full w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{c.blurb}</span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The social settings bundle the Cards page's cards read, loaded once per card. */
function WithSettings({
  children,
}: {
  children: (ctx: { bundle: SocialSettingsBundle; invalidate: () => void }) => ReactNode;
}) {
  const qc = useQueryClient();
  const bundle = useGetSocialSettings();
  if (bundle.isError) return <QueryError onRetry={() => bundle.refetch()} />;
  if (!bundle.data) return <LoadingState label="Loading social settings…" />;
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListSponsorsQueryKey() });
  };
  return (
    <div className="space-y-6">
      {children({ bundle: bundle.data as SocialSettingsBundle, invalidate })}
    </div>
  );
}

function Sponsors() {
  const sponsorsQ = useListSponsors();
  return (
    <WithSettings>
      {({ invalidate }) => <SponsorsCard sponsors={sponsorsQ.data ?? []} onChanged={invalidate} />}
    </WithSettings>
  );
}

function Looks() {
  const qc = useQueryClient();
  const themesQ = useListCardThemes();
  const audioQ = useListCardAudioTracks();
  return (
    <WithSettings>
      {({ bundle, invalidate }) => (
        <>
          <SettingsCard settings={bundle.settings} onSaved={invalidate} />
          <ThemesCard
            themes={themesQ.data ?? []}
            onChanged={() => qc.invalidateQueries({ queryKey: getListCardThemesQueryKey() })}
          />
          <AudioTracksCard
            tracks={audioQ.data ?? []}
            onChanged={() => qc.invalidateQueries({ queryKey: getListCardAudioTracksQueryKey() })}
          />
          <TemplatesCard />
        </>
      )}
    </WithSettings>
  );
}

const linkCls = "font-medium text-primary-text underline underline-offset-2";

export const SETTINGS_CARDS: SettingsCardDef[] = [
  {
    id: "plan",
    title: "Posting plan",
    blurb: "Which cards draft themselves, for which grades, and how they post.",
    icon: CalendarClock,
    body: () => <AdminSocialPlan />,
  },
  {
    id: "auto-post",
    title: "Auto-post",
    blurb: "When round carousels draft, and which cards post without review.",
    icon: Send,
    body: () => (
      <WithSettings>
        {({ bundle }) => (
          <>
            <RoundSchedulesCard settings={bundle.settings} />
            <AutoPostCard settings={bundle.settings} />
          </>
        )}
      </WithSettings>
    ),
  },
  {
    id: "sponsors",
    title: "Sponsors",
    blurb: "The club's sponsors and the cards they appear on.",
    icon: HandCoins,
    body: () => <Sponsors />,
  },
  {
    id: "cards-show",
    title: "What cards show",
    blurb: "Card names, how much each card says, and match summary carousels.",
    icon: LayoutList,
    body: () => <AdminSocialSettings />,
  },
  {
    id: "facebook",
    title: "Facebook and Instagram",
    blurb: "Connect the club's Page and account for posting.",
    icon: Share2,
    body: () => <MetaConnectionCard />,
  },
  {
    id: "figma",
    title: "Figma",
    blurb: "Sign in with Figma to bring in your own designs.",
    icon: PenTool,
    body: () => <FigmaConnectionCard />,
  },
  {
    id: "captions",
    title: "Captions",
    blurb: "The caption each card type starts with.",
    icon: Captions,
    body: () => (
      <WithSettings>
        {({ bundle, invalidate }) => (
          <CaptionTemplatesCard templates={bundle.captionTemplates} onSaved={invalidate} />
        )}
      </WithSettings>
    ),
  },
  {
    id: "email-lists",
    title: "Email lists",
    blurb: "Who gets team lists and cards by email.",
    icon: Mail,
    body: () => <AdminEmailLists />,
  },
  {
    id: "juniors",
    title: "Juniors",
    blurb: "Which junior teams post on their own, and junior photos.",
    icon: Users,
    juniors: true,
    body: () => (
      <div className="max-w-[70ch] space-y-3 text-[15px]">
        <p>
          Junior cards post on their own only for teams set to &ldquo;auto&rdquo; in{" "}
          <Link href="/admin/settings/junior-matches" className={linkCls}>
            Junior matches
          </Link>
          ; every team starts on &ldquo;approval&rdquo;. Junior grades in the posting plan are on
          the Posting plan card.
        </p>
        <p>
          Junior photos, and which players&rsquo; photos are withheld, are in{" "}
          <Link href="/admin/social/photos?tab=junior" className={linkCls}>
            Photos → Junior photos
          </Link>
          . A junior card shows a photo only when the player&rsquo;s consent allows it.
        </p>
      </div>
    ),
  },
  {
    id: "looks",
    title: "Looks, sizes and sound",
    blurb: "Sharing sizes and tone, card themes, music for clips and older card templates.",
    icon: Palette,
    body: () => <Looks />,
  },
  {
    id: "fixtures",
    title: "Fixtures",
    blurb: "The fixtures cards are drafted from.",
    icon: Trophy,
    body: () => <AdminFixtures />,
  },
];
