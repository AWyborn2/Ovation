/**
 * New Studio's Queue (studio-create-consolidation S7): a Seniors / Juniors filter,
 * shown only with the club's New Studio switch on. A draft is junior by either
 * marker; one with neither (a sponsor card) counts as senior.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { renderWithHistory } from "@/test/render";
import {
  clubDay,
  clubInstant,
  mondayOf,
  weekDays,
} from "@/components/social-calendar/calendar-time";

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

const SCHEDULE_ON = {
  enabled: true,
  dailyCap: 4,
  minGapMinutes: 45,
  ageLimitDays: 7,
  kinds: Object.fromEntries(
    [
      "results",
      "roundResults",
      "teamLists",
      "gameDay",
      "milestones",
      "debuts",
      "achievements",
      "roundUp",
      "other",
    ].map((k) => [k, { slots: [{ day: 4, time: "18:00" }], collision: "space" }]),
  ),
};
const week = weekDays(mondayOf(clubDay(new Date())));
// The week's Sunday evening: in the week on show for all but its last hours.
const at = clubInstant(week[6]!, 20 * 60).toISOString();
const calCard = (d: typeof SENIOR) => ({
  draft: {
    ...d,
    cardInput: { ...d.cardInput, headline: `${d.cardInput.gradeRound} card` },
    status: "ready",
    plannedAt: at,
    plannedBy: "auto",
    publications: [],
  },
  slotKind: "teamLists",
  overdue: false,
  warning: null,
});

function stubApi(newStudio: boolean, calendar = false) {
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
      else if (/social-calendar/.test(url))
        payload = {
          enabled: true,
          from: week[0],
          to: week[6],
          timeZone: "Australia/Perth",
          dailyCap: 4,
          minGapMinutes: 45,
          days: week.map((date) => ({ date, count: 0, overCap: false, gapWarnings: [] })),
          cards: [calCard(SENIOR), calCard(JUNIOR)],
          unscheduled: [],
          placeholders: [],
          openCards: 0,
        };
      else if (/social-settings/.test(url))
        payload = {
          settings: {
            clubUrl: "",
            familyConfig: {},
            ...(calendar ? { postingSchedule: SCHEDULE_ON } : {}),
          },
          captionTemplates: [],
        };
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

  it("keeps the chosen view in the URL, and offers Teams in the calendar view too", async () => {
    stubApi(true, true);
    const { url } = render("/admin/social/queue");
    const views = await screen.findByRole("group", { name: "Queue view" });
    // The calendar view (List on a narrow screen) has the Teams filter too.
    const teams = (await screen.findByLabelText("Teams")) as HTMLSelectElement;
    expect(await screen.findAllByText("YEAR 6 card")).not.toHaveLength(0);
    fireEvent.change(teams, { target: { value: "senior" } });
    expect(screen.queryAllByText("YEAR 6 card")).toHaveLength(0);
    expect(screen.getAllByText("A GRADE card")).not.toHaveLength(0);
    fireEvent.click(within(views).getByRole("button", { name: "Table" }));
    expect(url()).toBe("/admin/social/queue?team=senior&view=table");
    cleanup();
    // A reload at that URL opens the table again.
    render("/admin/social/queue?view=table");
    const reloaded = await screen.findByRole("group", { name: "Queue view" });
    expect(
      within(reloaded).getByRole("button", { name: "Table" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("isn't there with the switch off", async () => {
    stubApi(false);
    render("/admin/social/queue?team=junior");
    expect(await screen.findAllByText(/adhoc ·/)).toHaveLength(2);
    expect(screen.queryByLabelText("Teams")).toBeNull();
  });

  // Dev retest (17 Nov 2026): "List view looks the same as Week view". List is
  // the day-by-day list (one block a day, posts in time order, "Move to…");
  // Week is the 7-day time grid with drag and drop.
  it("draws List as a list of days, and Week as the time grid", async () => {
    stubApi(true, true);
    render("/admin/social/queue?view=week");
    const views = await screen.findByRole("group", { name: "Queue view" });
    await screen.findAllByText("A GRADE card");
    expect(screen.queryByRole("list", { name: "Posts by day" })).toBeNull();
    fireEvent.click(within(views).getByRole("button", { name: "List" }));
    const days = await screen.findByRole("list", { name: "Posts by day" });
    expect(within(days).getAllByRole("heading", { level: 3 })).toHaveLength(7);
  });
});
