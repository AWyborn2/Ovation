import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Players from "@/pages/players";
import PlayerDetail from "@/pages/player-detail";
import Grades from "@/pages/grades";
import GradeLeaderboard from "@/pages/grade-leaderboard";
import Records from "@/pages/records";
import StatDetail from "@/pages/stat-detail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/players" component={Players} />
        <Route path="/players/:id" component={PlayerDetail} />
        <Route path="/grades" component={Grades} />
        <Route path="/grades/:grade" component={GradeLeaderboard} />
        <Route path="/records" component={Records} />
        <Route path="/stats/:id" component={StatDetail} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
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
