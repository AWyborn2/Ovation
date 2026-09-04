import { useLocation } from "wouter";
import { lazy, Suspense, type ReactNode } from "react";
import { LoadingState } from "@/components/data-states";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useEntitlements, type Feature } from "@/lib/entitlements";
const AdminSocial = lazy(() => import("@/pages/admin-social"));
const AdminSocialStudio = lazy(() => import("@/pages/admin-social-studio"));
const AdminSocialCreate = lazy(() => import("@/pages/admin-social-create"));
const AdminSocialSets = lazy(() => import("@/pages/admin-social-sets"));
const AdminJuniorSocial = lazy(() => import("@/pages/admin-junior-social"));
const AdminSocialQueue = lazy(() => import("@/pages/admin-social-queue"));
const AdminFixtures = lazy(() => import("@/pages/admin-fixtures"));
const AdminMatchDisplay = lazy(() => import("@/pages/admin-match-display"));
const AdminRecordsDisplay = lazy(() => import("@/pages/admin-records-display"));
const AdminTradingCards = lazy(() => import("@/pages/admin-trading-cards"));
const AdminHonourBoards = lazy(() => import("@/pages/admin-honour-boards"));
const AdminMilestoneBoard = lazy(() => import("@/pages/admin-milestone-board"));
const AdminJuniorMatchDisplay = lazy(() => import("@/pages/admin-junior-match-display"));
const AdminTourContent = lazy(() => import("@/pages/admin-tour-content"));
const AdminBranding = lazy(() => import("@/pages/admin-branding"));
const AdminNav = lazy(() => import("@/pages/admin-nav"));
const AdminPlayers = lazy(() => import("@/pages/admin-players"));
const AdminStats = lazy(() => import("@/pages/admin-stats"));
const AdminJuniorStats = lazy(() => import("@/pages/admin-junior-stats"));
const AdminJuniorPlayers = lazy(() => import("@/pages/admin-junior-players"));
const AdminCommittee = lazy(() => import("@/pages/admin-committee"));
const AdminCaptains = lazy(() => import("@/pages/admin-captains"));
const AdminJuniorCommittee = lazy(() => import("@/pages/admin-junior-committee"));
const AdminPeople = lazy(() => import("@/pages/admin-people"));
const AdminPremierships = lazy(() => import("@/pages/admin-premierships"));
const AdminAwards = lazy(() => import("@/pages/admin-awards"));
const AdminTeamOfDecade = lazy(() => import("@/pages/admin-team-of-decade"));
const AdminCaps = lazy(() => import("@/pages/admin-caps"));
const AdminLifeMembers = lazy(() => import("@/pages/admin-life-members"));
const AdminJuniorPremierships = lazy(() => import("@/pages/admin-junior-premierships"));
const AdminHonoursDisplay = lazy(() => import("@/pages/admin-honours-display"));

type AdminTab = {
  value: string;
  label: string;
  path: string;
  element: ReactNode;
  // Paid feature this tab belongs to. Hidden when the tenant's plan lacks it
  // (dormant ⇒ every feature resolves on, so nothing hides during the pilot).
  feature?: Feature;
};

// Every tab page is a separate lazy chunk: opening one admin tab no longer
// downloads every admin page (the honours display, social sets, card editors,
// import tooling, …) in a single ~MB bundle. Only the active tab's chunk loads.
// Shared tabbed shell for a consolidated admin group. The active tab is driven
// by the URL (the first tab lives at the group's base path; every other tab is
// a single path segment under it), so each tab is directly deep-linkable and the
// side-nav / hub can link straight to a specific tab. Inactive tab panels stay
// unmounted (Radix default) so each page's queries only fire when its tab opens.
function AdminTabGroup({
  title,
  description,
  basePath,
  tabs,
}: {
  title: string;
  description?: string;
  basePath: string;
  tabs: AdminTab[];
}) {
  const [location, navigate] = useLocation();
  const entitlements = useEntitlements();
  // Drop tabs the tenant's plan doesn't include, then resolve the active tab from
  // what's left so a deep-link to a locked tab falls back to the first visible one.
  const visibleTabs = tabs.filter((t) => !t.feature || entitlements[t.feature]);
  const active =
    visibleTabs.find(
      (t) =>
        t.path !== basePath &&
        (location === t.path || location.startsWith(`${t.path}/`)),
    )?.value ?? visibleTabs[0]?.value;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {visibleTabs.length === 0 ? (
        <p className="text-muted-foreground">
          Upgrade your plan to unlock these tools.
        </p>
      ) : (
        <Tabs
          value={active}
          onValueChange={(v) => {
            const t = visibleTabs.find((x) => x.value === v);
            if (t) navigate(t.path);
          }}
        >
          <TabsList className="flex flex-wrap h-auto justify-start">
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {visibleTabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-6">
              <Suspense fallback={<LoadingState label="Loading…" />}>{t.element}</Suspense>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

export function AdminSocialGroup() {
  return (
    <AdminTabGroup
      title="Social Media Studio"
      description="Branded share-card factory, card builders, junior cards and the review queue."
      basePath="/admin/social"
      tabs={[
        { value: "studio", label: "Studio", path: "/admin/social", element: <AdminSocialStudio />, feature: "socialStudio" },
        { value: "cards", label: "Cards", path: "/admin/social/cards", element: <AdminSocial />, feature: "socialStudio" },
        { value: "create", label: "Create a card", path: "/admin/social/create", element: <AdminSocialCreate />, feature: "socialStudio" },
        { value: "sets", label: "Carousel sets", path: "/admin/social/sets", element: <AdminSocialSets />, feature: "socialStudio" },
        { value: "fixtures", label: "Fixtures", path: "/admin/social/fixtures", element: <AdminFixtures />, feature: "socialStudio" },
        { value: "juniors", label: "Junior cards", path: "/admin/social/juniors", element: <AdminJuniorSocial />, feature: "socialStudio" },
        { value: "trading-cards", label: "Trading cards", path: "/admin/social/trading-cards", element: <AdminTradingCards />, feature: "socialStudio" },
        { value: "queue", label: "Queue", path: "/admin/social/queue", element: <AdminSocialQueue />, feature: "socialStudio" },
      ]}
    />
  );
}

export function AdminSettingsGroup() {
  return (
    <AdminTabGroup
      title="Display & Settings"
      description="Defaults and display options for the public pages, plus site navigation."
      basePath="/admin/settings"
      tabs={[
        { value: "matches", label: "Matches page", path: "/admin/settings", element: <AdminMatchDisplay /> },
        { value: "records", label: "Records page", path: "/admin/settings/records", element: <AdminRecordsDisplay /> },
        { value: "honour-boards", label: "Honour boards", path: "/admin/settings/honour-boards", element: <AdminHonourBoards />, feature: "curation" },
        { value: "milestone-board", label: "Milestone board", path: "/admin/settings/milestone-board", element: <AdminMilestoneBoard />, feature: "curation" },
        { value: "junior-matches", label: "Junior matches", path: "/admin/settings/junior-matches", element: <AdminJuniorMatchDisplay /> },
        { value: "tour", label: "Welcome & tour", path: "/admin/settings/tour", element: <AdminTourContent /> },
        { value: "nav", label: "Navigation & menus", path: "/admin/settings/nav", element: <AdminNav /> },
        { value: "branding", label: "Branding", path: "/admin/settings/branding", element: <AdminBranding /> },
      ]}
    />
  );
}

export function AdminPeopleGroup() {
  return (
    <AdminTabGroup
      title="People"
      description="Players, stats, committee, captains and club officials."
      basePath="/admin/people"
      tabs={[
        { value: "players", label: "Players", path: "/admin/people", element: <AdminPlayers /> },
        { value: "stats", label: "Stats", path: "/admin/people/stats", element: <AdminStats /> },
        { value: "junior-scorecards", label: "Junior scorecards", path: "/admin/people/junior-scorecards", element: <AdminJuniorStats /> },
        { value: "junior-players", label: "Junior players", path: "/admin/people/junior-players", element: <AdminJuniorPlayers /> },
        { value: "committee", label: "Committee", path: "/admin/people/committee", element: <AdminCommittee />, feature: "curation" },
        { value: "captains", label: "Captains", path: "/admin/people/captains", element: <AdminCaptains /> },
        { value: "junior-office-bearers", label: "Junior office bearers", path: "/admin/people/junior-office-bearers", element: <AdminJuniorCommittee /> },
        { value: "non-players", label: "Non-player people", path: "/admin/people/non-players", element: <AdminPeople /> },
      ]}
    />
  );
}

export function AdminHonoursGroup() {
  return (
    <AdminTabGroup
      title="Honours & Records"
      description="Premierships, awards, Team of the Decade, caps, life members and junior premierships."
      basePath="/admin/honours"
      tabs={[
        { value: "premierships", label: "Premierships", path: "/admin/honours", element: <AdminPremierships />, feature: "curation" },
        { value: "awards", label: "Awards", path: "/admin/honours/awards", element: <AdminAwards />, feature: "curation" },
        { value: "team-of-decade", label: "Team of the Decade", path: "/admin/honours/team-of-decade", element: <AdminTeamOfDecade />, feature: "curation" },
        { value: "caps", label: "Cap register", path: "/admin/honours/caps", element: <AdminCaps />, feature: "curation" },
        { value: "life-members", label: "Life members", path: "/admin/honours/life-members", element: <AdminLifeMembers />, feature: "curation" },
        { value: "junior-premierships", label: "Junior premierships", path: "/admin/honours/junior-premierships", element: <AdminJuniorPremierships /> },
        { value: "display", label: "Display & kiosk", path: "/admin/honours/display", element: <AdminHonoursDisplay />, feature: "clubroomTv" },
      ]}
    />
  );
}
