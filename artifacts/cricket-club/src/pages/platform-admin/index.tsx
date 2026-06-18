import { Switch, Route } from "wouter";
import { PlatformAdminShell } from "@/components/platform-admin-shell";
import TenantsList from "./tenants-list";
import TenantDetail from "./tenant-detail";
import ProvisionTenant from "./provision";

/**
 * The platform-admin (super-admin) console, mounted on the apex host inside
 * LandingRoutes at /platform-admin/*. Gated by the platform session via
 * PlatformAdminShell; absolute paths so it nests under the apex route tree.
 */
export function PlatformAdminRoutes() {
  return (
    <PlatformAdminShell>
      <Switch>
        <Route path="/platform-admin" component={TenantsList} />
        <Route path="/platform-admin/provision" component={ProvisionTenant} />
        <Route path="/platform-admin/tenants/:id" component={TenantDetail} />
      </Switch>
    </PlatformAdminShell>
  );
}
