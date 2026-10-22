import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { PlatformAdminShell } from "@/components/platform-admin-shell";
import TenantsList from "./tenants-list";
import TenantDetail from "./tenant-detail";
import HistoryImportPage from "./history-import";
import ProvisionTenant from "./provision";
import PlatformBrand from "./platform-brand";
import ProvisioningExclusions from "./provisioning-exclusions";
import PlayhqSyncPage from "./playhq-sync";
import PlayerPrivacyPage from "./player-privacy";
import GradeDecisionsPage from "./grade-decisions";
import LibraryPage from "./library";
import AiDesignerPage from "./ai-designer";
import LibraryElementsPage from "./library-elements";

const LibraryEditorPage = lazy(() => import("./library-editor"));

/**
 * The platform-admin (super-admin) console, mounted on the apex host inside
 * LandingRoutes at /platform-admin/*. Gated by the platform session via
 * PlatformAdminShell; absolute paths so it nests under the apex route tree.
 */
export function PlatformAdminRoutes() {
  return (
    <Switch>
      {/* Editor v2 is full screen, so it skips the console layout (still behind the platform session). */}
      <Route path="/platform-admin/library/:id/edit">
        <PlatformAdminShell bare>
          <Suspense fallback={null}>
            <LibraryEditorPage />
          </Suspense>
        </PlatformAdminShell>
      </Route>
      <Route>
        <ConsoleRoutes />
      </Route>
    </Switch>
  );
}

function ConsoleRoutes() {
  return (
    <PlatformAdminShell>
      <Switch>
        <Route path="/platform-admin" component={TenantsList} />
        <Route path="/platform-admin/brand" component={PlatformBrand} />
        <Route path="/platform-admin/provision" component={ProvisionTenant} />
        <Route path="/platform-admin/provisioning-exclusions" component={ProvisioningExclusions} />
        <Route path="/platform-admin/playhq-sync" component={PlayhqSyncPage} />
        <Route path="/platform-admin/player-privacy" component={PlayerPrivacyPage} />
        <Route path="/platform-admin/grade-decisions" component={GradeDecisionsPage} />
        <Route path="/platform-admin/library" component={LibraryPage} />
        <Route path="/platform-admin/designer" component={AiDesignerPage} />
        <Route path="/platform-admin/elements" component={LibraryElementsPage} />
        <Route path="/platform-admin/tenants/:id/history-import" component={HistoryImportPage} />
        <Route path="/platform-admin/tenants/:id" component={TenantDetail} />
      </Switch>
    </PlatformAdminShell>
  );
}
