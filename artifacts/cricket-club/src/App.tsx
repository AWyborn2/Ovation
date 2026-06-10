import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { Layout } from "@/components/layout";
import { AdminShell } from "@/components/admin-shell";
import { useCurrentAdmin } from "@/lib/admin-auth";
import Home from "@/pages/home";
import HonourBoards from "@/pages/honour-boards";
import Players from "@/pages/players";
import PlayerDetail from "@/pages/player-detail";
import PersonDetail from "@/pages/person-detail";
import Matches from "@/pages/matches";
import MatchDetail from "@/pages/match-detail";
import Grades from "@/pages/grades";
import GradeLeaderboard from "@/pages/grade-leaderboard";
import Records from "@/pages/records";
import Premierships from "@/pages/premierships";
import HonoursDisplay from "@/pages/honours-display";
import HonoursKiosk from "@/pages/honours-kiosk";
import Compare from "@/pages/compare";
import StatDetail from "@/pages/stat-detail";
import JuniorsDashboard from "@/pages/juniors-dashboard";
import JuniorsMatches from "@/pages/juniors-matches";
import JuniorsMatchDetail from "@/pages/juniors-match-detail";
import JuniorsPremierships from "@/pages/juniors-premierships";
import JuniorsPlayers from "@/pages/juniors-players";
import JuniorsPlayerDetail from "@/pages/juniors-player-detail";
import JuniorsOfficeBearers from "@/pages/juniors-office-bearers";
import AdminHub from "@/pages/admin";
import AdminUsers from "@/pages/admin-users";
import AdminImport from "@/pages/admin-import";
import {
  AdminSocialGroup,
  AdminSettingsGroup,
  AdminPeopleGroup,
  AdminHonoursGroup,
} from "@/pages/admin-groups";
import CaptainPage from "@/pages/captain";
import CardRenderHarness from "@/pages/card-render-harness";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function PublicRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/honour-boards" component={HonourBoards} />
        <Route path="/players" component={Players} />
        <Route path="/players/:id" component={PlayerDetail} />
        <Route path="/people/:id" component={PersonDetail} />
        <Route path="/matches" component={Matches} />
        <Route path="/matches/:id" component={MatchDetail} />
        <Route path="/grades" component={Grades} />
        <Route path="/grades/:grade" component={GradeLeaderboard} />
        <Route path="/records" component={Records} />
        <Route path="/premierships" component={Premierships} />
        <Route path="/compare" component={Compare} />
        <Route path="/stats/:id" component={StatDetail} />
        <Route path="/juniors" component={JuniorsDashboard} />
        <Route path="/juniors/matches" component={JuniorsMatches} />
        <Route path="/juniors/matches/:id" component={JuniorsMatchDetail} />
        <Route path="/juniors/premierships" component={JuniorsPremierships} />
        <Route path="/juniors/players" component={JuniorsPlayers} />
        <Route path="/juniors/players/:id" component={JuniorsPlayerDetail} />
        <Route path="/juniors/office-bearers" component={JuniorsOfficeBearers} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AdminRoutes() {
  return (
    <Layout>
      <AdminShell>
        <Switch>
          <Route path="/admin" component={AdminHub} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/import" component={AdminImport} />

          {/* Trading cards moved from Settings into Social Media Studio; keep
              the old Settings URL working (must precede the settings group). */}
          <Route path="/admin/settings/trading-cards">
            <Redirect to="/admin/social/trading-cards" />
          </Route>

          {/* Consolidated tabbed groups (each tab is a deep-linkable path). */}
          <Route path="/admin/social/:tab?" component={AdminSocialGroup} />
          <Route path="/admin/settings/:tab?" component={AdminSettingsGroup} />
          <Route path="/admin/people/:tab?" component={AdminPeopleGroup} />
          <Route path="/admin/honours/:tab?" component={AdminHonoursGroup} />

          {/* Back-compat: old flat admin URLs redirect to their new group+tab
              so existing bookmarks and in-app cross-links keep working. */}
          <Route path="/admin/stats">
            <Redirect to="/admin/people/stats" />
          </Route>
          <Route path="/admin/players">
            <Redirect to="/admin/people/players" />
          </Route>
          <Route path="/admin/committee">
            <Redirect to="/admin/people/committee" />
          </Route>
          <Route path="/admin/captains">
            <Redirect to="/admin/people/captains" />
          </Route>
          <Route path="/admin/junior-committee">
            <Redirect to="/admin/people/junior-office-bearers" />
          </Route>
          <Route path="/admin/premierships">
            <Redirect to="/admin/honours/premierships" />
          </Route>
          <Route path="/admin/awards">
            <Redirect to="/admin/honours/awards" />
          </Route>
          <Route path="/admin/team-of-decade">
            <Redirect to="/admin/honours/team-of-decade" />
          </Route>
          <Route path="/admin/caps">
            <Redirect to="/admin/honours/caps" />
          </Route>
          <Route path="/admin/life-members">
            <Redirect to="/admin/honours/life-members" />
          </Route>
          <Route path="/admin/junior-premierships">
            <Redirect to="/admin/honours/junior-premierships" />
          </Route>
          <Route path="/admin/honour-boards">
            <Redirect to="/admin/settings/honour-boards" />
          </Route>
          <Route path="/admin/milestone-board">
            <Redirect to="/admin/settings/milestone-board" />
          </Route>
          <Route path="/admin/match-display">
            <Redirect to="/admin/settings/matches" />
          </Route>
          <Route path="/admin/records-display">
            <Redirect to="/admin/settings/records" />
          </Route>
          <Route path="/admin/trading-cards">
            <Redirect to="/admin/social/trading-cards" />
          </Route>
          <Route path="/admin/junior-match-display">
            <Redirect to="/admin/settings/junior-matches" />
          </Route>
          <Route path="/admin/nav">
            <Redirect to="/admin/settings/nav" />
          </Route>

          <Route component={NotFound} />
        </Switch>
      </AdminShell>
    </Layout>
  );
}

function CaptainRoutes() {
  return (
    <Layout>
      <CaptainPage />
    </Layout>
  );
}

/**
 * Gate admin-only public-chrome pages (honour display + kiosk). Non-admins are
 * redirected to the admin sign-in hub rather than shown the page.
 */
function AdminOnly({ children }: { children: ReactNode }) {
  const me = useCurrentAdmin();
  if (me.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!me.data) {
    return <Redirect to="/admin" />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/__card-render" component={CardRenderHarness} />
      <Route path="/honours-display/kiosk">
        <AdminOnly>
          <HonoursKiosk />
        </AdminOnly>
      </Route>
      <Route path="/honours-display">
        <Layout>
          <AdminOnly>
            <HonoursDisplay />
          </AdminOnly>
        </Layout>
      </Route>
      <Route path="/admin/*" component={AdminRoutes} />
      <Route path="/admin" component={AdminRoutes} />
      <Route path="/captain" component={CaptainRoutes} />
      <Route component={PublicRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
