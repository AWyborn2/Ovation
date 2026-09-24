import { useLocation } from "wouter";
import { lazy, Suspense, type ReactNode } from "react";
import { LoadingState } from "@/components/data-states";
import { UnderlineTabs } from "@/components/broadcast";
import { useEntitlements } from "@/lib/entitlements";
import { ADMIN_NAV, activeTab } from "@/lib/admin-nav";
const AdminSocial = lazy(() => import("@/pages/admin-social"));
const AdminSocialStudio = lazy(() => import("@/pages/admin-social-studio"));
const AdminSocialCreate = lazy(() => import("@/pages/admin-social-create"));
const AdminSocialSets = lazy(() => import("@/pages/admin-social-sets"));
const AdminJuniorSocial = lazy(() => import("@/pages/admin-junior-social"));
const AdminSocialQueue = lazy(() => import("@/pages/admin-social-queue"));
const AdminPhotoLibrary = lazy(() => import("@/pages/admin-photo-library"));
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

// Every tab page is a separate lazy chunk: opening one admin tab no longer
// downloads every admin page in a single bundle. Only the active tab's chunk
// loads.
//
// Shared tabbed page for an admin group. Titles, tabs, paths and plan gating
// come from lib/admin-nav.ts (the same source as the sidebar and breadcrumb);
// this module only maps each tab to its page. The active tab is driven by the
// URL, so each tab is deep-linkable, and only the active tab's panel mounts.
function AdminTabGroup({
  groupKey,
  pages,
}: {
  groupKey: string;
  pages: Record<string, ReactNode>;
}) {
  const [location, navigate] = useLocation();
  const entitlements = useEntitlements();
  const group = ADMIN_NAV.find((g) => g.key === groupKey)!;
  // Drop tabs the tenant's plan doesn't include, so a deep-link to a locked
  // tab falls back to the first visible one.
  const visibleTabs = group.tabs.filter((t) => !t.feature || entitlements[t.feature]);
  const tab = activeTab(location, { ...group, tabs: visibleTabs });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-[40px] font-bold uppercase leading-none">{group.label}</h1>
        {group.description && (
          <p className="max-w-[70ch] text-[15px] text-muted-foreground">{group.description}</p>
        )}
      </header>
      {!tab ? (
        <p className="text-muted-foreground">Upgrade your plan to unlock these tools.</p>
      ) : (
        <div>
          <UnderlineTabs
            label={group.label}
            tabs={visibleTabs.map((t) => ({ value: t.value, label: t.label }))}
            value={tab.value}
            onChange={(v) => {
              const next = visibleTabs.find((x) => x.value === v);
              if (next) navigate(next.path);
            }}
          />
          {/* Only the active tab mounts, so each page's queries fire only when opened. */}
          <div role="tabpanel" aria-label={tab.label} className="mt-6">
            <Suspense fallback={<LoadingState label="Loading…" />}>{pages[tab.value]}</Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminSocialGroup() {
  return (
    <AdminTabGroup
      groupKey="social"
      pages={{
        studio: <AdminSocialStudio />,
        cards: <AdminSocial />,
        create: <AdminSocialCreate />,
        sets: <AdminSocialSets />,
        fixtures: <AdminFixtures />,
        juniors: <AdminJuniorSocial />,
        "trading-cards": <AdminTradingCards />,
        queue: <AdminSocialQueue />,
        library: <AdminPhotoLibrary />,
      }}
    />
  );
}

export function AdminSettingsGroup() {
  return (
    <AdminTabGroup
      groupKey="settings"
      pages={{
        matches: <AdminMatchDisplay />,
        records: <AdminRecordsDisplay />,
        "honour-boards": <AdminHonourBoards />,
        "milestone-board": <AdminMilestoneBoard />,
        "junior-matches": <AdminJuniorMatchDisplay />,
        tour: <AdminTourContent />,
        nav: <AdminNav />,
        branding: <AdminBranding />,
      }}
    />
  );
}

export function AdminPeopleGroup() {
  return (
    <AdminTabGroup
      groupKey="people"
      pages={{
        players: <AdminPlayers />,
        stats: <AdminStats />,
        "junior-scorecards": <AdminJuniorStats />,
        "junior-players": <AdminJuniorPlayers />,
        committee: <AdminCommittee />,
        captains: <AdminCaptains />,
        "junior-office-bearers": <AdminJuniorCommittee />,
        "non-players": <AdminPeople />,
      }}
    />
  );
}

export function AdminHonoursGroup() {
  return (
    <AdminTabGroup
      groupKey="honours"
      pages={{
        premierships: <AdminPremierships />,
        awards: <AdminAwards />,
        "team-of-decade": <AdminTeamOfDecade />,
        caps: <AdminCaps />,
        "life-members": <AdminLifeMembers />,
        "junior-premierships": <AdminJuniorPremierships />,
        display: <AdminHonoursDisplay />,
      }}
    />
  );
}
