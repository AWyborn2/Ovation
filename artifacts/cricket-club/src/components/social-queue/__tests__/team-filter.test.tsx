/**
 * New Studio's Queue (studio-create-consolidation S7): a Seniors / Juniors filter,
 * shown only with the club's New Studio switch on. A draft is junior by either
 * marker; one with neither (a sponsor card) counts as senior.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { renderWithHistory } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = {
  engine: "adhoc",
  family: "matchday",
  status: "awaiting_review",
  appPath: null,
  trackedSlug: null,
  sourceMatchIsJunior: false,
  caption: "x",
  photoUrl: null,
  photoSource: null,
  staleSince: null,
  createdAt: "2026-10-29T01:00:00Z",
  packId: "blank",
  templateVersion: 2,
  layoutCheckPending: false,
  layoutWarnings: null,
};
const SENIOR = {
  ...base,
  id: 1,
  cardInput: { kind: "teamList", gradeRound: "A GRADE", opponent: "Mandurah" },
};
const JUNIOR = {
  ...base,
  id: 2,
  sourceMatchIsJunior: true,
  cardInput: { kind: "teamList", junior: true, gradeRound: "YEAR 6", opponent: "Eagles" },
};

function stubApi(newStudio: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      let payload: unknown = [];
      if (/tenant-plan/.test(url))
        payload = {
          plan: "club",
          newStudio,
          entitlements: { socialStudio: true, juniors: true },
        };
      else if (/pending-count/.test(url)) payload = { count: 2 };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [SENIOR, JUNIOR];
      else if (/social-settings/.test(url))
        payload = { settings: { clubUrl: "", familyConfig: {} }, captionTemplates: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const render = (path: string) =>
  renderWithHistory(
    <ConfirmProvider>
      <AdminSocialQueue />
    </ConfirmProvider>,
    path,
  );

describe("Queue team filter", () => {
  it("filters to Juniors or Seniors, kept in the URL", async () => {
    stubApi(true);
    const { url } = render("/admin/social/queue");
    const teams = (await screen.findByLabelText("Teams")) as HTMLSelectElement;
    // Each row's source line reads "adhoc · <when>".
    expect(await screen.findAllByText(/adhoc ·/)).toHaveLength(2);
    fireEvent.change(teams, { target: { value: "junior" } });
    expect(url()).toBe("/admin/social/queue?team=junior");
    expect(screen.getAllByText(/adhoc ·/)).toHaveLength(1);
    expect(screen.getByText("Junior")).toBeInTheDocument();
    fireEvent.change(teams, { target: { value: "senior" } });
    expect(screen.getAllByText(/adhoc ·/)).toHaveLength(1);
    expect(screen.queryByText("Junior")).toBeNull();
  });

  it("isn't there with the switch off", async () => {
    stubApi(false);
    render("/admin/social/queue?team=junior");
    expect(await screen.findAllByText(/adhoc ·/)).toHaveLength(2);
    expect(screen.queryByLabelText("Teams")).toBeNull();
  });
});
