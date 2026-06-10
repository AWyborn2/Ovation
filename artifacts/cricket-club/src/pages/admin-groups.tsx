import { useLocation } from "wouter";
import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AdminSocial from "@/pages/admin-social";
import AdminSocialCreate from "@/pages/admin-social-create";
import AdminJuniorSocial from "@/pages/admin-junior-social";
import AdminSocialQueue from "@/pages/admin-social-queue";
import AdminMatchDisplay from "@/pages/admin-match-display";
import AdminRecordsDisplay from "@/pages/admin-records-display";
import AdminTradingCards from "@/pages/admin-trading-cards";
import AdminHonourBoards from "@/pages/admin-honour-boards";
import AdminMilestoneBoard from "@/pages/admin-milestone-board";
import AdminJuniorMatchDisplay from "@/pages/admin-junior-match-display";
import AdminNav from "@/pages/admin-nav";
import AdminPlayers from "@/pages/admin-players";
import AdminStats from "@/pages/admin-stats";
import AdminCommittee from "@/pages/admin-committee";
import AdminCaptains from "@/pages/admin-captains";
import AdminJuniorCommittee from "@/pages/admin-junior-committee";
import AdminPeople from "@/pages/admin-people";
import AdminPremierships from "@/pages/admin-premierships";
import AdminAwards from "@/pages/admin-awards";
import AdminTeamOfDecade from "@/pages/admin-team-of-decade";
import AdminCaps from "@/pages/admin-caps";
import AdminLifeMembers from "@/pages/admin-life-members";
import AdminJuniorPremierships from "@/pages/admin-junior-premierships";

type AdminTab = { value: string; label: string; path: string; element: ReactNode };

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
  const active =
    tabs.find(
      (t) =>
        t.path !== basePath &&
        (location === t.path || location.startsWith(`${t.path}/`)),
    )?.value ?? tabs[0].value;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      <Tabs
        value={active}
        onValueChange={(v) => {
          const t = tabs.find((x) => x.value === v);
          if (t) navigate(t.path);
        }}
      >
        <TabsList className="flex flex-wrap h-auto justify-start">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-6">
            {t.element}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export function AdminSocialGroup() {
  return (
    <AdminTabGroup
      title="Social Media"
      description="Branded share-card factory, card builders, junior cards and the review queue."
      basePath="/admin/social"
      tabs={[
        { value: "cards", label: "Cards", path: "/admin/social", element: <AdminSocial /> },
        { value: "create", label: "Create a card", path: "/admin/social/create", element: <AdminSocialCreate /> },
        { value: "juniors", label: "Junior cards", path: "/admin/social/juniors", element: <AdminJuniorSocial /> },
        { value: "queue", label: "Queue", path: "/admin/social/queue", element: <AdminSocialQueue /> },
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
        { value: "trading-cards", label: "Trading cards", path: "/admin/settings/trading-cards", element: <AdminTradingCards /> },
        { value: "honour-boards", label: "Honour boards", path: "/admin/settings/honour-boards", element: <AdminHonourBoards /> },
        { value: "milestone-board", label: "Milestone board", path: "/admin/settings/milestone-board", element: <AdminMilestoneBoard /> },
        { value: "junior-matches", label: "Junior matches", path: "/admin/settings/junior-matches", element: <AdminJuniorMatchDisplay /> },
        { value: "nav", label: "Navigation & menus", path: "/admin/settings/nav", element: <AdminNav /> },
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
        { value: "committee", label: "Committee", path: "/admin/people/committee", element: <AdminCommittee /> },
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
        { value: "premierships", label: "Premierships", path: "/admin/honours", element: <AdminPremierships /> },
        { value: "awards", label: "Awards", path: "/admin/honours/awards", element: <AdminAwards /> },
        { value: "team-of-decade", label: "Team of the Decade", path: "/admin/honours/team-of-decade", element: <AdminTeamOfDecade /> },
        { value: "caps", label: "Cap register", path: "/admin/honours/caps", element: <AdminCaps /> },
        { value: "life-members", label: "Life members", path: "/admin/honours/life-members", element: <AdminLifeMembers /> },
        { value: "junior-premierships", label: "Junior premierships", path: "/admin/honours/junior-premierships", element: <AdminJuniorPremierships /> },
      ]}
    />
  );
}
