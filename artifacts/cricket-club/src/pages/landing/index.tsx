import { Switch, Route } from "wouter";
import LandingPage from "./landing-page";
import SignupPage from "./signup-page";
import DirectoryPage from "./directory-page";
import { PlatformAdminRoutes } from "@/pages/platform-admin";

/**
 * The platform (apex/marketing) route tree, mounted by App when the host resolves
 * to platform mode (`GET /tenant-brand` → `{ platform: true }`) instead of a
 * tenant. Deliberately separate from the club app's PublicRoutes/AdminRoutes.
 */
export function LandingRoutes() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/directory" component={DirectoryPage} />
      <Route path="/clubs" component={DirectoryPage} />
      <Route path="/signup" component={SignupPage} />
      {/* The super-admin console (gated by the platform session). */}
      <Route path="/platform-admin/*" component={PlatformAdminRoutes} />
      <Route path="/platform-admin" component={PlatformAdminRoutes} />
      <Route component={LandingPage} />
    </Switch>
  );
}
