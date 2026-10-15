/**
 * The Posting Plan tab (plan 2026-10-07-001 U6): styles, rows, grade picker,
 * first visit, central-only carousels, saving and the phone layout.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { SocialSettings } from "@workspace/api-client-react";
import {
  POSTING_ROWS,
  findPostingStyle,
  planFromStyle,
  type PostingPlan,
} from "@workspace/scorecard/posting-plan";
import { PostingPlanEditor } from "@/components/posting-plan/posting-plan-editor";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GRADES = ["A Grade", "B Grade", "Female A Grade", "Under 16"];

function settings(over: Partial<{ plan: PostingPlan; saved: boolean; central: boolean }> = {}) {
  const plan = over.plan ?? planFromStyle(findPostingStyle("every-match")!);
  return {
    postingPlan: plan,
    postingPlanSaved: over.saved ?? true,
    centralData: over.central ?? true,
    roundSchedules: {
      gameDay: { mode: "perFixture", day: 4, hour: 18 },
      teamLists: { mode: "perFixture", day: 5, hour: 12 },
      weekendWrap: { mode: "off", day: 0, hour: 19 },
    },
  } as unknown as SocialSettings;
}

function stubPatch(reply: (body: unknown) => Response = () => json({})) {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return reply(body);
      }
      return json({});
    }),
  );
  return bodies;
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

const table = () => screen.getByRole("table");
/** A row's plain-words summary, read inside that row of the desktop table. */
const summaryOf = (label: string) => {
  const cell = within(table()).getByText(label, { selector: "p.font-medium" });
  return cell.closest("tr")!.querySelector("p.text-xs")!.textContent;
};
const render = (s: SocialSettings) =>
  renderAt(<PostingPlanEditor settings={s} grades={GRADES} />, "/admin/social/plan");

describe("Posting Plan", () => {
  it("shows one row per card kind with a plain-words sentence", () => {
    render(settings());
    const rows = within(table()).getAllByRole("row");
    expect(rows).toHaveLength(POSTING_ROWS.length + 1);
    expect(summaryOf("Results")).toBe("all senior grades · each on its own");
    expect(summaryOf("Ladders")).toBe("off");
  });

  it("choosing a style fills every row; editing one makes it custom", () => {
    render(settings());
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "round-carousels" } });
    expect(summaryOf("Results")).toBe("all senior grades · one round carousel");
    expect(screen.getByText("Using “Round carousels + individual highlights”")).toBeTruthy();
    fireEvent.click(
      within(table()).getByRole("switch", { name: "Milestones: draft automatically" }),
    );
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
  });

  it("asks before a style replaces a custom plan, and cancel keeps the edits", async () => {
    const plan = planFromStyle(findPostingStyle("every-match")!);
    plan.rows.milestones = { ...plan.rows.milestones, enabled: false };
    render(settings({ plan }));
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "results-only" } });
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/This replaces your own choices/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(summaryOf("Game day")).toBe("all senior grades · each on its own");
  });

  it("offers only the packaging each row supports", () => {
    render(settings());
    expect(within(table()).queryByLabelText("Milestones: post as")).toBeNull();
    const teamLists = within(table()).getByLabelText("Team lists: post as") as HTMLSelectElement;
    expect(Array.from(teamLists.options).map((o) => o.value)).toEqual(["individual", "round"]);
  });

  it("keeps results, ladder and leaderboard carousels to central clubs", () => {
    render(settings({ central: false }));
    const results = within(table()).getByLabelText("Results: post as") as HTMLSelectElement;
    const round = Array.from(results.options).find((o) => o.value === "round")!;
    expect(round.disabled).toBe(true);
    const teamLists = within(table()).getByLabelText("Team lists: post as") as HTMLSelectElement;
    expect(Array.from(teamLists.options).every((o) => !o.disabled)).toBe(true);
    expect(
      (
        within(table()).getByRole("switch", {
          name: "Ladders: draft automatically",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(table()).getAllByText(/association database/).length).toBeGreaterThan(0);
  });

  it("saves the whole plan in one request and shows the API's error", async () => {
    const bodies = stubPatch(() =>
      json({ error: "Milestones can't be posted as one round carousel." }, 400),
    );
    render(settings());
    fireEvent.click(within(table()).getByRole("switch", { name: "Ladders: draft automatically" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = (bodies[0] as { postingPlan: PostingPlan }).postingPlan;
    expect(Object.keys(sent.rows)).toEqual([...POSTING_ROWS]);
    expect(sent.rows.ladders.enabled).toBe(true);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Milestones can't be posted as one round carousel.",
    );
  });

  it("first visit: a style fills the rows unsaved; keeping current settings saves them", async () => {
    const bodies = stubPatch();
    render(settings({ saved: false }));
    expect(screen.getByText("Choose how your club posts")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Round carousels \+ individual highlights/ }),
    );
    expect(screen.queryByText("Choose how your club posts")).toBeNull();
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy();
    expect(bodies).toHaveLength(0);

    cleanup();
    const bodies2 = stubPatch();
    render(settings({ saved: false }));
    fireEvent.click(screen.getByRole("button", { name: /Keep my current settings/ }));
    await waitFor(() => expect(bodies2).toHaveLength(1));
    expect((bodies2[0] as { postingPlan: PostingPlan }).postingPlan.styleId).toBe("every-match");
  });

  it("grade picker: A Grade only, chosen grades, and the junior note", () => {
    render(settings());
    const picker = within(table()).getByLabelText("Debuts: grades");
    fireEvent.change(picker, { target: { value: "aGradeOnly" } });
    expect(summaryOf("Debuts")).toBe("A Grade only · each on its own");
    fireEvent.change(within(table()).getByLabelText("Results: grades"), {
      target: { value: "custom" },
    });
    const box = within(table()).getByLabelText("Under 16") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(
      within(table()).getByText(
        "Junior cards post as their own carousel and are never auto-published.",
      ),
    ).toBeTruthy();
  });

  it("phone layout: summary cards, one open at a time", () => {
    render(settings());
    const list = screen.getByRole("list", { name: "Posting Plan" });
    const [results, milestones] = within(list).getAllByRole("button", { expanded: false });
    fireEvent.click(results);
    expect(results.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(milestones);
    expect(results.getAttribute("aria-expanded")).toBe("false");
    expect(milestones.getAttribute("aria-expanded")).toBe("true");
  });
});
