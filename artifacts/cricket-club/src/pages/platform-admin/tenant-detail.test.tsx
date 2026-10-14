/**
 * Platform-admin tenant page: grades the junior sync can classify as neither junior nor senior
 * (junior sync plan U4, KTD4) are resolved on the platform Competitions screen (PlayHQ grade
 * decisions), which the junior sync card points to rather than keeping a second list.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Route } from "wouter";
import { screen, cleanup, within } from "@testing-library/react";
import type { AdminTenantDetail } from "@workspace/api-client-react";
import { renderAt } from "@/test/render";
import TenantDetail from "./tenant-detail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubApi(detail: AdminTenantDetail) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body: unknown = /\/platform\/admin\/tenants\/5$/.test(url) ? detail : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const TENANT = {
  id: 5,
  name: "Pinjarra CC",
  slug: "pinjarra",
  plan: "club",
  playhqOrgId: "4559f1b9-86d8-eb11-a7ad-2818780da0cc",
  playhqSyncEnabled: true,
  juniorSyncEnabled: true,
} as unknown as AdminTenantDetail["tenant"];

const renderPage = () =>
  renderAt(
    <Route path="/platform-admin/tenants/:id" component={TenantDetail} />,
    "/platform-admin/tenants/5",
  );

describe("tenant detail — unclassified grades", () => {
  it("points the junior sync card at the Competitions screen", async () => {
    stubApi({ tenant: TENANT, admins: [] });
    renderPage();
    const note = await screen.findByTestId("junior-unclassified-note");
    const link = within(note).getByRole("link", { name: "Competitions" });
    expect(link.getAttribute("href")).toBe("/platform-admin/grade-decisions");
  });

  it("keeps no second list of unclassified grades", async () => {
    stubApi({ tenant: TENANT, admins: [] });
    renderPage();
    await screen.findByText("Junior sync");
    expect(screen.queryByTestId("unclassified-grades")).toBeNull();
  });
});
