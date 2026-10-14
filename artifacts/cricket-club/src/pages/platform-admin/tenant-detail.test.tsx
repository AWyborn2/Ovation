/**
 * Platform-admin tenant page: the junior sync card lists the grades the sync couldn't
 * classify as junior or senior (junior sync plan U4, KTD4), and shows nothing when there
 * are none.
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
  it("lists each unclassified grade with its season", async () => {
    stubApi({
      tenant: TENANT,
      admins: [],
      unclassifiedGrades: [
        {
          orgId: "4559f1b9-86d8-eb11-a7ad-2818780da0cc",
          grade: "Mixed Social Twilight",
          season: "Summer 2026/27",
          since: "2026-10-14T00:00:00.000Z",
        },
      ],
    });
    renderPage();
    const list = await screen.findByTestId("unclassified-grades");
    expect(within(list).getByText("Unclassified grades (1)")).toBeTruthy();
    expect(within(list).getByText(/Mixed Social Twilight/)).toBeTruthy();
    expect(within(list).getByText(/Summer 2026\/27/)).toBeTruthy();
  });

  it("shows no list when every grade was classified", async () => {
    stubApi({ tenant: TENANT, admins: [], unclassifiedGrades: [] });
    renderPage();
    await screen.findByText("Junior sync");
    expect(screen.queryByTestId("unclassified-grades")).toBeNull();
  });
});
