/**
 * Posting calendar UI (plan 2026-10-07-003, U6 + U7): the week grid's cap
 * warning, moving a card with "Move to…", the posting schedule dialog, and the
 * auto-post card deferring to the calendar. fetch is stubbed per path and method.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type {
  PostingSchedule,
  SocialCalendar,
  SocialCalendarCard,
  SocialDraft,
  SocialSettings,
} from "@workspace/api-client-react";
import { WeekGrid } from "@/components/social-calendar/week-grid";
import { SocialCalendarView } from "@/components/social-calendar/social-calendar-view";
import { PostingScheduleDialog } from "@/components/social-queue/posting-schedule-card";
import { AutoPostCard } from "@/components/social-queue/auto-post-card";
import {
  clubDay,
  clubInstant,
  mondayOf,
  weekDays,
} from "@/components/social-calendar/calendar-time";
import { renderAt } from "@/test/render";

type Handler = (body: unknown) => unknown;
type Calls = { method: string; path: string; body: unknown }[];

function stubApi(routes: Record<string, Handler | unknown>): Calls {
  const calls: Calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url, body });
      const key = Object.keys(routes).find((k) => {
        const [m, p] = k.split(" ");
        return m === method && url.includes(p);
      });
      const route = key ? routes[key] : undefined;
      const payload = typeof route === "function" ? (route as Handler)(body) : (route ?? []);
      return new Response(JSON.stringify(payload ?? null), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const today = clubDay(new Date());
const days = weekDays(mondayOf(today));
// The week's Sunday, late: still ahead of "now" for all but the last minutes of the week.
const cardDay = days[6];

function card(id: number, at: Date, over: Partial<SocialDraft> = {}): SocialCalendarCard {
  return {
    draft: {
      id,
      engine: "milestone",
      status: "ready",
      cardInput: { kind: "milestone", playerName: `Player ${id}` },
      plannedAt: at.toISOString(),
      plannedBy: "auto",
      publications: [],
      ...over,
    } as unknown as SocialDraft,
    slotKind: "milestones",
    overdue: false,
    warning: null,
  };
}

const slots = (day: number, time: string) => ({
  slots: [{ day, time }],
  collision: "space" as const,
});
const SCHEDULE: PostingSchedule = {
  enabled: false,
  dailyCap: 4,
  minGapMinutes: 45,
  ageLimitDays: 7,
  kinds: {
    results: slots(0, "09:00"),
    roundResults: slots(0, "18:00"),
    teamLists: slots(4, "18:00"),
    gameDay: slots(6, "08:00"),
    milestones: slots(1, "18:00"),
    debuts: slots(2, "18:00"),
    achievements: slots(3, "18:00"),
    roundUp: slots(1, "19:00"),
    other: slots(5, "18:00"),
  },
};

describe("WeekGrid", () => {
  it("shows a day over the cap in words and places each card at its time", () => {
    const at = clubInstant(cardDay, 18 * 60);
    renderAt(
      <WeekGrid
        days={days}
        info={new Map([[cardDay, { date: cardDay, count: 3, overCap: true, gapWarnings: [] }]])}
        dailyCap={2}
        cards={[card(1, at)]}
        placeholders={[]}
        startMinutes={6 * 60}
        endMinutes={22 * 60}
        today={today}
        draggingId={null}
        onOpen={() => {}}
        onMoveTo={() => {}}
        onPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("3 / 2 posts — over the cap")).toBeTruthy();
    const open = screen.getByRole("button", { name: /^Player 1, .*Ready\. Open$/ });
    const slot = open.closest("[style]") as HTMLElement;
    expect(slot.style.top).toBe(`${(18 - 6) * 60}px`);
  });
});

describe("SocialCalendarView", () => {
  it("moves a card with Move to… and sends the time it expected", async () => {
    const at = clubInstant(cardDay, 20 * 60);
    const moving = card(7, at);
    const calendar: SocialCalendar = {
      enabled: true,
      from: days[0],
      to: days[6],
      timeZone: "Australia/Perth",
      dailyCap: 4,
      minGapMinutes: 45,
      days: days.map((date) => ({
        date,
        count: date === cardDay ? 1 : 0,
        overCap: false,
        gapWarnings: [],
      })),
      cards: [moving],
      unscheduled: [],
      placeholders: [],
      openCards: 0,
    };
    const calls = stubApi({
      "GET /social-calendar": calendar,
      "PUT /planned-time": (body: unknown) => ({
        ...moving,
        draft: { ...moving.draft, ...(body as object) },
      }),
    });
    renderAt(<SocialCalendarView view="list" schedule={SCHEDULE} onOpenDraft={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Move Player 7 to another time" }));
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: String(23 * 60 + 45) } });
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toContain("/social-drafts/7/planned-time");
    expect(put.body).toEqual({
      plannedAt: clubInstant(cardDay, 23 * 60 + 45).toISOString(),
      expectedPlannedAt: at.toISOString(),
    });
  });

  it("puts hand-made cards in the Unscheduled tray", async () => {
    const loose = card(9, new Date(), { plannedAt: null });
    stubApi({
      "GET /social-calendar": {
        enabled: true,
        from: days[0],
        to: days[6],
        timeZone: "Australia/Perth",
        dailyCap: 4,
        minGapMinutes: 45,
        days: [],
        cards: [],
        unscheduled: [loose],
        placeholders: [],
        openCards: 0,
      },
    });
    renderAt(<SocialCalendarView view="week" schedule={SCHEDULE} onOpenDraft={() => {}} />);
    expect(await screen.findByText("Unscheduled (1)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Player 9, no time/ })).toBeTruthy();
  });
});

describe("PostingScheduleDialog", () => {
  it("asks before turning the calendar on, then saves the schedule with a new time", async () => {
    const calls = stubApi({
      "PATCH /social-settings": (body: unknown) => ({
        ...(body as object),
        postingSwitchover: { placed: 3, pinned: 1, unscheduled: 0, restored: 0 },
      }),
    });
    renderAt(
      <PostingScheduleDialog open onOpenChange={() => {}} schedule={SCHEDULE} openCards={4} />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /Plan posts on a calendar/ }));
    fireEvent.change(screen.getByLabelText("Debuts: new posting day"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Debuts: new posting time"), {
      target: { value: "12:30" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add time" })[5]);
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(await screen.findByText(/4 cards waiting in the queue/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const sent = (
      calls.find((c) => c.method === "PATCH")!.body as { postingSchedule: PostingSchedule }
    ).postingSchedule;
    expect(sent.enabled).toBe(true);
    expect(sent.kinds.debuts.slots).toEqual([
      { day: 2, time: "18:00" },
      { day: 6, time: "12:30" },
    ]);
    expect(await screen.findByText("3 cards placed, 1 kept at their scheduled time.")).toBeTruthy();
  });

  it("won't save a daily cap outside 1–20", () => {
    stubApi({});
    renderAt(
      <PostingScheduleDialog open onOpenChange={() => {}} schedule={SCHEDULE} openCards={0} />,
    );
    fireEvent.change(screen.getByLabelText("Posts a day, at most"), { target: { value: "0" } });
    expect(screen.getByText("Between 1 and 20.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save schedule" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("AutoPostCard with the calendar on", () => {
  it("replaces the review window and cut-off with a note", () => {
    stubApi({ "GET /meta-connection": { available: false, status: "disconnected" } });
    const settings = {
      autoPostEnabled: true,
      autoPostWindowHours: 12,
      autoPublishEnabled: false,
      autoPublishFreshnessHours: 24,
      notificationEmail: null,
      postingSchedule: { ...SCHEDULE, enabled: true },
    } as unknown as SocialSettings;
    renderAt(<AutoPostCard settings={settings} />);
    expect(screen.getByRole("note").textContent).toMatch(/posting calendar is on/);
    expect(screen.queryByLabelText("Review window")).toBeNull();
    expect(screen.queryByLabelText("Only if imported within")).toBeNull();
  });
});
