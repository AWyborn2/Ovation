import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AdminShell } from "@/components/admin-shell";
import Home from "@/pages/home";
import HonourBoards from "@/pages/honour-boards";
import Players from "@/pages/players";
import PlayerDetail from "@/pages/player-detail";
import Matches from "@/pages/matches";
import MatchDetail from "@/pages/match-detail";
import Grades from "@/pages/grades";
import GradeLeaderboard from "@/pages/grade-leaderboard";
import Records from "@/pages/records";
import Premierships from "@/pages/premierships";
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
import AdminStats from "@/pages/admin-stats";
import AdminPlayers from "@/pages/admin-players";
import AdminPremierships from "@/pages/admin-premierships";
import AdminHonourBoards from "@/pages/admin-honour-boards";
import AdminImport from "@/pages/admin-import";
import AdminCaps from "@/pages/admin-caps";
import AdminLifeMembers from "@/pages/admin-life-members";
import AdminAwards from "@/pages/admin-awards";
import AdminTeamOfDecade from "@/pages/admin-team-of-decade";
import AdminSocial from "@/pages/admin-social";
import AdminSocialCreate from "@/pages/admin-social-create";
import AdminJuniorSocial from "@/pages/admin-junior-social";
import AdminSocialQueue from "@/pages/admin-social-queue";
import AdminMilestoneBoard from "@/pages/admin-milestone-board";
import AdminMatchDisplay from "@/pages/admin-match-display";
import AdminRecordsDisplay from "@/pages/admin-records-display";
import AdminJuniorMatchDisplay from "@/pages/admin-junior-match-display";
import AdminCaptains from "@/pages/admin-captains";
import AdminCommittee from "@/pages/admin-committee";
import AdminJuniorCommittee from "@/pages/admin-junior-committee";
import AdminNav from "@/pages/admin-nav";
import CaptainPage from "@/pages/captain";
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
          <Route path="/admin/stats" component={AdminStats} />
          <Route path="/admin/players" component={AdminPlayers} />
          <Route path="/admin/premierships" component={AdminPremierships} />
          <Route path="/admin/honour-boards" component={AdminHonourBoards} />
          <Route path="/admin/milestone-board" component={AdminMilestoneBoard} />
          <Route path="/admin/match-display" component={AdminMatchDisplay} />
          <Route path="/admin/records-display" component={AdminRecordsDisplay} />
          <Route path="/admin/junior-match-display" component={AdminJuniorMatchDisplay} />
          <Route path="/admin/import" component={AdminImport} />
          <Route path="/admin/caps" component={AdminCaps} />
          <Route path="/admin/life-members" component={AdminLifeMembers} />
          <Route path="/admin/awards" component={AdminAwards} />
          <Route path="/admin/team-of-decade" component={AdminTeamOfDecade} />
          <Route path="/admin/captains" component={AdminCaptains} />
          <Route path="/admin/committee" component={AdminCommittee} />
          <Route
            path="/admin/junior-committee"
            component={AdminJuniorCommittee}
          />
          <Route path="/admin/social" component={AdminSocial} />
          <Route path="/admin/social/create" component={AdminSocialCreate} />
          <Route path="/admin/social/juniors" component={AdminJuniorSocial} />
          <Route path="/admin/social/queue" component={AdminSocialQueue} />
          <Route path="/admin/nav" component={AdminNav} />
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

function Router() {
  return (
    <Switch>
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
