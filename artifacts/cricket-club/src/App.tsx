import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AdminShell } from "@/components/admin-shell";
import HonourBoards from "@/pages/honour-boards";
import Players from "@/pages/players";
import PlayerDetail from "@/pages/player-detail";
import Grades from "@/pages/grades";
import GradeLeaderboard from "@/pages/grade-leaderboard";
import Records from "@/pages/records";
import Premierships from "@/pages/premierships";
import Compare from "@/pages/compare";
import StatDetail from "@/pages/stat-detail";
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
import AdminSocial from "@/pages/admin-social";
import AdminSocialQueue from "@/pages/admin-social-queue";
import AdminMilestoneBoard from "@/pages/admin-milestone-board";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function PublicRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HonourBoards} />
        <Route path="/players" component={Players} />
        <Route path="/players/:id" component={PlayerDetail} />
        <Route path="/grades" component={Grades} />
        <Route path="/grades/:grade" component={GradeLeaderboard} />
        <Route path="/records" component={Records} />
        <Route path="/premierships" component={Premierships} />
        <Route path="/compare" component={Compare} />
        <Route path="/stats/:id" component={StatDetail} />
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
          <Route path="/admin/import" component={AdminImport} />
          <Route path="/admin/caps" component={AdminCaps} />
          <Route path="/admin/life-members" component={AdminLifeMembers} />
          <Route path="/admin/awards" component={AdminAwards} />
          <Route path="/admin/social" component={AdminSocial} />
          <Route path="/admin/social/queue" component={AdminSocialQueue} />
          <Route component={NotFound} />
        </Switch>
      </AdminShell>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin/:rest*" component={AdminRoutes} />
      <Route path="/admin" component={AdminRoutes} />
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
